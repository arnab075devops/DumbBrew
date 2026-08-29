import { z } from "zod";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

const indianPhoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v), {
    message: "must be a 10-digit Indian mobile number, optionally prefixed with +91"
  })
  .transform((v) => (v.startsWith("+91") ? v : `+91${v}`));

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,24}$/, "3-24 characters: letters, numbers, underscore only"),
  phone: indianPhoneSchema,
  password: z.string().min(8, "must be at least 8 characters"),
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "you must accept the Terms & Conditions and Data Storage Policy" }) }),
  termsVersion: z.string()
});

type ConflictField = "email" | "username" | "phone";

async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${config.supabaseUrl}/rest/v1/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

async function findConflict(email: string, username: string, phone: string): Promise<ConflictField | null> {
  const res = await supabaseRequest(
    `customers?or=(email.eq.${encodeURIComponent(email)},username.eq.${encodeURIComponent(username)},phone_number.eq.${encodeURIComponent(phone)})&select=email,username,phone_number`
  );
  if (!res.ok) throw new Error(`supabase conflict check http ${res.status}`);
  const rows: Array<{ email: string; username: string; phone_number: string }> = await res.json();
  const hit = rows[0];
  if (!hit) return null;
  if (hit.email === email) return "email";
  if (hit.username === username) return "username";
  return "phone";
}

async function createAuthentikUser(email: string, username: string, password: string): Promise<string> {
  const createRes = await fetch(`${config.authentikUrl}/api/v3/core/users/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authentikApiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, email, name: username, is_active: true })
  });
  if (!createRes.ok) {
    throw new Error(`authentik user create http ${createRes.status}: ${await createRes.text()}`);
  }
  const user = await createRes.json();
  const pk: number = user.pk;
  const uuid: string = user.uuid;

  const passRes = await fetch(`${config.authentikUrl}/api/v3/core/users/${pk}/set_password/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authentikApiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });
  if (!passRes.ok) {
    // Compensate: don't leave a passwordless account behind.
    await deleteAuthentikUser(pk).catch(() => {});
    throw new Error(`authentik set_password http ${passRes.status}`);
  }

  return uuid;
}

async function deleteAuthentikUser(pk: number): Promise<void> {
  await fetch(`${config.authentikUrl}/api/v3/core/users/${pk}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.authentikApiToken}` }
  });
}

export async function registerCustomer(req: FastifyRequest, reply: FastifyReply) {
  if (!config.authentikApiToken || !config.supabaseUrl || !config.supabaseServiceRoleKey) {
    req.log.error("customer registration called but AUTHENTIK_API_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured");
    return reply.code(503).send({ error: "registration_unavailable" });
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  }
  const { password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const username = parsed.data.username;
  const phone = parsed.data.phone;

  if (parsed.data.termsVersion !== config.termsVersion) {
    return reply.code(400).send({ error: "stale_terms_version", currentVersion: config.termsVersion });
  }

  const conflict = await findConflict(email, username, phone);
  if (conflict) {
    return reply.code(409).send({ error: "already_registered", field: conflict });
  }

  let authentikUserId: string;
  try {
    authentikUserId = await createAuthentikUser(email, username, password);
  } catch (err) {
    req.log.error(err, "failed to create authentik user");
    return reply.code(502).send({ error: "identity_provider_error" });
  }

  const insertRes = await supabaseRequest("customers", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      id: authentikUserId,
      email,
      username,
      phone_number: phone,
      terms_accepted_at: new Date().toISOString(),
      terms_version: parsed.data.termsVersion
    })
  });

  if (!insertRes.ok) {
    // Rare race (unique constraint lost the race after our pre-check) —
    // don't leave an orphan Authentik account behind.
    const pkRes = await fetch(`${config.authentikUrl}/api/v3/core/users/?uuid=${authentikUserId}`, {
      headers: { Authorization: `Bearer ${config.authentikApiToken}` }
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const pk = pkRes?.results?.[0]?.pk;
    if (pk) await deleteAuthentikUser(pk).catch(() => {});

    req.log.error({ status: insertRes.status }, "failed to insert customer profile, rolled back authentik user");
    if (insertRes.status === 409) {
      return reply.code(409).send({ error: "already_registered", field: "unknown" });
    }
    return reply.code(500).send({ error: "internal_error" });
  }

  return reply.code(201).send({ ok: true });
}

const sessionSchema = z.object({ idToken: z.string().min(1) });

// Exchanges Authentik's id_token (from the browser's PKCE flow) for a
// Supabase-compatible JWT, so account.html can call PostgREST directly and
// have auth.uid() resolve to the same UUID customers.id was written with at
// registration time. See the config.ts comment for why this exists instead
// of Supabase's Third-Party Auth.
export async function createCustomerSession(req: FastifyRequest, reply: FastifyReply) {
  if (!config.authentikClientSecret || !config.supabaseJwtSecret) {
    req.log.error("customer session exchange called but AUTHENTIK_CLIENT_SECRET/SUPABASE_JWT_SECRET not configured");
    return reply.code(503).send({ error: "session_exchange_unavailable" });
  }

  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  }

  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(parsed.data.idToken, config.authentikClientSecret, {
      algorithms: ["HS256"],
      audience: config.authentikClientId,
      issuer: config.authentikIssuer || undefined
    }) as jwt.JwtPayload;
  } catch (err) {
    req.log.warn(err, "rejected invalid authentik id_token");
    return reply.code(401).send({ error: "invalid_id_token" });
  }

  if (typeof claims.sub !== "string") {
    return reply.code(401).send({ error: "invalid_id_token" });
  }

  const accessToken = jwt.sign(
    { sub: claims.sub, role: "authenticated" },
    config.supabaseJwtSecret,
    { audience: "authenticated", expiresIn: "1h" }
  );

  return reply.code(200).send({ access_token: accessToken, expires_in: 3600 });
}

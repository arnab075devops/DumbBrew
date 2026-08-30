import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signSellerToken } from "../lib/sellerJwt.js";

interface SellerAuthRow {
  id: string;
  email: string;
  password_hash: string | null;
  status: string;
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function sellerLogin(req: FastifyRequest, reply: FastifyReply) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
  const email = parsed.data.email.toLowerCase();

  const rows = await supabaseJson<SellerAuthRow[]>(
    `sellers?email=eq.${encodeURIComponent(email)}&select=id,email,password_hash,status&limit=1`
  );
  const seller = rows[0];
  // Always run argon2.verify even without a match, to avoid timing-based
  // enumeration of which emails have applied — same reasoning as
  // auth-service's admin login.
  const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$YWJjZGVmZ2hpams";
  const ok = seller?.password_hash
    ? await verifyPassword(seller.password_hash, parsed.data.password)
    : await verifyPassword(dummyHash, parsed.data.password).catch(() => false);
  if (!seller || !seller.password_hash || seller.status !== "approved" || !ok) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  const accessToken = signSellerToken(seller.id);
  return reply.send({ accessToken });
}

const resetSchema = z.object({ newPassword: z.string().min(8).max(200) });

export async function resetSellerPassword(req: FastifyRequest, reply: FastifyReply) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await supabaseRequest(`sellers?id=eq.${req.sellerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ password_hash: passwordHash, must_reset_password: false })
  });
  return reply.code(204).send();
}

export async function getMySeller(req: FastifyRequest, reply: FastifyReply) {
  const rows = await supabaseJson<unknown[]>(
    `sellers?id=eq.${req.sellerId}&select=id,store_name,description,status,owner_full_name,email,phone,address_line1,address_line2,city,state,pincode,gst_number,store_image_key,must_reset_password&limit=1`
  );
  return reply.send({ seller: (rows as any[])[0] ?? null });
}

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";

const SELLER_FIELDS =
  "id,store_name,description,status,is_house,applied_at,decided_at,decided_by,owner_full_name,email,phone,address_line1,address_line2,city,state,pincode,gst_number,store_image_key";

export async function listSellers(req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
  const status = req.query.status ?? "pending";
  if (!["pending", "approved", "rejected"].includes(status)) {
    return reply.code(400).send({ error: "invalid_status" });
  }
  const rows = await supabaseJson<unknown[]>(
    `sellers?status=eq.${status}&select=${SELLER_FIELDS}&order=applied_at.asc`
  );
  return reply.send({ sellers: rows });
}

const decisionSchema = z.object({ status: z.enum(["approved", "rejected"]) });

// Approving is also account-creation time: a seller has no login at all
// until this point (see supabase/schema.sql's sellers comment). The
// generated password is returned in this response ONLY — it's hashed before
// being stored and never retrievable again, same one-shot-reveal pattern as
// auth-service's seed-admin script. The admin is responsible for relaying it
// to the seller (no email-sending infra exists in this repo).
export async function decideSeller(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    decided_at: new Date().toISOString(),
    decided_by: req.admin?.email ?? "admin"
  };

  let generatedPassword: string | undefined;
  if (parsed.data.status === "approved") {
    generatedPassword = generateTempPassword();
    patch.password_hash = await hashPassword(generatedPassword);
    patch.must_reset_password = true;
  }

  const updated = await supabaseJson<any[]>(`sellers?id=eq.${req.params.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ seller: updated[0], generatedPassword });
}

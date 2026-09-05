import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";
import { createDownloadUrl } from "../lib/r2.js";

const SELLER_FIELDS =
  "id,store_name,description,status,is_house,applied_at,decided_at,decided_by,owner_full_name,email,phone,address_line1,address_line2,city,state,pincode,gst_number,store_image_keys,verified_fields";

// The fields an admin ticks off one at a time while reviewing an
// application. gst_number and images are only required when the applicant
// actually provided one — there's nothing to verify otherwise.
const VERIFIABLE_FIELDS = ["store_name", "owner_full_name", "contact", "address", "description"] as const;
const CONDITIONAL_FIELDS = ["gst_number", "images"] as const;
type VerifiableField = (typeof VERIFIABLE_FIELDS)[number] | (typeof CONDITIONAL_FIELDS)[number];
const ALL_FIELDS = [...VERIFIABLE_FIELDS, ...CONDITIONAL_FIELDS];

function requiredFieldsFor(seller: { gst_number?: string | null; store_image_keys?: string[] | null }): VerifiableField[] {
  const fields: VerifiableField[] = [...VERIFIABLE_FIELDS];
  if (seller.gst_number) fields.push("gst_number");
  if (seller.store_image_keys && seller.store_image_keys.length > 0) fields.push("images");
  return fields;
}

export async function listSellers(req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
  const status = req.query.status ?? "pending";
  if (!["pending", "approved", "rejected"].includes(status)) {
    return reply.code(400).send({ error: "invalid_status" });
  }
  const rows = await supabaseJson<Array<Record<string, unknown> & { store_image_keys: string[] }>>(
    `sellers?status=eq.${status}&select=${SELLER_FIELDS}&order=applied_at.asc`
  );
  const sellers = await Promise.all(
    rows.map(async ({ store_image_keys, ...rest }) => ({
      ...rest,
      store_image_urls: await Promise.all(store_image_keys.map(createDownloadUrl))
    }))
  );
  return reply.send({ sellers });
}

const decisionSchema = z.object({ status: z.enum(["approved", "rejected"]) });

const verifySchema = z.object({
  field: z.enum(ALL_FIELDS as [VerifiableField, ...VerifiableField[]]),
  verified: z.boolean()
});

// Ticks (or unticks) one field on a pending application. Kept separate from
// decideSeller so the admin can work through a checklist at their own pace
// before committing to approve/reject.
export async function verifySellerField(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

  const rows = await supabaseJson<Array<{ id: string; verified_fields: Record<string, boolean> }>>(
    `sellers?id=eq.${req.params.id}&select=id,verified_fields&limit=1`
  );
  const seller = rows[0];
  if (!seller) return reply.code(404).send({ error: "not_found" });

  const nextVerifiedFields = { ...(seller.verified_fields ?? {}), [parsed.data.field]: parsed.data.verified };
  const updated = await supabaseJson<any[]>(`sellers?id=eq.${req.params.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ verified_fields: nextVerifiedFields })
  });
  return reply.send({ seller: updated[0] });
}

// Approving is also account-creation time: a seller has no login at all
// until this point (see supabase/schema.sql's sellers comment). The
// generated password is returned in this response ONLY — it's hashed before
// being stored and never retrievable again, same one-shot-reveal pattern as
// auth-service's seed-admin script. The admin is responsible for relaying it
// to the seller (no email-sending infra exists in this repo).
export async function decideSeller(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

  if (parsed.data.status === "approved") {
    const rows = await supabaseJson<
      Array<{ id: string; gst_number: string | null; store_image_keys: string[]; verified_fields: Record<string, boolean> }>
    >(`sellers?id=eq.${req.params.id}&select=id,gst_number,store_image_keys,verified_fields&limit=1`);
    const seller = rows[0];
    if (!seller) return reply.code(404).send({ error: "not_found" });

    const required = requiredFieldsFor(seller);
    const missing = required.filter((field) => !seller.verified_fields?.[field]);
    if (missing.length > 0) {
      return reply.code(400).send({ error: "fields_not_verified", missing });
    }
  }

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

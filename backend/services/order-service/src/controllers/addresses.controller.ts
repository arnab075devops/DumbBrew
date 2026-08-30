import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

const addressSchema = z.object({
  label: z.string().min(1).max(40).default("Home"),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().default(""),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/, "must be a 6-digit PIN code"),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v), "must be a valid Indian mobile number"),
  isDefault: z.boolean().optional().default(false)
});

export async function listAddresses(req: FastifyRequest, reply: FastifyReply) {
  const rows = await supabaseJson<unknown[]>(
    `addresses?customer_id=eq.${req.customerId}&select=*&order=is_default.desc,created_at.desc`
  );
  return reply.send({ addresses: rows });
}

async function clearDefault(customerId: string) {
  await supabaseRequest(`addresses?customer_id=eq.${customerId}&is_default=eq.true`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_default: false })
  });
}

export async function createAddress(req: FastifyRequest, reply: FastifyReply) {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { isDefault, ...rest } = parsed.data;
  if (isDefault) await clearDefault(req.customerId!);
  const created = await supabaseJson<unknown[]>("addresses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...rest, customer_id: req.customerId, is_default: isDefault })
  });
  return reply.code(201).send({ address: (created as any[])[0] });
}

export async function updateAddress(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = addressSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { isDefault, ...rest } = parsed.data;
  if (isDefault) await clearDefault(req.customerId!);
  const patch: Record<string, unknown> = { ...rest };
  if (isDefault !== undefined) patch.is_default = isDefault;

  const updated = await supabaseJson<any[]>(`addresses?id=eq.${req.params.id}&customer_id=eq.${req.customerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ address: updated[0] });
}

export async function deleteAddress(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const res = await supabaseRequest(`addresses?id=eq.${req.params.id}&customer_id=eq.${req.customerId}`, {
    method: "DELETE"
  });
  if (!res.ok) return reply.code(500).send({ error: "internal_error" });
  return reply.code(204).send();
}

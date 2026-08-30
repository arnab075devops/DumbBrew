import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

const applySchema = z.object({
  storeName: z.string().min(2).max(80),
  description: z.string().max(1000).optional().default("")
});

export async function applyAsSeller(req: FastifyRequest, reply: FastifyReply) {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const existing = await supabaseJson<Array<{ id: string; status: string }>>(
    `sellers?id=eq.${req.customerId}&select=id,status&limit=1`
  );
  if (existing[0]) return reply.code(409).send({ error: "already_applied", status: existing[0].status });

  const created = await supabaseJson<unknown[]>("sellers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: req.customerId,
      store_name: parsed.data.storeName,
      description: parsed.data.description
    })
  });
  return reply.code(201).send({ seller: (created as any[])[0] });
}

export async function getMySeller(req: FastifyRequest, reply: FastifyReply) {
  const rows = await supabaseJson<unknown[]>(`sellers?id=eq.${req.customerId}&select=*&limit=1`);
  return reply.send({ seller: (rows as any[])[0] ?? null });
}

async function requireApprovedSeller(customerId: string): Promise<boolean> {
  const rows = await supabaseJson<Array<{ id: string }>>(
    `sellers?id=eq.${customerId}&status=eq.approved&select=id&limit=1`
  );
  return Boolean(rows[0]);
}

export async function listMyProducts(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.customerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const rows = await supabaseJson<unknown[]>(`products?seller_id=eq.${req.customerId}&select=*&order=created_at.desc`);
  return reply.send({ products: rows });
}

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  price: z.number().nonnegative(),
  imageKey: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  active: z.boolean().optional().default(true)
});

export async function createMyProduct(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.customerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { imageKey, ...rest } = parsed.data;
  const created = await supabaseJson<unknown[]>("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...rest, image_key: imageKey ?? null, seller_id: req.customerId })
  });
  return reply.code(201).send({ product: (created as any[])[0] });
}

export async function updateMyProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.customerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { imageKey, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest };
  if (imageKey !== undefined) patch.image_key = imageKey;

  // The &seller_id=eq.<caller> filter is the ownership check — this service
  // uses the service-role key, so a seller editing someone else's product id
  // would otherwise succeed silently.
  const updated = await supabaseJson<any[]>(`products?id=eq.${req.params.id}&seller_id=eq.${req.customerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ product: updated[0] });
}

export async function listMySales(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.customerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const rows = await supabaseJson<unknown[]>(
    `seller_orders?seller_id=eq.${req.customerId}&select=*&order=created_at.desc`
  );
  return reply.send({ sales: rows });
}

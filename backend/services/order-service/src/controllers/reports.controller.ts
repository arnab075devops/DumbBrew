import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

const reportSchema = z.object({
  sellerId: z.string().uuid(),
  orderItemId: z.number().int().positive().optional(),
  reason: z.string().min(10).max(2000)
});

// orderItemId is optional (a customer may want to report a seller without
// pointing at one specific purchase) but when given, it's checked to
// actually belong to the caller and to the named seller — otherwise it's
// dropped rather than trusted, same as collectionIds in sellers.controller.ts.
export async function createSellerReport(req: FastifyRequest, reply: FastifyReply) {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const sellers = await supabaseJson<Array<{ id: string }>>(`sellers?id=eq.${parsed.data.sellerId}&select=id&limit=1`);
  if (!sellers[0]) return reply.code(404).send({ error: "seller_not_found" });

  let orderItemId: number | null = null;
  if (parsed.data.orderItemId) {
    const rows = await supabaseJson<Array<{ id: number; seller_id: string; orders: { customer_id: string } | null }>>(
      `order_items?id=eq.${parsed.data.orderItemId}&select=id,seller_id,orders(customer_id)&limit=1`
    );
    const item = rows[0];
    if (item && item.seller_id === parsed.data.sellerId && item.orders?.customer_id === req.customerId) {
      orderItemId = item.id;
    }
  }

  const created = await supabaseJson<unknown[]>("seller_reports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      seller_id: parsed.data.sellerId,
      customer_id: req.customerId,
      order_item_id: orderItemId,
      reason: parsed.data.reason
    })
  });
  return reply.code(201).send({ report: (created as any[])[0] });
}

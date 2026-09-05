import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

const reviewSchema = z.object({
  orderItemId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional()
});

interface OwnedOrderItem {
  id: number;
  product_id: number;
  seller_id: string;
  orders: { customer_id: string; payment_status: string } | null;
}

// A rating can only be left on a line the caller actually bought and paid
// for — order_item_id is unique on product_reviews, so a second attempt on
// the same purchase is rejected rather than silently overwriting the first.
export async function createReview(req: FastifyRequest, reply: FastifyReply) {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const rows = await supabaseJson<OwnedOrderItem[]>(
    `order_items?id=eq.${parsed.data.orderItemId}&select=id,product_id,seller_id,orders(customer_id,payment_status)&limit=1`
  );
  const item = rows[0];
  if (!item || !item.orders || item.orders.customer_id !== req.customerId) {
    return reply.code(404).send({ error: "not_found" });
  }
  if (item.orders.payment_status !== "paid") {
    return reply.code(400).send({ error: "not_purchased" });
  }

  const existing = await supabaseJson<Array<{ id: number }>>(
    `product_reviews?order_item_id=eq.${item.id}&select=id&limit=1`
  );
  if (existing[0]) return reply.code(409).send({ error: "already_reviewed" });

  const created = await supabaseJson<unknown[]>("product_reviews", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_item_id: item.id,
      product_id: item.product_id,
      customer_id: req.customerId,
      seller_id: item.seller_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null
    })
  });
  return reply.code(201).send({ review: (created as any[])[0] });
}

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

interface WishlistItemRow {
  id: number;
  product_id: number;
}

export async function listWishlist(req: FastifyRequest, reply: FastifyReply) {
  const items = await supabaseJson<unknown[]>(
    `wishlist_items?customer_id=eq.${req.customerId}&select=id,created_at,product_id,products(id,name,price,image_key,active,seller_id,sellers(store_name))&order=created_at.desc`
  );
  return reply.send({ items });
}

const addSchema = z.object({
  productId: z.number().int().positive()
});

export async function addWishlistItem(req: FastifyRequest, reply: FastifyReply) {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { productId } = parsed.data;

  const product = await supabaseJson<Array<{ id: number }>>(
    `products?id=eq.${productId}&active=eq.true&select=id&limit=1`
  );
  if (!product[0]) return reply.code(404).send({ error: "product_not_found" });

  const existing = await supabaseJson<WishlistItemRow[]>(
    `wishlist_items?customer_id=eq.${req.customerId}&product_id=eq.${productId}&select=id&limit=1`
  );
  if (existing[0]) return reply.code(204).send();

  await supabaseRequest("wishlist_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ customer_id: req.customerId, product_id: productId })
  });
  return reply.code(204).send();
}

export async function removeWishlistItem(req: FastifyRequest<{ Params: { productId: string } }>, reply: FastifyReply) {
  await supabaseRequest(
    `wishlist_items?customer_id=eq.${req.customerId}&product_id=eq.${req.params.productId}`,
    { method: "DELETE" }
  );
  return reply.code(204).send();
}

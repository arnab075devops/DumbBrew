import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

interface CartRow {
  id: number;
  customer_id: string;
}

interface CartItemRow {
  id: number;
  cart_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
}

async function getOrCreateCart(customerId: string): Promise<CartRow> {
  const existing = await supabaseJson<CartRow[]>(`carts?customer_id=eq.${customerId}&select=id,customer_id&limit=1`);
  if (existing[0]) return existing[0];
  const created = await supabaseJson<CartRow[]>("carts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ customer_id: customerId })
  });
  return created[0];
}

export async function getCart(req: FastifyRequest, reply: FastifyReply) {
  const cart = await getOrCreateCart(req.customerId!);
  const items = await supabaseJson<unknown[]>(
    `cart_items?cart_id=eq.${cart.id}&select=id,quantity,product_id,variant_id,products(id,name,price,image_key,active,seller_id,sellers(store_name)),product_variants(id,title,price,inventory_quantity)&order=created_at.asc`
  );
  return reply.send({ cartId: cart.id, items });
}

const addSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().optional(),
  quantity: z.number().int().positive().max(50).default(1)
});

export async function addItem(req: FastifyRequest, reply: FastifyReply) {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { productId, variantId, quantity } = parsed.data;

  const product = await supabaseJson<Array<{ id: number }>>(
    `products?id=eq.${productId}&active=eq.true&select=id&limit=1`
  );
  if (!product[0]) return reply.code(404).send({ error: "product_not_found" });

  if (variantId !== undefined) {
    const variant = await supabaseJson<Array<{ id: number; inventory_quantity: number }>>(
      `product_variants?id=eq.${variantId}&product_id=eq.${productId}&select=id,inventory_quantity&limit=1`
    );
    if (!variant[0]) return reply.code(404).send({ error: "variant_not_found" });
    if (variant[0].inventory_quantity < quantity) {
      return reply.code(409).send({ error: "out_of_stock" });
    }
  }

  const cart = await getOrCreateCart(req.customerId!);
  const variantFilter = variantId !== undefined ? `variant_id=eq.${variantId}` : "variant_id=is.null";
  const existing = await supabaseJson<CartItemRow[]>(
    `cart_items?cart_id=eq.${cart.id}&product_id=eq.${productId}&${variantFilter}&select=id,quantity&limit=1`
  );

  if (existing[0]) {
    await supabaseRequest(`cart_items?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ quantity: existing[0].quantity + quantity })
    });
  } else {
    await supabaseRequest("cart_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ cart_id: cart.id, product_id: productId, variant_id: variantId ?? null, quantity })
    });
  }
  return reply.code(204).send();
}

const updateSchema = z.object({ quantity: z.number().int().min(0).max(50) });

export async function updateItem(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const cart = await getOrCreateCart(req.customerId!);
  // The &cart_id=eq.<own cart> filter is the ownership check: cart_item ids
  // are sequential/guessable, and this service uses the service-role key
  // (bypasses RLS), so the app itself must scope every write to the caller.
  if (parsed.data.quantity === 0) {
    await supabaseRequest(`cart_items?id=eq.${req.params.id}&cart_id=eq.${cart.id}`, { method: "DELETE" });
    return reply.code(204).send();
  }
  await supabaseRequest(`cart_items?id=eq.${req.params.id}&cart_id=eq.${cart.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ quantity: parsed.data.quantity })
  });
  return reply.code(204).send();
}

export async function removeItem(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const cart = await getOrCreateCart(req.customerId!);
  await supabaseRequest(`cart_items?id=eq.${req.params.id}&cart_id=eq.${cart.id}`, { method: "DELETE" });
  return reply.code(204).send();
}

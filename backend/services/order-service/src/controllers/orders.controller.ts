import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";
import { createRazorpayOrder } from "../lib/razorpay.js";
import { config } from "../config.js";

export async function listOrders(req: FastifyRequest, reply: FastifyReply) {
  const orders = await supabaseJson<unknown[]>(
    `orders?customer_id=eq.${req.customerId}&select=id,amount,payment_status,created_at,order_items(id,quantity,unit_price,product_id,products(name,image_key))&order=created_at.desc`
  );
  return reply.send({ orders });
}

const checkoutSchema = z.object({ addressId: z.number().int().positive() });

interface CartItemWithProduct {
  quantity: number;
  product_id: number;
  products: { id: number; price: string; active: boolean; seller_id: string } | null;
}

// Snapshots the customer's cart into an `orders` + `order_items` pair with
// payment_status='created', then asks Razorpay to create its own order for
// the same amount. The cart itself is left untouched until the webhook
// confirms payment (see payments.controller.ts) — so an abandoned or failed
// checkout doesn't silently empty it, and the customer can just retry.
export async function checkout(req: FastifyRequest, reply: FastifyReply) {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
  const customerId = req.customerId!;

  const address = await supabaseJson<Array<{ id: number }>>(
    `addresses?id=eq.${parsed.data.addressId}&customer_id=eq.${customerId}&select=id&limit=1`
  );
  if (!address[0]) return reply.code(404).send({ error: "address_not_found" });

  const carts = await supabaseJson<Array<{ id: number }>>(`carts?customer_id=eq.${customerId}&select=id&limit=1`);
  if (!carts[0]) return reply.code(400).send({ error: "cart_empty" });

  const cartItems = await supabaseJson<CartItemWithProduct[]>(
    `cart_items?cart_id=eq.${carts[0].id}&select=quantity,product_id,products(id,price,active,seller_id)`
  );
  const usable = cartItems.filter((it) => it.products?.active);
  if (!usable.length) return reply.code(400).send({ error: "cart_empty" });

  const amount = usable.reduce((sum, it) => sum + Number(it.products!.price) * it.quantity, 0);
  if (amount <= 0) return reply.code(400).send({ error: "cart_empty" });

  const orderRows = await supabaseJson<Array<{ id: number }>>("orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      customer_id: customerId,
      address_id: parsed.data.addressId,
      amount,
      payment_status: "created"
    })
  });
  const orderId = orderRows[0].id;

  const orderItemsPayload = usable.map((it) => ({
    order_id: orderId,
    product_id: it.product_id,
    seller_id: it.products!.seller_id,
    quantity: it.quantity,
    unit_price: it.products!.price
  }));
  await supabaseRequest("order_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(orderItemsPayload)
  });

  let razorpayOrder: { id: string };
  try {
    razorpayOrder = await createRazorpayOrder(amount, `order_${orderId}`);
  } catch (err) {
    req.log.error(err, "razorpay order creation failed");
    return reply.code(502).send({ error: "payment_provider_error" });
  }

  await supabaseRequest(`orders?id=eq.${orderId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ razorpay_order_id: razorpayOrder.id })
  });

  return reply.code(201).send({
    orderId,
    amount,
    razorpayOrderId: razorpayOrder.id,
    razorpayKeyId: config.razorpayKeyId
  });
}

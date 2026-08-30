import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";
import { verifyPaymentSignature, verifyWebhookSignature } from "../lib/razorpay.js";

const verifySchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string()
});

// Fast-path only: lets the browser show "payment successful" immediately
// after checkout.js's own success callback fires, instead of waiting on the
// webhook's network round trip. Does NOT flip payment_status — only the
// webhook below (Razorpay's own server calling us) is trusted to do that.
export async function verifyPayment(req: FastifyRequest, reply: FastifyReply) {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return reply.code(400).send({ error: "invalid_signature" });
  }
  const orders = await supabaseJson<Array<{ id: number; payment_status: string }>>(
    `orders?razorpay_order_id=eq.${razorpayOrderId}&customer_id=eq.${req.customerId}&select=id,payment_status&limit=1`
  );
  if (!orders[0]) return reply.code(404).send({ error: "order_not_found" });
  return reply.send({ paymentStatus: orders[0].payment_status });
}

// The actual source of truth for "paid" — Razorpay's server calls this
// directly (see payments.routes.ts / index.ts: no requireCustomer on this
// route, and no browser is ever involved). Signature is checked against the
// RAW request body — see index.ts's content-type parser, which stashes
// req.rawBody before JSON-parsing it, since re-serializing the parsed
// object would not byte-for-byte match what Razorpay signed.
export async function webhook(req: FastifyRequest, reply: FastifyReply) {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = (req as { rawBody?: string }).rawBody;
  if (typeof signature !== "string" || !rawBody || !verifyWebhookSignature(rawBody, signature)) {
    return reply.code(400).send({ error: "invalid_signature" });
  }

  const body = req.body as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string } } };
  };
  const event = body.event;
  const paymentEntity = body.payload?.payment?.entity;
  const razorpayOrderId = paymentEntity?.order_id;
  const razorpayPaymentId = paymentEntity?.id;
  // Acknowledge (200) events we don't act on too, so Razorpay doesn't retry
  // them forever — we only care about payment.captured/payment.failed.
  if (!razorpayOrderId) return reply.code(200).send({ ok: true });

  if (event === "payment.captured") {
    const orders = await supabaseJson<Array<{ id: number; customer_id: string; payment_status: string }>>(
      `orders?razorpay_order_id=eq.${razorpayOrderId}&select=id,customer_id,payment_status&limit=1`
    );
    const order = orders[0];
    if (order && order.payment_status !== "paid") {
      await supabaseRequest(`orders?id=eq.${order.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId ?? null })
      });
      // Only now does the cart actually empty — an unpaid/abandoned
      // checkout attempt leaves it untouched so the customer can retry.
      const carts = await supabaseJson<Array<{ id: number }>>(
        `carts?customer_id=eq.${order.customer_id}&select=id&limit=1`
      );
      if (carts[0]) {
        await supabaseRequest(`cart_items?cart_id=eq.${carts[0].id}`, { method: "DELETE" });
      }
    }
  } else if (event === "payment.failed") {
    await supabaseRequest(`orders?razorpay_order_id=eq.${razorpayOrderId}&payment_status=eq.created`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ payment_status: "failed" })
    });
  }

  return reply.code(200).send({ ok: true });
}

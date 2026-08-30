import crypto from "node:crypto";
import { config } from "../config.js";

export async function createRazorpayOrder(amountRupees: number, receipt: string): Promise<{ id: string }> {
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100), // Razorpay wants paise
      currency: "INR",
      receipt
    })
  });
  if (!res.ok) throw new Error(`razorpay create order http ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ id: string }>;
}

// Fast-path only: lets the browser show "payment successful" right after
// checkout.js's own callback fires, without waiting on the webhook's
// network round trip. NOT the source of truth for payment_status — see
// verifyWebhookSignature below and the comment in payments.controller.ts.
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return timingSafeEqualHex(expected, signature);
}

// The actual source of truth for "paid". Verified against the RAW request
// body — see index.ts's content-type parser, which stashes req.rawBody
// before JSON-parsing it, since re-serializing the parsed object would not
// byte-for-byte match what Razorpay signed.
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", config.razorpayWebhookSecret).update(rawBody).digest("hex");
  return timingSafeEqualHex(expected, signature);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

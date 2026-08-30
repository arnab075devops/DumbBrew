import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { verifyPayment } from "../controllers/payments.controller.js";

// The webhook route is registered directly in index.ts (no requireCustomer
// — Razorpay's server calls it, not a signed-in browser). Only the
// customer-facing fast-path "verify" lives here.
export async function paymentsRoutes(app: FastifyInstance) {
  app.post("/verify", { preHandler: requireCustomer }, verifyPayment);
}

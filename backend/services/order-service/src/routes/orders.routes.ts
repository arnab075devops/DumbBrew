import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { listOrders, checkout } from "../controllers/orders.controller.js";

export async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.get("/", listOrders);
  app.post("/checkout", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, checkout);
}

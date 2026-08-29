import type { FastifyInstance } from "fastify";
import { registerCustomer } from "../controllers/customers.controller.js";

export async function customersRoutes(app: FastifyInstance) {
  app.post(
    "/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    registerCustomer
  );
}

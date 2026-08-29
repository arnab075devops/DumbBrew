import type { FastifyInstance } from "fastify";
import { registerCustomer, createCustomerSession } from "../controllers/customers.controller.js";

export async function customersRoutes(app: FastifyInstance) {
  app.post(
    "/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    registerCustomer
  );
  app.post(
    "/session",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    createCustomerSession
  );
}

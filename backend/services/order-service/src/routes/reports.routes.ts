import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { createSellerReport } from "../controllers/reports.controller.js";

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.post("/", createSellerReport);
}

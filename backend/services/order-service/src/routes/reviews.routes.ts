import type { FastifyInstance } from "fastify";
import { requireCustomer } from "../middleware/requireCustomer.js";
import { createReview } from "../controllers/reviews.controller.js";

export async function reviewsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireCustomer);
  app.post("/", createReview);
}

import type { FastifyInstance } from "fastify";
import { subscribe, listSubscribers, deleteSubscriber } from "../controllers/newsletter.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

export async function newsletterRoutes(app: FastifyInstance) {
  app.post(
    "/subscribe",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    subscribe
  );
  app.get("/subscribers", { preHandler: requireAdmin }, listSubscribers);
  app.delete<{ Params: { id: string } }>("/subscribers/:id", { preHandler: requireAdmin }, deleteSubscriber);
}

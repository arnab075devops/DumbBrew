import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { listSellers, decideSeller } from "../controllers/adminSellers.controller.js";

export async function adminSellersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);
  app.get("/", listSellers);
  app.patch("/:id", decideSeller);
}

import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { getVisitInfo, updateVisitInfo } from "../controllers/adminVisit.controller.js";

export async function adminVisitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);
  app.get("/", getVisitInfo);
  app.patch("/", updateVisitInfo);
}

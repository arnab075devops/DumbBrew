import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { listReports, dismissReport, sendNoticeForReport } from "../controllers/adminReports.controller.js";

export async function adminReportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);
  app.get("/", listReports);
  app.patch("/:id/dismiss", dismissReport);
  app.post("/:id/notice", sendNoticeForReport);
}

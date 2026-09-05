import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  listTutorials,
  getTutorial,
  createTutorial,
  updateTutorial,
  deleteTutorial,
  presignTutorialUpload
} from "../controllers/adminTutorials.controller.js";

export async function adminTutorialsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdmin);
  app.get("/", listTutorials);
  app.get("/:id", getTutorial);
  app.post("/", createTutorial);
  app.patch("/:id", updateTutorial);
  app.delete("/:id", deleteTutorial);
  app.post("/presign-upload", presignTutorialUpload);
}

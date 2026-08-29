import type { FastifyInstance } from "fastify";
import { listEvents, createEvent, updateEvent, deleteEvent } from "../controllers/events.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";
import { optionalAdmin } from "../middleware/optionalAdmin.middleware.js";

export async function eventsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: optionalAdmin }, listEvents);
  app.post("/", { preHandler: requireAdmin }, createEvent);
  app.put<{ Params: { id: string } }>("/:id", { preHandler: requireAdmin }, updateEvent);
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: requireAdmin }, deleteEvent);
}

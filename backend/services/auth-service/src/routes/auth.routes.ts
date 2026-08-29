import type { FastifyInstance } from "fastify";
import { login, refresh, logout, me } from "../controllers/auth.controller.js";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    login
  );
  app.post("/refresh", refresh);
  app.post("/logout", logout);
  app.get("/me", me);
}

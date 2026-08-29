import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { AdminClaims } from "./auth.middleware.js";

/**
 * Best-effort auth: if a valid admin bearer token is present, attaches
 * req.admin; otherwise proceeds as an anonymous request. Used on public
 * GET endpoints that show extra data (e.g. unpublished events) to admins.
 */
export async function optionalAdmin(req: FastifyRequest, _reply: FastifyReply) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return;
  try {
    const claims = jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer }) as AdminClaims;
    if (claims.role === "admin") req.admin = claims;
  } catch {
    // invalid/expired token on a public route just means "treat as anonymous"
  }
}

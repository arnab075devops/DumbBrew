import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export interface AdminClaims {
  sub: string;
  email: string;
  role: "admin";
}

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminClaims;
  }
}

// Verifies the access token issued by auth-service using the JWT_SECRET the
// services share — same pattern as content-service's requireAdmin. Seller
// applications are approved/rejected through the existing admin login
// (POST /api/auth/login), not a new admin identity system.
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return reply.code(401).send({ error: "missing_token" });
  }
  try {
    const claims = jwt.verify(token, config.jwtSecret, { issuer: config.jwtIssuer }) as AdminClaims;
    if (claims.role !== "admin") {
      return reply.code(403).send({ error: "forbidden" });
    }
    req.admin = claims;
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    customerId?: string;
  }
}

// Verifies the Supabase-compatible JWT auth-service's createCustomerSession
// mints (`{ sub, role: "authenticated" }`, signed with SUPABASE_JWT_SECRET)
// — the same token account.html/cart.html already send as
// `Authorization: Bearer <token>` to PostgREST directly.
export async function requireCustomer(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return reply.code(401).send({ error: "missing_token" });
  }
  try {
    const claims = jwt.verify(token, config.supabaseJwtSecret, { audience: "authenticated" }) as jwt.JwtPayload;
    if (typeof claims.sub !== "string") {
      return reply.code(401).send({ error: "invalid_token" });
    }
    req.customerId = claims.sub;
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

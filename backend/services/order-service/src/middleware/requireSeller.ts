import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySellerToken } from "../lib/sellerJwt.js";

declare module "fastify" {
  interface FastifyRequest {
    sellerId?: string;
  }
}

// Verifies the standalone seller JWT (see lib/sellerJwt.ts) — a seller is
// not a Supabase/Authentik principal, so this is a distinct auth path from
// requireCustomer, even though both eventually just set an id on req.
export async function requireSeller(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return reply.code(401).send({ error: "missing_token" });
  }
  try {
    const claims = verifySellerToken(token);
    if (claims.role !== "seller" || typeof claims.sub !== "string") {
      return reply.code(401).send({ error: "invalid_token" });
    }
    req.sellerId = claims.sub;
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

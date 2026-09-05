import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

const searchSchema = z.object({
  q: z.string().trim().min(1).max(100)
});

// Escapes the wildcard/separator characters PostgREST's ilike pattern syntax
// treats specially, so a search term like "50% off" or "a,b" can't alter the
// filter's shape — everything else in the term is matched literally.
function escapeIlikeTerm(term: string): string {
  return term.replace(/[%*,()]/g, (ch) => `\\${ch}`);
}

export async function searchProducts(req: FastifyRequest, reply: FastifyReply) {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const term = escapeIlikeTerm(parsed.data.q);
  const items = await supabaseJson<unknown[]>(
    `products?active=eq.true&or=(name.ilike.*${term}*,description.ilike.*${term}*)&select=id,name,price,image_key,seller_id,sellers(store_name)&order=sort.asc&limit=20`
  );
  return reply.send({ items });
}

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

export async function listSellers(req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
  const status = req.query.status ?? "pending";
  if (!["pending", "approved", "rejected"].includes(status)) {
    return reply.code(400).send({ error: "invalid_status" });
  }
  const rows = await supabaseJson<unknown[]>(`sellers?status=eq.${status}&select=*&order=applied_at.asc`);
  return reply.send({ sellers: rows });
}

const decisionSchema = z.object({ status: z.enum(["approved", "rejected"]) });

export async function decideSeller(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

  const updated = await supabaseJson<any[]>(`sellers?id=eq.${req.params.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: parsed.data.status,
      decided_at: new Date().toISOString(),
      decided_by: req.admin?.email ?? "admin"
    })
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ seller: updated[0] });
}

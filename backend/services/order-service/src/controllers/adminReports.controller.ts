import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

export async function listReports(req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
  const status = req.query.status ?? "pending";
  if (!["pending", "reviewed", "dismissed"].includes(status)) {
    return reply.code(400).send({ error: "invalid_status" });
  }
  const rows = await supabaseJson<unknown[]>(
    `seller_reports?status=eq.${status}&select=*,sellers(store_name,email),customers(username,email),order_items(id,products(name))&order=created_at.desc`
  );
  return reply.send({ reports: rows });
}

// Dismiss a report with no further action — for reports the admin decides
// don't warrant a notice (e.g. unverifiable, or the seller wasn't at fault).
export async function dismissReport(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const updated = await supabaseJson<any[]>(`seller_reports?id=eq.${req.params.id}&status=eq.pending`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "dismissed", reviewed_at: new Date().toISOString(), reviewed_by: req.admin?.email ?? "admin" })
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ report: updated[0] });
}

const noticeSchema = z.object({ message: z.string().min(5).max(2000) });

// The admin's verification step is everything up to this call (reading the
// report, the flagged purchase, deciding it's founded) — this endpoint is
// what actually escalates a report into a warning the seller will see on
// their own dashboard, and marks the report reviewed so it drops off the
// pending queue.
export async function sendNoticeForReport(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

  const reports = await supabaseJson<Array<{ id: number; seller_id: string; status: string }>>(
    `seller_reports?id=eq.${req.params.id}&select=id,seller_id,status&limit=1`
  );
  const report = reports[0];
  if (!report) return reply.code(404).send({ error: "not_found" });
  if (report.status !== "pending") return reply.code(409).send({ error: "already_handled" });

  const notice = await supabaseJson<unknown[]>("seller_notices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      seller_id: report.seller_id,
      report_id: report.id,
      message: parsed.data.message,
      created_by: req.admin?.email ?? "admin"
    })
  });

  const updated = await supabaseJson<any[]>(`seller_reports?id=eq.${report.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "reviewed", reviewed_at: new Date().toISOString(), reviewed_by: req.admin?.email ?? "admin" })
  });

  return reply.code(201).send({ notice: (notice as any[])[0], report: updated[0] });
}

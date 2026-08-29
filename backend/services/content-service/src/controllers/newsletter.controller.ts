import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db.js";

const subscribeSchema = z.object({
  email: z.string().email()
});

export async function subscribe(req: FastifyRequest, reply: FastifyReply) {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
  const email = parsed.data.email.toLowerCase();
  await pool.query(
    `INSERT INTO content.newsletter_subscribers (email) VALUES ($1)
     ON CONFLICT (email) DO NOTHING`,
    [email]
  );
  // Always respond 200 regardless of whether the email was already subscribed,
  // so this endpoint can't be used to enumerate subscriber emails.
  return reply.send({ status: "subscribed" });
}

export async function listSubscribers(req: FastifyRequest, reply: FastifyReply) {
  const query = req.query as { page?: string; pageSize?: string };
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, email, subscribed_at FROM content.newsletter_subscribers
       ORDER BY subscribed_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ),
    pool.query(`SELECT count(*)::int AS total FROM content.newsletter_subscribers`)
  ]);

  return reply.send({ subscribers: rows, page, pageSize, total: countRows[0].total });
}

export async function deleteSubscriber(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { rowCount } = await pool.query(`DELETE FROM content.newsletter_subscribers WHERE id = $1`, [req.params.id]);
  if (!rowCount) return reply.code(404).send({ error: "not_found" });
  return reply.code(204).send();
}

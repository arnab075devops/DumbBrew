import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db.js";

const eventInputSchema = z.object({
  title: z.string().min(1).max(200),
  eventDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "invalid date"),
  description: z.string().max(2000).optional().default(""),
  isPublished: z.boolean().optional().default(true)
});

export async function listEvents(req: FastifyRequest, reply: FastifyReply) {
  const isAdmin = Boolean(req.admin);
  const { rows } = await pool.query(
    isAdmin
      ? `SELECT id, title, event_date, description, is_published, created_at
         FROM content.events ORDER BY event_date ASC`
      : `SELECT id, title, event_date, description, created_at
         FROM content.events WHERE is_published = true AND event_date >= CURRENT_DATE
         ORDER BY event_date ASC`
  );
  return reply.send({ events: rows });
}

export async function createEvent(req: FastifyRequest, reply: FastifyReply) {
  const parsed = eventInputSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { title, eventDate, description, isPublished } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO content.events (title, event_date, description, is_published)
     VALUES ($1, $2, $3, $4) RETURNING id, title, event_date, description, is_published, created_at`,
    [title, eventDate, description, isPublished]
  );
  return reply.code(201).send({ event: rows[0] });
}

export async function updateEvent(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const parsed = eventInputSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const fields = parsed.data;
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (fields.title !== undefined) { sets.push(`title = $${i++}`); values.push(fields.title); }
  if (fields.eventDate !== undefined) { sets.push(`event_date = $${i++}`); values.push(fields.eventDate); }
  if (fields.description !== undefined) { sets.push(`description = $${i++}`); values.push(fields.description); }
  if (fields.isPublished !== undefined) { sets.push(`is_published = $${i++}`); values.push(fields.isPublished); }
  if (!sets.length) return reply.code(400).send({ error: "no_fields_to_update" });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE content.events SET ${sets.join(", ")}, updated_at = now() WHERE id = $${i} RETURNING id, title, event_date, description, is_published, created_at`,
    values
  );
  if (!rows[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ event: rows[0] });
}

export async function deleteEvent(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { rowCount } = await pool.query(`DELETE FROM content.events WHERE id = $1`, [req.params.id]);
  if (!rowCount) return reply.code(404).send({ error: "not_found" });
  return reply.code(204).send();
}

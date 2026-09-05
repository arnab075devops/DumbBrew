import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

const VISIT_FIELDS = "id,address,address_note,hours_weekday,hours_weekend,phone,email,lat,lng";

// There is exactly one visit_info row (the storefront's own address/hours —
// see supabase/schema.sql) — not a multi-tenant table, so this admin surface
// reads/writes that single row rather than taking an id.
export async function getVisitInfo(_req: FastifyRequest, reply: FastifyReply) {
  const rows = await supabaseJson<unknown[]>(`visit_info?select=${VISIT_FIELDS}&limit=1`);
  return reply.send({ visit: rows[0] ?? null });
}

const visitSchema = z.object({
  address: z.string().min(1).max(300),
  addressNote: z.string().max(300).optional(),
  hoursWeekday: z.string().min(1).max(100),
  hoursWeekend: z.string().min(1).max(100),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(200).optional(),
  // Leaflet (https://leafletjs.com/) marker coordinates for visit.html's map.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional()
});

export async function updateVisitInfo(req: FastifyRequest, reply: FastifyReply) {
  const parsed = visitSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const patch: Record<string, unknown> = {};
  if (parsed.data.address !== undefined) patch.address = parsed.data.address;
  if (parsed.data.addressNote !== undefined) patch.address_note = parsed.data.addressNote || null;
  if (parsed.data.hoursWeekday !== undefined) patch.hours_weekday = parsed.data.hoursWeekday;
  if (parsed.data.hoursWeekend !== undefined) patch.hours_weekend = parsed.data.hoursWeekend;
  if (parsed.data.phone !== undefined) patch.phone = parsed.data.phone || null;
  if (parsed.data.email !== undefined) patch.email = parsed.data.email || null;
  if (parsed.data.lat !== undefined) patch.lat = parsed.data.lat;
  if (parsed.data.lng !== undefined) patch.lng = parsed.data.lng;

  const existing = await supabaseJson<Array<{ id: number }>>("visit_info?select=id&limit=1");

  if (existing[0]) {
    const updated = await supabaseJson<any[]>(`visit_info?id=eq.${existing[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    return reply.send({ visit: updated[0] });
  }

  // First-time setup: no row exists yet, so a full record is required
  // rather than trusting defaults for the not-null columns.
  const fullSchema = visitSchema.required({ address: true, hoursWeekday: true, hoursWeekend: true });
  const fullParsed = fullSchema.safeParse(req.body);
  if (!fullParsed.success) {
    return reply.code(400).send({ error: "no_existing_row_requires_full_fields", details: fullParsed.error.flatten() });
  }
  const created = await supabaseJson<any[]>("visit_info", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      address: fullParsed.data.address,
      address_note: fullParsed.data.addressNote || null,
      hours_weekday: fullParsed.data.hoursWeekday,
      hours_weekend: fullParsed.data.hoursWeekend,
      phone: fullParsed.data.phone || null,
      email: fullParsed.data.email || null,
      lat: fullParsed.data.lat ?? null,
      lng: fullParsed.data.lng ?? null
    })
  });
  return reply.code(201).send({ visit: created[0] });
}

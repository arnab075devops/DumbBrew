import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";

const applicationSchema = z.object({
  storeName: z.string().min(2).max(80),
  ownerFullName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(6).max(20),
  addressLine1: z.string().min(3).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().min(3).max(12),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  gstNumber: z.string().max(20).optional(),
  description: z.string().max(1000).optional().default(""),
  storeImageKeys: z.array(z.string().max(300)).max(8).optional().default([])
});

// Public — anyone can apply without a DumbBrew account. No credentials exist
// on this row yet; those are only generated once an admin approves it (see
// adminSellers.controller.ts). One application per email while one is
// pending/approved keeps a person from spamming duplicate applications.
export async function applyAsSeller(req: FastifyRequest, reply: FastifyReply) {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const email = parsed.data.email.toLowerCase();

  const existing = await supabaseJson<Array<{ id: string; status: string }>>(
    `sellers?email=eq.${encodeURIComponent(email)}&status=in.(pending,approved)&select=id,status&limit=1`
  );
  if (existing[0]) return reply.code(409).send({ error: "already_applied", status: existing[0].status });

  const created = await supabaseJson<unknown[]>("sellers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      store_name: parsed.data.storeName,
      owner_full_name: parsed.data.ownerFullName,
      email,
      phone: parsed.data.phone,
      address_line1: parsed.data.addressLine1,
      address_line2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city,
      state: parsed.data.state,
      pincode: parsed.data.pincode,
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      gst_number: parsed.data.gstNumber ?? null,
      description: parsed.data.description,
      store_image_keys: parsed.data.storeImageKeys
    })
  });
  return reply.code(201).send({ seller: (created as any[])[0] });
}

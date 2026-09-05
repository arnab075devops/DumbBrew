import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson, supabaseRequest } from "../lib/supabase.js";

async function requireApprovedSeller(sellerId: string): Promise<boolean> {
  const rows = await supabaseJson<Array<{ id: string }>>(
    `sellers?id=eq.${sellerId}&status=eq.approved&select=id&limit=1`
  );
  return Boolean(rows[0]);
}

// --- Products (+ nested variants/images, Shopify-style) ---

const variantSchema = z.object({
  id: z.number().int().positive().optional(), // present = update existing row, absent = insert
  sku: z.string().max(100).optional(),
  title: z.string().min(1).max(120),
  price: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().optional(),
  inventoryQuantity: z.number().int().min(0).default(0),
  position: z.number().int().min(0).default(0)
});

const imageSchema = z.object({
  id: z.number().int().positive().optional(),
  imageKey: z.string().min(1).max(300),
  alt: z.string().max(200).optional(),
  position: z.number().int().min(0).default(0)
});

const productSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  price: z.number().nonnegative(),
  imageKey: z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  active: z.boolean().optional().default(true),
  variants: z.array(variantSchema).max(50).optional(),
  images: z.array(imageSchema).max(20).optional(),
  collectionIds: z.array(z.number().int().positive()).max(50).optional()
});

export async function listMyProducts(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const rows = await supabaseJson<unknown[]>(
    `products?seller_id=eq.${req.sellerId}&select=*,product_variants(*),product_images(*),product_collections(collection_id)&order=created_at.desc`
  );
  return reply.send({ products: rows });
}

async function replaceVariants(productId: number, variants: z.infer<typeof variantSchema>[]) {
  // Simplest correct approach for a dashboard-scale catalog (a handful of
  // variants per product, not thousands): drop and re-insert every time
  // rather than diffing updates/inserts/deletes client-side.
  await supabaseRequest(`product_variants?product_id=eq.${productId}`, { method: "DELETE" });
  if (!variants.length) return;
  await supabaseRequest("product_variants", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      variants.map((v) => ({
        product_id: productId,
        sku: v.sku ?? null,
        title: v.title,
        price: v.price,
        compare_at_price: v.compareAtPrice ?? null,
        inventory_quantity: v.inventoryQuantity,
        position: v.position
      }))
    )
  });
}

async function replaceImages(productId: number, images: z.infer<typeof imageSchema>[]) {
  await supabaseRequest(`product_images?product_id=eq.${productId}`, { method: "DELETE" });
  if (!images.length) return;
  await supabaseRequest("product_images", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      images.map((img) => ({
        product_id: productId,
        image_key: img.imageKey,
        alt: img.alt ?? null,
        position: img.position
      }))
    )
  });
}

async function replaceCollections(productId: number, sellerId: string, collectionIds: number[]) {
  await supabaseRequest(`product_collections?product_id=eq.${productId}`, { method: "DELETE" });
  if (!collectionIds.length) return;
  // Only attach collections the caller actually owns — a crafted id
  // belonging to another seller is silently dropped rather than trusted.
  const owned = await supabaseJson<Array<{ id: number }>>(
    `collections?seller_id=eq.${sellerId}&id=in.(${collectionIds.join(",")})&select=id`
  );
  const ownedIds = new Set(owned.map((c) => c.id));
  const rows = collectionIds.filter((id) => ownedIds.has(id)).map((id) => ({ product_id: productId, collection_id: id }));
  if (!rows.length) return;
  await supabaseRequest("product_collections", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows)
  });
}

export async function createMyProduct(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { imageKey, variants, images, collectionIds, ...rest } = parsed.data;
  const created = await supabaseJson<unknown[]>("products", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...rest, image_key: imageKey ?? null, seller_id: req.sellerId })
  });
  const product = (created as any[])[0];
  if (variants) await replaceVariants(product.id, variants);
  if (images) await replaceImages(product.id, images);
  if (collectionIds) await replaceCollections(product.id, req.sellerId!, collectionIds);
  return reply.code(201).send({ product });
}

export async function updateMyProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { imageKey, variants, images, collectionIds, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest };
  if (imageKey !== undefined) patch.image_key = imageKey;

  // The &seller_id=eq.<caller> filter is the ownership check — this service
  // uses the service-role key, so a seller editing someone else's product id
  // would otherwise succeed silently.
  const updated = await supabaseJson<any[]>(`products?id=eq.${req.params.id}&seller_id=eq.${req.sellerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  const productId = updated[0].id;
  if (variants) await replaceVariants(productId, variants);
  if (images) await replaceImages(productId, images);
  if (collectionIds) await replaceCollections(productId, req.sellerId!, collectionIds);
  return reply.send({ product: updated[0] });
}

export async function deleteMyProduct(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  await supabaseRequest(`products?id=eq.${req.params.id}&seller_id=eq.${req.sellerId}`, { method: "DELETE" });
  return reply.code(204).send();
}

// --- Collections ---

const collectionSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional()
});

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "collection";
}

export async function listMyCollections(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const rows = await supabaseJson<unknown[]>(`collections?seller_id=eq.${req.sellerId}&select=*&order=created_at.asc`);
  return reply.send({ collections: rows });
}

export async function createMyCollection(req: FastifyRequest, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = collectionSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const created = await supabaseJson<unknown[]>("collections", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      seller_id: req.sellerId,
      title: parsed.data.title,
      slug: slugify(parsed.data.title),
      description: parsed.data.description ?? null
    })
  });
  return reply.code(201).send({ collection: (created as any[])[0] });
}

export async function updateMyCollection(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = collectionSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.title) patch.slug = slugify(parsed.data.title);
  const updated = await supabaseJson<any[]>(`collections?id=eq.${req.params.id}&seller_id=eq.${req.sellerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ collection: updated[0] });
}

export async function deleteMyCollection(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  await supabaseRequest(`collections?id=eq.${req.params.id}&seller_id=eq.${req.sellerId}`, { method: "DELETE" });
  return reply.code(204).send();
}

// --- Orders / fulfillment ---

const salesRangeSchema = z.object({
  from: z.string().refine((s) => !isNaN(new Date(s).getTime()), "invalid date").optional(),
  to: z.string().refine((s) => !isNaN(new Date(s).getTime()), "invalid date").optional()
});

// Defaults to the current calendar month so "Your Sales" opens on something
// immediately useful; from/to (YYYY-MM-DD) let the seller pick any fixed
// window instead. `to` is treated as inclusive of the whole day.
export async function listMySales(
  req: FastifyRequest<{ Querystring: { from?: string; to?: string } }>,
  reply: FastifyReply
) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  const parsed = salesRangeSchema.safeParse(req.query);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const from = parsed.data.from ? new Date(parsed.data.from) : monthStart;
  const to = parsed.data.to ? new Date(new Date(parsed.data.to).getTime() + 24 * 60 * 60 * 1000) : monthEnd;

  const rows = await supabaseJson<Array<{ order_id: number; quantity: number; unit_price: string }>>(
    `seller_orders?seller_id=eq.${req.sellerId}&created_at=gte.${from.toISOString()}&created_at=lt.${to.toISOString()}&select=*&order=created_at.desc`
  );
  const summary = rows.reduce(
    (acc, r) => {
      acc.revenue += Number(r.unit_price) * r.quantity;
      acc.itemsSold += r.quantity;
      acc.orderIds.add(r.order_id);
      return acc;
    },
    { revenue: 0, itemsSold: 0, orderIds: new Set<number>() }
  );
  return reply.send({
    sales: rows,
    summary: { revenue: summary.revenue, itemsSold: summary.itemsSold, orders: summary.orderIds.size },
    range: { from: from.toISOString(), to: new Date(to.getTime() - 1).toISOString() }
  });
}

export async function fulfillOrderItem(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  if (!(await requireApprovedSeller(req.sellerId!))) {
    return reply.code(403).send({ error: "not_an_approved_seller" });
  }
  // &seller_id=eq.<caller> is the ownership check — order_items ids are
  // sequential/guessable and this service uses the service-role key.
  const updated = await supabaseJson<any[]>(`order_items?id=eq.${req.params.id}&seller_id=eq.${req.sellerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ fulfillment_status: "fulfilled", fulfilled_at: new Date().toISOString() })
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ orderItem: updated[0] });
}

// --- Notices (admin warnings shown on the seller's own dashboard) ---

export async function listMyNotices(req: FastifyRequest, reply: FastifyReply) {
  const rows = await supabaseJson<unknown[]>(
    `seller_notices?seller_id=eq.${req.sellerId}&select=*&order=created_at.desc`
  );
  return reply.send({ notices: rows });
}

export async function acknowledgeNotice(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  // &seller_id=eq.<caller> is the ownership check, same pattern as fulfillOrderItem.
  const updated = await supabaseJson<any[]>(`seller_notices?id=eq.${req.params.id}&seller_id=eq.${req.sellerId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ acknowledged_at: new Date().toISOString() })
  });
  if (!updated[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ notice: updated[0] });
}

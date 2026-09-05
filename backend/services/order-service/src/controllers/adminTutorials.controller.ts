import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import type { FastifyReply, FastifyRequest } from "fastify";
import { supabaseJson } from "../lib/supabase.js";
import { createUploadUrl } from "../lib/r2.js";
import { config } from "../config.js";

const TUTORIAL_FIELDS =
  "id,slug,title,excerpt,category,thumbnail_key,video_url,body_html,published,published_at,created_at,updated_at";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// Admin-authored content, but sanitized anyway as defense-in-depth: this is
// rendered via innerHTML on the public tutorial.html, so a leaked admin
// token or an XSS bug in the Quill editor itself shouldn't be able to plant
// a script tag that runs in every visitor's browser. iframes are allowed
// only from the video-embed hosts Quill's own toolbar produces.
function sanitizeBodyHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "p", "br", "strong", "b", "em", "i", "u", "s",
      "blockquote", "ul", "ol", "li", "a", "img", "iframe", "span"
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
      iframe: ["src", "frameborder", "allow", "allowfullscreen", "width", "height"],
      span: ["class"]
    },
    allowedIframeHostnames: [
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "player.vimeo.com"
    ],
    allowedSchemesByTag: { img: ["http", "https"], a: ["http", "https", "mailto"] }
  });
}

export async function listTutorials(_req: FastifyRequest, reply: FastifyReply) {
  const tutorials = await supabaseJson<unknown[]>(
    `tutorials?select=${TUTORIAL_FIELDS}&order=created_at.desc`
  );
  return reply.send({ tutorials });
}

export async function getTutorial(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const rows = await supabaseJson<unknown[]>(`tutorials?id=eq.${id}&select=${TUTORIAL_FIELDS}&limit=1`);
  if (!rows[0]) return reply.code(404).send({ error: "not_found" });
  return reply.send({ tutorial: rows[0] });
}

const tutorialSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(120).optional(),
  excerpt: z.string().max(500).optional(),
  category: z.string().max(80).optional(),
  thumbnailKey: z.string().max(300).optional(),
  videoUrl: z.string().url().max(500).optional(),
  bodyHtml: z.string().max(200000).optional(),
  published: z.boolean().optional()
});

function toPatch(data: Partial<z.infer<typeof tutorialSchema>>, opts: { forCreate: boolean }) {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.slug !== undefined) patch.slug = slugify(data.slug);
  else if (opts.forCreate) patch.slug = slugify(data.title as string);
  if (data.excerpt !== undefined) patch.excerpt = data.excerpt;
  if (data.category !== undefined) patch.category = data.category || null;
  if (data.thumbnailKey !== undefined) patch.thumbnail_key = data.thumbnailKey || null;
  if (data.videoUrl !== undefined) patch.video_url = data.videoUrl || null;
  if (data.bodyHtml !== undefined) patch.body_html = sanitizeBodyHtml(data.bodyHtml);
  if (data.published !== undefined) {
    patch.published = data.published;
    patch.published_at = data.published ? new Date().toISOString() : null;
  }
  return patch;
}

export async function createTutorial(req: FastifyRequest, reply: FastifyReply) {
  const parsed = tutorialSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const patch = toPatch(parsed.data, { forCreate: true });
  patch.updated_at = new Date().toISOString();

  try {
    const created = await supabaseJson<any[]>("tutorials", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    return reply.code(201).send({ tutorial: created[0] });
  } catch (err) {
    if (err instanceof Error && /409|duplicate key/i.test(err.message)) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    throw err;
  }
}

export async function updateTutorial(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const parsed = tutorialSchema.partial().safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });

  const patch = toPatch(parsed.data, { forCreate: false });
  patch.updated_at = new Date().toISOString();

  try {
    const updated = await supabaseJson<any[]>(`tutorials?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    if (!updated[0]) return reply.code(404).send({ error: "not_found" });
    return reply.send({ tutorial: updated[0] });
  } catch (err) {
    if (err instanceof Error && /409|duplicate key/i.test(err.message)) {
      return reply.code(409).send({ error: "slug_taken" });
    }
    throw err;
  }
}

export async function deleteTutorial(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  await supabaseJson(`tutorials?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  return reply.code(204).send();
}

const presignSchema = z.object({
  fileName: z.string().min(1).max(150),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"])
});

// Used for both the thumbnail picker and Quill's inline image button.
// Written to the dedicated r2TutorialsBucket (public r2.dev access enabled),
// not the default r2Bucket — that one only has signed-GET access for
// seller-application photos, and tutorial images are meant to be publicly
// visible once the article is published, read back via R2_TUTORIALS_BASE
// in gateway/public/config.js.
export async function presignTutorialUpload(req: FastifyRequest, reply: FastifyReply) {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { uploadUrl, imageKey } = await createUploadUrl(
    "tutorials",
    parsed.data.fileName,
    parsed.data.contentType,
    config.r2TutorialsBucket
  );
  return reply.send({ uploadUrl, imageKey });
}

import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createUploadUrl } from "../lib/r2.js";

const presignSchema = z.object({
  fileName: z.string().min(1).max(150),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"])
});

// Public — an applicant has no account yet, so this can't be seller-authed.
// Kept deliberately narrow (image content-types only, tight rate limit in
// nginx) since it's the one unauthenticated write path in the service.
export async function presignApplicationUpload(req: FastifyRequest, reply: FastifyReply) {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { uploadUrl, imageKey } = await createUploadUrl(
    "seller-applications",
    parsed.data.fileName,
    parsed.data.contentType
  );
  return reply.send({ uploadUrl, imageKey });
}

export async function presignSellerUpload(req: FastifyRequest, reply: FastifyReply) {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  const { uploadUrl, imageKey } = await createUploadUrl(
    `products/${req.sellerId}`,
    parsed.data.fileName,
    parsed.data.contentType
  );
  return reply.send({ uploadUrl, imageKey });
}

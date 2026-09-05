import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4003),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Verifying customer sessions: the same Supabase-compatible JWT
  // auth-service's createCustomerSession mints (see its config.ts comment).
  // This service reads/writes Supabase directly over HTTPS with the
  // service-role key — see src/lib/supabase.ts — there is no local Postgres
  // dependency here, unlike auth-service/content-service.
  supabaseJwtSecret: required("SUPABASE_JWT_SECRET"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // Verifying the shared admin JWT (issued by auth-service's
  // /api/auth/login) for the seller-approval endpoints — same secret/issuer
  // as content-service's requireAdmin middleware.
  jwtSecret: required("JWT_SECRET"),
  jwtIssuer: process.env.JWT_ISSUER ?? "dumbbrew-auth",

  // Seller accounts are a standalone identity system (email + argon2
  // password hash, generated on admin approval — not Authentik, not a
  // customer account). Deliberately a separate secret from the admin/customer
  // ones above so a leaked seller token can't be replayed as either.
  sellerJwtSecret: required("SELLER_JWT_SECRET"),
  sellerJwtIssuer: process.env.SELLER_JWT_ISSUER ?? "dumbbrew-seller",

  razorpayKeyId: required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: required("RAZORPAY_WEBHOOK_SECRET"),

  // Cloudflare R2 write credentials (S3-compatible), used only to mint
  // presigned PUT URLs — this service never proxies the file bytes
  // themselves. Distinct from the public-read R2_BASE the frontend uses
  // (gateway/public/config.js) since that one has no write access.
  r2AccountId: required("R2_ACCOUNT_ID"),
  r2AccessKeyId: required("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  r2Bucket: required("R2_BUCKET"),

  // A separate bucket (with its own public r2.dev URL, see
  // gateway/public/config.js's R2_TUTORIALS_BASE) rather than reusing
  // r2Bucket — that bucket (R2_BUCKET) has no public read access, only
  // signed GETs for seller-application photos, so tutorial images
  // (meant to be publicly viewable once published) need a bucket that
  // actually has public access turned on.
  r2TutorialsBucket: required("R2_TUTORIALS_BUCKET")
};

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

  razorpayKeyId: required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: required("RAZORPAY_WEBHOOK_SECRET")
};

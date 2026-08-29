import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtIssuer: process.env.JWT_ISSUER ?? "dumbbrew-auth",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  nodeEnv: process.env.NODE_ENV ?? "development",

  // Customer registration (Authentik + Supabase) — required only for the
  // /api/customers/register route, not the admin login routes above.
  authentikUrl: process.env.AUTHENTIK_URL ?? "http://authentik-server:9000",
  authentikApiToken: process.env.AUTHENTIK_API_TOKEN ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  termsVersion: process.env.TERMS_VERSION ?? "2026-08-30",

  // Customer login session exchange (/api/customers/session). Supabase's
  // Third-Party Auth only supports a fixed list of named providers (Firebase,
  // Clerk, WorkOS, Auth0, Cognito) — no generic OIDC issuer, so a self-hosted
  // Authentik can't be added there directly. Instead we verify Authentik's
  // own id_token here (it's HS256-signed with the OAuth2 provider's client
  // secret) and mint a Supabase-compatible JWT signed with Supabase's legacy
  // JWT secret, so auth.uid() in RLS still resolves the same way.
  authentikClientId: process.env.AUTHENTIK_CLIENT_ID ?? "",
  authentikClientSecret: process.env.AUTHENTIK_CLIENT_SECRET ?? "",
  authentikIssuer: process.env.AUTHENTIK_ISSUER ?? "",
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? ""
};

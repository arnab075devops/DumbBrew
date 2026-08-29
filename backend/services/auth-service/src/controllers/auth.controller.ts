import { createHash, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db.js";
import { config } from "../config.js";
import { signAccessToken, verifyAccessToken } from "../utils/jwt.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function issueRefreshToken(adminId: string): Promise<string> {
  const token = randomUUID() + randomUUID();
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000);
  await pool.query(
    `INSERT INTO auth.refresh_tokens (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [adminId, tokenHash, expiresAt]
  );
  return token;
}

export async function login(req: FastifyRequest, reply: FastifyReply) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const { rows } = await pool.query(
    `SELECT id, email, password_hash FROM auth.admins WHERE email = $1`,
    [email.toLowerCase()]
  );
  const admin = rows[0];
  // Always run argon2.verify even on missing user to avoid timing-based user enumeration.
  const dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$YWJjZGVmZ2hpams";
  const ok = admin ? await argon2.verify(admin.password_hash, password) : await argon2.verify(dummyHash, password).catch(() => false);
  if (!admin || !ok) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  const accessToken = signAccessToken({ sub: admin.id, email: admin.email, role: "admin" });
  const refreshToken = await issueRefreshToken(admin.id);
  return reply.send({ accessToken, refreshToken, expiresIn: config.accessTokenTtl });
}

export async function refresh(req: FastifyRequest, reply: FastifyReply) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_request" });
  }
  const tokenHash = hashRefreshToken(parsed.data.refreshToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, admin_id, expires_at, revoked_at FROM auth.refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash]
    );
    const record = rows[0];
    if (!record || record.revoked_at || new Date(record.expires_at) < new Date()) {
      await client.query("ROLLBACK");
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    await client.query(`UPDATE auth.refresh_tokens SET revoked_at = now() WHERE id = $1`, [record.id]);

    const { rows: adminRows } = await client.query(
      `SELECT id, email FROM auth.admins WHERE id = $1`,
      [record.admin_id]
    );
    const admin = adminRows[0];
    if (!admin) {
      await client.query("ROLLBACK");
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }

    const newRefreshToken = randomUUID() + randomUUID();
    const newHash = hashRefreshToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000);
    await client.query(
      `INSERT INTO auth.refresh_tokens (admin_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [admin.id, newHash, expiresAt]
    );
    await client.query("COMMIT");

    const accessToken = signAccessToken({ sub: admin.id, email: admin.email, role: "admin" });
    return reply.send({ accessToken, refreshToken: newRefreshToken, expiresIn: config.accessTokenTtl });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "invalid_request" });
  }
  const tokenHash = hashRefreshToken(parsed.data.refreshToken);
  await pool.query(
    `UPDATE auth.refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return reply.code(204).send();
}

export async function me(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return reply.code(401).send({ error: "missing_token" });
  try {
    const claims = verifyAccessToken(token);
    return reply.send({ sub: claims.sub, email: claims.email, role: claims.role });
  } catch {
    return reply.code(401).send({ error: "invalid_token" });
  }
}

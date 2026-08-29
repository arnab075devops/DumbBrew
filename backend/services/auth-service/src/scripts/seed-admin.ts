import argon2 from "argon2";
import { pool } from "../db.js";

/**
 * Seeds (or updates the password of) the single cafe admin account.
 * There is no public registration endpoint by design — this script is the
 * only way to create/rotate the admin credential.
 *
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin
 */
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD env vars are required");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await pool.query(
    `INSERT INTO auth.admins (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
    [email.toLowerCase(), passwordHash]
  );
  console.log(`Admin account ready: ${email}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

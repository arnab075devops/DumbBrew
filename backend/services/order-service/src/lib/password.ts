import { randomBytes } from "node:crypto";
import argon2 from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// Same shape used to reset the admin password manually earlier — short,
// URL-safe, printable. Shown to the admin exactly once (the approval
// response); never stored or logged anywhere in plaintext.
export function generateTempPassword(): string {
  return randomBytes(9).toString("base64").replace(/[+/=]/g, "");
}

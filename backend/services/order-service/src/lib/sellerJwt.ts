import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface SellerClaims {
  sub: string;
  role: "seller";
}

export function signSellerToken(sellerId: string): string {
  const options: jwt.SignOptions = { issuer: config.sellerJwtIssuer, expiresIn: "7d" };
  return jwt.sign({ sub: sellerId, role: "seller" }, config.sellerJwtSecret, options);
}

export function verifySellerToken(token: string): SellerClaims {
  return jwt.verify(token, config.sellerJwtSecret, { issuer: config.sellerJwtIssuer }) as SellerClaims;
}

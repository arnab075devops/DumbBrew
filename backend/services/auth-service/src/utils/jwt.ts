import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: "admin";
}

export function signAccessToken(claims: AccessTokenClaims): string {
  const options: jwt.SignOptions = {
    issuer: config.jwtIssuer,
    expiresIn: config.accessTokenTtl as jwt.SignOptions["expiresIn"]
  };
  return jwt.sign(claims, config.jwtSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, config.jwtSecret, {
    issuer: config.jwtIssuer
  }) as AccessTokenClaims;
}

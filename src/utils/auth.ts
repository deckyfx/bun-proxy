import jwt from "jsonwebtoken";

import type { BunRequest } from "bun";

import Config from "@src/config";

export function generateAccessToken<T extends Record<string, any>>(data: T) {
  return jwt.sign(data, Config.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken<T extends Record<string, any>>(data: T) {
  return jwt.sign(data, Config.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
}

export function verifyAccessToken<T extends Record<string, any> = any>(
  token: string
): T | null {
  try {
    const decoded = jwt.verify(token, Config.JWT_ACCESS_SECRET) as T;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyRefreshToken<T extends Record<string, any> = any>(
  token: string
): T | null {
  try {
    const decoded = jwt.verify(token, Config.JWT_REFRESH_SECRET) as T;
    return decoded;
  } catch {
    return null;
  }
}

export function getAccessTokenFromRequest(req: BunRequest): string | null {
  const cookies = req.cookies;
  return cookies.get("access_token");
}

export function getRefreshTokenFromRequest(req: BunRequest): string | null {
  const cookies = req.cookies;
  return cookies.get("refresh_token");
}

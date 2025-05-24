import jwt from "jsonwebtoken";

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
): T {
  return jwt.verify(token, Config.JWT_ACCESS_SECRET) as T;
}

export function verifyRefreshToken<T extends Record<string, any> = any>(
  token: string
): T {
  return jwt.verify(token, Config.JWT_REFRESH_SECRET) as T;
}

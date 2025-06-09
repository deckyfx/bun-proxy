import jwt from "jsonwebtoken";

import type { BunRequest } from "bun";

import Config from "@src/config";

export interface AuthUser {
  id: string;
  email: string;
  [key: string]: any;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthMiddleware {
  private static instance: AuthMiddleware;

  private constructor() {}

  static getInstance(): AuthMiddleware {
    if (!AuthMiddleware.instance) {
      AuthMiddleware.instance = new AuthMiddleware();
    }
    return AuthMiddleware.instance;
  }

  async authenticate(req: BunRequest): Promise<AuthUser | null> {
    // Check if auth bypass is enabled for development
    if (Config.DEBUG_BYPASS_AUTH) {
      return {
        id: "dev-user",
        email: "dev@localhost",
        role: "admin"
      };
    }

    const token = this.getAccessTokenFromRequest(req);
    if (!token) {
      return null;
    }

    return this.verifyAccessToken(token);
  }

  generateTokens<T extends Record<string, any>>(data: T): TokenPair {
    return {
      accessToken: this.generateAccessToken(data),
      refreshToken: this.generateRefreshToken(data)
    };
  }

  generateAccessToken<T extends Record<string, any>>(data: T): string {
    return jwt.sign(data, Config.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  }

  generateRefreshToken<T extends Record<string, any>>(data: T): string {
    return jwt.sign(data, Config.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  }

  verifyAccessToken<T extends Record<string, any> = AuthUser>(token: string): T | null {
    try {
      const decoded = jwt.verify(token, Config.JWT_ACCESS_SECRET) as T;
      return decoded;
    } catch {
      return null;
    }
  }

  verifyRefreshToken<T extends Record<string, any> = AuthUser>(token: string): T | null {
    try {
      const decoded = jwt.verify(token, Config.JWT_REFRESH_SECRET) as T;
      return decoded;
    } catch {
      return null;
    }
  }

  getAccessTokenFromRequest(req: BunRequest): string | null {
    // Priority 1: Bearer token from Authorization header
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.slice(7);
    }

    // Priority 2: access_token from cookies
    const cookies = req.cookies;
    return cookies.get("access_token");
  }

  getRefreshTokenFromRequest(req: BunRequest): string | null {
    const cookies = req.cookies;
    return cookies.get("refresh_token");
  }

  createUnauthorizedResponse(message = "Unauthorized"): Response {
    return new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  guard<T extends any[]>(
    handler: (req: BunRequest, user: AuthUser, ...args: T) => Promise<Response>
  ) {
    return async (req: BunRequest, ...args: T): Promise<Response> => {
      const user = await this.authenticate(req);
      if (!user) {
        return this.createUnauthorizedResponse();
      }
      return handler(req, user, ...args);
    };
  }
}

// Export singleton instance for easy access
export const authMiddleware = AuthMiddleware.getInstance();
export const Auth = AuthMiddleware.getInstance();

// Export legacy functions for backward compatibility
export function generateAccessToken<T extends Record<string, any>>(data: T): string {
  return authMiddleware.generateAccessToken(data);
}

export function generateRefreshToken<T extends Record<string, any>>(data: T): string {
  return authMiddleware.generateRefreshToken(data);
}

export function verifyAccessToken<T extends Record<string, any> = any>(token: string): T | null {
  return authMiddleware.verifyAccessToken(token);
}

export function verifyRefreshToken<T extends Record<string, any> = any>(token: string): T | null {
  return authMiddleware.verifyRefreshToken(token);
}

export function getRefreshTokenFromRequest(req: BunRequest): string | null {
  return authMiddleware.getRefreshTokenFromRequest(req);
}

export function getAccessTokenFromRequest(req: BunRequest): string | null {
  return authMiddleware.getAccessTokenFromRequest(req);
}

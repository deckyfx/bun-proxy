import jwt from "jsonwebtoken";

import type { BunRequest } from "bun";
import type { UserType } from "@db/schema/user";

import Config from "@src/config";
import { trySync } from './try';

// JWT payload should not include sensitive data like password
export interface AuthUser extends Omit<UserType, 'id' | 'password'> {
  id: string; // JWT typically uses string IDs
  [key: string]: unknown; // Allow for additional JWT claims
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
        username: "dev",
        password: "", // Not used in dev mode
        name: "Developer",
        last_login: null,
      };
    }

    const token = this.getAccessTokenFromRequest(req);
    if (!token) {
      return null;
    }

    return this.verifyAccessToken(token);
  }

  generateTokens(data: AuthUser): TokenPair {
    return {
      accessToken: this.generateAccessToken(data),
      refreshToken: this.generateRefreshToken(data),
    };
  }

  generateAccessToken(data: AuthUser): string {
    return jwt.sign(data, Config.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  }

  generateRefreshToken(data: AuthUser): string {
    return jwt.sign(data, Config.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  }

  verifyAccessToken(token: string): AuthUser | null {
    const [result, error] = trySync(() => jwt.verify(token, Config.JWT_ACCESS_SECRET) as AuthUser);
    if (error) {
      return null;
    }
    return result;
  }

  verifyRefreshToken(token: string): AuthUser | null {
    const [result, error] = trySync(() => jwt.verify(token, Config.JWT_REFRESH_SECRET) as AuthUser);
    if (error) {
      return null;
    }
    return result;
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
      headers: { "Content-Type": "application/json" },
    });
  }

  guard<T extends unknown[]>(
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
export const Auth = AuthMiddleware.getInstance();

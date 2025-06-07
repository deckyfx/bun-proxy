import type { UserType } from "@db/schema/user";

export interface LoginRequest extends Pick<UserType, "email" | "password"> {}

export interface SignupRequest extends Pick<UserType, "email" | "password" | "name"> {
  confirmPassword: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<UserType, "id" | "email">;
}

export interface RefreshRequest {
  refreshToken: string;
}
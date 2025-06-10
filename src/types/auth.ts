import type { UserType } from "@db/schema/user";

export interface LoginRequest {
  emailOrUsername: string;
  password: string;
}

export interface SignupRequest extends Pick<UserType, "email" | "username" | "password" | "name"> {
  confirmPassword: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Pick<UserType, "id" | "email" | "username">;
}

export interface RefreshRequest {
  refreshToken: string;
}
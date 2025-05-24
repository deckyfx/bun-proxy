import { generateAccessToken, generateRefreshToken } from "@backend/auth";
import type { UserData } from "@backend/types";

import { User } from "@models/User";

async function Login(req: Bun.BunRequest<"/api/login">): Promise<Response> {
  const body = (await req.json()) as Pick<UserData, "username" | "password">;
  const { username, password } = body;

  const user = await User.login(username, password);
  if (!user) {
    return new Response("Invalid credentials", { status: 401 });
  }

  const accessToken = generateAccessToken(user.public);
  const refreshToken = generateRefreshToken(user.public);

  const headers = new Headers();
  const reresh_route = "/api/refresh";
  const max_age = 604800;
  headers.append(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Path=${reresh_route}; Max-Age=${max_age}`
  );

  return new Response(JSON.stringify({ accessToken, refreshToken }), {
    headers,
    status: 200,
  });
}

export const LoginRoute = {
  POST: Login,
};

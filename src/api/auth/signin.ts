import { generateAccessToken, generateRefreshToken } from "@utils/auth";
import { type UserType } from "@db/schema";

import { User } from "@models/User";

export async function Signin(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const body = (await req.json()) as Pick<UserType, "email" | "password">;
  const { email, password } = body;

  const [user, error] = await User.signin(email, password);
  if (error) {
    return new Response(error.message, { status: 401 });
  }

  const accessToken = generateAccessToken(user.public);
  const refreshToken = generateRefreshToken(user.public);

  const reresh_route = "/api/refresh";
  const maxAge = 604800;
  const cookies = req.cookies;
  cookies.set("access_token", accessToken, {
    maxAge,
  });
  cookies.set("refresh_token", refreshToken, {
    path: reresh_route,
    maxAge,
  });

  return Response.json({ accessToken, refreshToken });
}

export const SigninRoute = {
  POST: Signin,
};

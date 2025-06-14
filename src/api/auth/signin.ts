import { Auth } from "@utils/auth";

import { User } from "@models/User";

export async function Signin(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const body = (await req.json()) as { emailOrUsername: string; password: string };
  const { emailOrUsername, password } = body;

  const [user, error] = await User.signin(emailOrUsername, password);
  if (error) {
    return new Response(error.message, { status: 401 });
  }

  // Convert user to AuthUser format (string ID, no password)
  const authUser = {
    ...user.public,
    id: user.id.toString(), // Convert number ID to string for JWT
  };
  
  const accessToken = Auth.generateAccessToken(authUser);
  const refreshToken = Auth.generateRefreshToken(authUser);

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

export default {
  signin: { POST: Signin },
};

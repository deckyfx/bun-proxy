import { getAccessTokenFromRequest, verifyAccessToken } from "@utils/auth";

import { type UserType } from "@db/schema";

export async function Me(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const token = getAccessTokenFromRequest(req);
  const user = token ? verifyAccessToken<UserType>(token) : null;
  if (!user) {
    const cookies = req.cookies;
    cookies.set("access_token", "");
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(user);
}

export const MeRoute = {
  POST: Me,
};

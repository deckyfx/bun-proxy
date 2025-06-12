import { Auth } from "@utils/auth";
import { trySync } from "@src/utils/try";

export async function Refresh(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const cookie = req.headers.get("cookie") || "";
  const refreshToken = cookie.split("refresh_token=")[1]?.split(";")[0];

  if (!refreshToken) return new Response("Missing token", { status: 401 });

  const [payload, error] = trySync(() => Auth.verifyRefreshToken(refreshToken));
  if (error) {
    return new Response("Invalid token", { status: 403 });
  }
  
  if (!payload) {
    return new Response("Invalid token", { status: 403 });
  }
  
  const accessToken = Auth.generateAccessToken(payload);
  return Response.json({ accessToken });
}

export default {
  refresh: { POST: Refresh },
};

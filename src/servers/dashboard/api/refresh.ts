import { generateAccessToken, verifyRefreshToken } from "../auth";
import type { UserData } from "../types";

export async function Refresh(
  req: Bun.BunRequest<"/api/refresh">
): Promise<Response> {
  const cookie = req.headers.get("cookie") || "";
  const refreshToken = cookie.split("refresh_token=")[1]?.split(";")[0];

  if (!refreshToken) return new Response("Missing token", { status: 401 });

  try {
    const payload = verifyRefreshToken<UserData>(refreshToken);
    const accessToken = generateAccessToken<UserData>(payload);

    return Response.json({ accessToken });
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
}

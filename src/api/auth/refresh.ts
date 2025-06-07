import {
  generateAccessToken,
  verifyRefreshToken,
} from "@utils/auth";
import { type UserType } from "@db/schema";

export async function Refresh(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const cookie = req.headers.get("cookie") || "";
  const refreshToken = cookie.split("refresh_token=")[1]?.split(";")[0];

  if (!refreshToken) return new Response("Missing token", { status: 401 });

  try {
    const payload = verifyRefreshToken<UserType>(refreshToken);
    if (!payload) {
      return new Response("Invalid token", { status: 403 });
    }
    const accessToken = generateAccessToken<UserType>(payload);

    return Response.json({ accessToken });
  } catch {
    return new Response("Invalid token", { status: 403 });
  }
}

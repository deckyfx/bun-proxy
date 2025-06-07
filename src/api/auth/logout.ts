import { verifyAccessToken } from "@utils/auth";
import { type UserType } from "@db/schema";

export async function Logout(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  try {
    const payload = verifyAccessToken<UserType>(token!);
    const cookies = req.cookies;
    cookies.set("access_token", "");
    return Response.json(payload);
  } catch {
    const cookies = req.cookies;
    cookies.set("access_token", "");
    return new Response("Unauthorized", { status: 401 });
  }
}

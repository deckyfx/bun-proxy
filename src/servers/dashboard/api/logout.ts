import { verifyAccessToken } from "../auth";
import type { UserData } from "../types";

export async function Logout(
  req: Bun.BunRequest<"/api/logout">
): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  try {
    const payload = verifyAccessToken<UserData>(token!);
    return Response.json(payload);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}

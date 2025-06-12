import { Auth } from "@utils/auth";
import { trySync } from "@src/utils/try";

export async function Logout(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const [payload, error] = trySync(() => Auth.verifyAccessToken(token!));
  const cookies = req.cookies;
  cookies.set("access_token", "");
  
  if (error) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  return Response.json(payload);
}

export default {
  logout: { POST: Logout },
};

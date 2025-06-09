import { Auth, type AuthUser } from "@utils/auth";

export async function Health(
  _: Bun.BunRequest<"/api/:scope/:command">,
  _user: AuthUser
): Promise<Response> {
  return Response.json({
    status: "ok",
  });
}

export default {
  health: { GET: Auth.guard(Health) },
};

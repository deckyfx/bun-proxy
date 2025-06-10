import { Auth, type AuthUser } from "@utils/auth";

export async function Me(
  _: Bun.BunRequest<"/api/:scope/:command">,
  user: AuthUser
): Promise<Response> {
  return Response.json(user);
}

export default {
  me: { GET: Auth.guard(Me), POST: Auth.guard(Me) },
};

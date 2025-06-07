import { User } from "@models/User";

import { type UserType } from "@db/schema";

export async function Signup(
  req: Bun.BunRequest<"/api/:scope/:command">
): Promise<Response> {
  const body = (await req.json()) as Pick<
    UserType,
    "email" | "password" | "name"
  >;
  const { email, password, name } = body;

  const [user, error] = await User.signup(email, password, name);
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify(user.public), {
    status: 200,
  });
}

export const SignupRoute = {
  POST: Signup,
};

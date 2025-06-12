import { User } from "@src/models/User";
import { Auth, type AuthUser } from "@utils/auth";
import { tryAsync } from "@src/utils/try";

export async function ListUsers(_req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const users = await User.findAll();

    // Convert to public format with status
    const usersWithStatus = users.map(user => ({
      ...user.public,
      last_login: user.last_login ? new Date(user.last_login) : null,
      status: user.last_login ? 'Active' : 'Inactive',
    }));

    return new Response(JSON.stringify(usersWithStatus), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  if (error) {
    console.error("Failed to list users:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to retrieve users",
      details: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return result;
}

export default {
  list: { GET: Auth.guard(ListUsers) },
};
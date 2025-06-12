import { User } from "@src/models/User";
import { Auth, type AuthUser } from "@utils/auth";
import { tryAsync } from "@src/utils/try";

interface UpdateUserRequest {
  id: number;
  email?: string;
  username?: string;
  password?: string;
  name?: string;
}

export async function UpdateUser(req: Request, _user: AuthUser): Promise<Response> {
  const [result, error] = await tryAsync(async () => {
    const body: UpdateUserRequest = await req.json();
    
    // Validate required fields
    if (!body.id) {
      return new Response(JSON.stringify({ 
        error: "Missing user ID"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Find user
    const user = await User.findById(body.id);
    if (!user) {
      return new Response(JSON.stringify({ 
        error: "User not found"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate email format if provided
    if (body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return new Response(JSON.stringify({ 
          error: "Invalid email format"
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Build update object with only provided fields
    const updateData: Partial<{ email: string; username: string; password: string; name: string }> = {};
    if (body.email !== undefined) updateData.email = body.email;
    if (body.username !== undefined) updateData.username = body.username;
    if (body.password !== undefined) updateData.password = body.password;
    if (body.name !== undefined) updateData.name = body.name;

    // Update user using User model
    const [updatedUser, error] = await user.update(updateData);

    if (error) {
      const statusCode = error.message.includes("already in use") ? 409 : 500;
      return new Response(JSON.stringify({ 
        error: error.message,
        details: error.message === "Email already in use" 
          ? "Another user is already using this email" 
          : error.message === "Username already in use"
          ? "Another user is already using this username"
          : undefined
      }), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userWithStatus = {
      ...updatedUser!.public,
      last_login: updatedUser!.last_login ? new Date(updatedUser!.last_login) : null,
      status: updatedUser!.last_login ? 'Active' : 'Inactive',
    };

    return new Response(JSON.stringify(userWithStatus), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  if (error) {
    console.error("Failed to update user:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to update user",
      details: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return result;
}

export default {
  update: { PUT: Auth.guard(UpdateUser) },
};
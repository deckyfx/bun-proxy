import { User } from "@src/models/User";
import { Auth, type AuthUser } from "@utils/auth";

interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  name: string;
}

export async function CreateUser(req: Request, _user: AuthUser): Promise<Response> {
  try {
    const body: CreateUserRequest = await req.json();
    
    // Validate required fields
    if (!body.email || !body.username || !body.password || !body.name) {
      return new Response(JSON.stringify({ 
        error: "Missing required fields",
        details: "Email, username, password, and name are required"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({ 
        error: "Invalid email format"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create new user using User model
    const [newUser, error] = await User.create(body.email, body.username, body.password, body.name);

    if (error) {
      const statusCode = error.message.includes("already used") ? 409 : 500;
      return new Response(JSON.stringify({ 
        error: error.message,
        details: error.message === "Email already used" 
          ? "A user with this email already exists" 
          : error.message === "Username already used"
          ? "A user with this username already exists"
          : undefined
      }), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userWithStatus = {
      ...newUser!.public,
      last_login: newUser!.last_login ? new Date(newUser!.last_login) : null,
      status: newUser!.last_login ? 'Active' : 'Inactive',
    };

    return new Response(JSON.stringify(userWithStatus), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to create user:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to create user",
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  create: { POST: Auth.guard(CreateUser) },
};
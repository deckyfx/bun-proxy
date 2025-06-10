import { User } from "@src/models/User";
import { Auth, type AuthUser } from "@utils/auth";

interface DeleteUserRequest {
  id: number;
}

export async function DeleteUser(req: Request, currentUser: AuthUser): Promise<Response> {
  try {
    const body: DeleteUserRequest = await req.json();
    
    // Validate required fields
    if (!body.id) {
      return new Response(JSON.stringify({ 
        error: "Missing user ID"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Prevent users from deleting themselves
    if (parseInt(currentUser.id) === body.id) {
      return new Response(JSON.stringify({ 
        error: "Cannot delete yourself",
        details: "You cannot delete your own account"
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Find user to delete
    const user = await User.findById(body.id);
    if (!user) {
      return new Response(JSON.stringify({ 
        error: "User not found"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete user using User model (includes superadmin protection)
    const [success, error] = await user.delete();

    if (error) {
      const statusCode = error.message === "Cannot delete superadmin" ? 403 : 500;
      return new Response(JSON.stringify({ 
        error: error.message,
        details: error.message === "Cannot delete superadmin" 
          ? "The superadmin account cannot be deleted"
          : undefined
      }), {
        status: statusCode,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: "User deleted successfully",
      deletedUser: {
        id: user.id,
        email: user.email,
        name: user.name,
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to delete user",
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  delete: { DELETE: Auth.guard(DeleteUser) },
};
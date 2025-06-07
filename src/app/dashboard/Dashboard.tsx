import { useState } from "react";
import type { UserType } from "@db/schema";
import { useAuthStore } from "@app_stores//authStore";
import { Button } from "@app_components/index";

export default function Dashboard() {
  const [healthResult, setHealthResult] = useState<any>(null);
  const [userResult, setUserResult] = useState<UserType | null>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

  const { logout, me, health, user, isLoading } = useAuthStore();

  const handleApiCall = async (
    apiCall: () => Promise<any>,
    resultSetter: (result: any) => void,
    key: string
  ) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await apiCall();
      resultSetter(result);
    } catch (error: any) {
      console.error(`${key} error:`, error);
      alert(`${key} failed: ${error.message}`);
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleLogout = async () => {
    setLoading((prev) => ({ ...prev, logout: true }));
    try {
      await logout();
    } catch (error: any) {
      console.error("Logout error:", error);
    } finally {
      setLoading((prev) => ({ ...prev, logout: false }));
    }
  };

  const handleMe = async () => {
    await handleApiCall(
      async () => {
        await me();
        return user;
      },
      setUserResult,
      "me"
    );
  };

  const handleHealth = async () => {
    await handleApiCall(health, setHealthResult, "health");
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Current User</h2>
        {user ? (
          <div className="bg-gray-100 p-4 rounded-lg">
            <p className="mb-2">
              <strong>Email:</strong> {user.email}
            </p>
            <p className="mb-2">
              <strong>Name:</strong> {user.name}
            </p>
            <p>
              <strong>ID:</strong> {user.id}
            </p>
          </div>
        ) : (
          <p className="text-gray-600">No user data available</p>
        )}
      </div>

      <div className="flex gap-4 flex-wrap mb-8">
        <Button
          onClick={handleMe}
          disabled={loading.me || isLoading}
          isLoading={loading.me}
          icon={!loading.me ? "person" : undefined}
          variant="primary"
          size="lg"
        >
          {loading.me ? "Loading..." : "Get User Info (/api/me)"}
        </Button>

        <Button
          onClick={handleHealth}
          disabled={loading.health}
          isLoading={loading.health}
          icon={!loading.health ? "health_and_safety" : undefined}
          variant="secondary"
          size="lg"
          className="bg-green-600 text-white hover:bg-green-700"
        >
          {loading.health ? "Loading..." : "Health Check (/api/health)"}
        </Button>

        <Button
          onClick={handleLogout}
          disabled={loading.logout}
          isLoading={loading.logout}
          icon={!loading.logout ? "logout" : undefined}
          variant="secondary"
          size="lg"
          className="bg-red-600 text-white hover:bg-red-700"
        >
          {loading.logout ? "Logging out..." : "Logout (/api/logout)"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-3">Me API Result</h3>
          <div className="bg-gray-50 p-4 rounded-lg min-h-24 font-mono text-sm whitespace-pre-wrap overflow-auto">
            {userResult ? JSON.stringify(userResult, null, 2) : "No data yet"}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Health API Result</h3>
          <div className="bg-gray-50 p-4 rounded-lg min-h-24 font-mono text-sm whitespace-pre-wrap overflow-auto">
            {healthResult
              ? JSON.stringify(healthResult, null, 2)
              : "No data yet"}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { UserType } from "@db/schema";
import { useAuthStore } from "@app/stores/authStore";
import { useSnackbarStore } from "@app/stores/snackbarStore";
import { useDialogStore } from "@app/stores/dialogStore";
import { Button } from "@app/components";

export default function Overview() {
  const [healthResult, setHealthResult] = useState<any>(null);
  const [userResult, setUserResult] = useState<UserType | null>(null);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});

  const { me, health, user, isLoading } = useAuthStore();
  const { showInfo, showDebug, showWarning, showAlert } = useSnackbarStore();
  const { showAlert: showAlertDialog, showConfirm, showPrompt, showCustom } = useDialogStore();

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
      <h1 className="text-3xl font-bold mb-8">Overview</h1>

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
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Test Snackbars</h2>
        <div className="flex gap-4 flex-wrap">
          <Button
            onClick={() => showInfo("This is an info message", "Information")}
            variant="primary"
            size="md"
            icon="info"
          >
            Show Info
          </Button>
          
          <Button
            onClick={() => showDebug("Debug information here", "Debug")}
            variant="secondary"
            size="md"
            icon="bug_report"
            className="bg-gray-600 text-white hover:bg-gray-700"
          >
            Show Debug
          </Button>
          
          <Button
            onClick={() => showWarning("This is a warning message", "Warning")}
            variant="secondary"
            size="md"
            icon="warning"
            className="bg-yellow-600 text-white hover:bg-yellow-700"
          >
            Show Warning
          </Button>
          
          <Button
            onClick={() => showAlert("This is an alert message", "Alert")}
            variant="secondary"
            size="md"
            icon="error"
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Show Alert
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Test Dialogs</h2>
        <div className="flex gap-4 flex-wrap">
          <Button
            onClick={() => showAlertDialog("This is an alert dialog message!")}
            variant="primary"
            size="md"
            icon="notifications"
          >
            Show Alert
          </Button>
          
          <Button
            onClick={async () => {
              const result = await showConfirm("Are you sure you want to continue?");
              showInfo(result ? "User confirmed!" : "User cancelled", "Confirm Result");
            }}
            variant="secondary"
            size="md"
            icon="help"
            className="bg-orange-600 text-white hover:bg-orange-700"
          >
            Show Confirm
          </Button>
          
          <Button
            onClick={async () => {
              const result = await showPrompt("What is your name?", { 
                placeholder: "Enter your name",
                defaultValue: "John Doe"
              });
              if (result !== null) {
                showInfo(`Hello, ${result}!`, "Prompt Result");
              } else {
                showInfo("Prompt cancelled", "Prompt Result");
              }
            }}
            variant="secondary"
            size="md"
            icon="edit"
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Show Prompt
          </Button>
          
          <Button
            onClick={() => {
              showCustom(
                <div className="space-y-4">
                  <p className="text-gray-600">This is a custom dialog with any content!</p>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-900">Custom Content</h4>
                    <p className="text-blue-800">You can put any React components here.</p>
                  </div>
                  <Button 
                    onClick={() => showInfo("Button clicked from custom dialog!")}
                    variant="primary" 
                    size="sm"
                  >
                    Test Button
                  </Button>
                </div>,
                { title: "Custom Dialog" }
              );
            }}
            variant="secondary"
            size="md"
            icon="dashboard"
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            Show Custom
          </Button>
        </div>
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
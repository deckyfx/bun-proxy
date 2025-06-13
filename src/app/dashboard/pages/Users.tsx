import { useEffect, useState } from "react";
import {
  RippleButton,
  CollapsibleCard,
  ActionLink,
} from "@app/components/index";
import Table, { type TableColumn } from "@app/components/Table";
import { PageContainer } from "../components/PageContainer";
import { useUserDialog } from "./users/UserDialog";
import { useDialogStore } from "@app/stores/dialogStore";
import {
  useUserStore,
  type User,
  type CreateUserData,
  type UpdateUserData,
} from "@app/stores/userStore";
import { useAuthStore } from "@app/stores/authStore";
import { tryAsync } from "@src/utils/try";

export default function Users() {
  const {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    clearError,
  } = useUserStore();
  const { user: currentUser } = useAuthStore();
  const { showUserDialog } = useUserDialog();
  const { showConfirm } = useDialogStore();

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleCreateUser = () => {
    showUserDialog(async (userData) => {
      setSubmitting(true);
      await tryAsync(() => createUser(userData as CreateUserData));
      setSubmitting(false);
    });
  };

  const handleEditUser = (user: User) => {
    showUserDialog(async (userData) => {
      setSubmitting(true);
      await tryAsync(() => updateUser(userData as UpdateUserData));
      setSubmitting(false);
    }, user);
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === 1) {
      await showConfirm(
        "The superadmin account (ID: 1) cannot be deleted for security reasons.",
        {
          title: "Cannot Delete Superadmin",
          confirmText: "OK",
          cancelText: undefined,
        }
      );
      return;
    }

    const confirmed = await showConfirm(
      `Are you sure you want to delete user "${user.name}"? This action cannot be undone.`,
      {
        title: "Delete User",
        confirmText: "Delete",
        cancelText: "Cancel",
      }
    );

    if (confirmed) {
      setSubmitting(true);
      await tryAsync(() => deleteUser(user.id));
      setSubmitting(false);
    }
  };

  const formatLastLogin = (lastLogin: Date | null): string => {
    if (!lastLogin) return "Never";
    return (
      lastLogin.toLocaleDateString() + " " + lastLogin.toLocaleTimeString()
    );
  };

  const columns: TableColumn<User>[] = [
    {
      key: "id",
      label: "ID",
      width: "60px",
      className: "font-medium",
    },
    {
      key: "name",
      label: "Name",
      className: "font-medium text-gray-900",
      render: (value, user) => (
        <div className="flex items-center">
          <span>{value as string}</span>
          {user.id === 1 && (
            <span className="ml-2 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
              Superadmin
            </span>
          )}
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      className: "text-gray-600",
    },
    {
      key: "status",
      label: "Status",
      render: (value) => (
        <span
          className={`px-2 py-1 text-xs font-semibold rounded-full ${
            value === "Active"
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {value as string}
        </span>
      ),
    },
    {
      key: "last_login",
      label: "Last Login",
      className: "text-gray-600 text-sm",
      render: (value) => formatLastLogin(value as Date),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, user) => (
        <div className="flex items-center space-x-3">
          <ActionLink
            icon="edit"
            onClick={() => handleEditUser(user)}
            disabled={loading || submitting}
            title="Edit user"
          />
          <ActionLink
            icon="close"
            onClick={() => handleDeleteUser(user)}
            disabled={
              loading ||
              submitting ||
              user.id === currentUser?.id ||
              user.id === 1
            }
            color="red"
            title="Delete user"
          />
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="User Management"
      maxWidth="6xl"
      actions={
        <RippleButton
          variant="solid"
          onClick={handleCreateUser}
          disabled={loading || submitting}
        >
          <span className="material-icons">person_add</span>
          <span>Add User</span>
        </RippleButton>
      }
    >
      {error && (
        <CollapsibleCard title="Error" className="mb-6">
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        </CollapsibleCard>
      )}

      <CollapsibleCard title="User Management">
        <div className="p-2">
          <div className="text-sm text-gray-500">
            Total users: {users.length}
          </div>

          <Table
            columns={columns}
            data={users}
            loading={loading}
            loadingMessage="Loading users..."
            emptyMessage="No users found"
            className="border rounded-lg"
          />
        </div>
      </CollapsibleCard>
    </PageContainer>
  );
}

import { RippleButton } from "@app/components/index";
import { useAuthStore } from "@app_stores/authStore";
import { tryAsync } from '@src/utils/try';

export function TopNavBar() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    const [, error] = await tryAsync(logout);
    
    if (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 h-[60px] flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
      </div>
      
      <div className="flex items-center space-x-4">
        {user && (
          <div className="flex items-center space-x-3">
            <div className="text-sm text-gray-300">
              <span className="font-medium">{user.name}</span>
              <div className="text-xs text-gray-400">{user.email}</div>
            </div>
            <RippleButton
              onClick={handleLogout}
              variant="soft"
              className="text-red-300 hover:text-red-200 hover:bg-red-900/20 bg-gray-700"
            >
              <span>Logout</span>
            </RippleButton>
          </div>
        )}
      </div>
    </header>
  );
}
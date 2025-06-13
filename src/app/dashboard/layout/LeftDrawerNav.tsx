import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Icon } from "@app/components/index";
import { RippleButton } from "@app/components/index";
import { useAuthStore } from "@app_stores/authStore";
import { tryAsync, trySync } from "@src/utils/try";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const navItems: NavItem[] = [
  {
    id: "analytics",
    label: "Analytics",
    icon: "analytics",
    path: "/analytics",
  },
  { id: "dns", label: "DNS", icon: "dns", path: "/dns" },
  { id: "users", label: "Users", icon: "people", path: "/users" },
  { id: "radix", label: "Radix UI", icon: "layers", path: "/radix" },
];

export function LeftDrawerNav() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeItem, setActiveItem] = useState("analytics");
  const { logout } = useAuthStore();

  // Safely try to use router hooks
  let navigate: ((path: string) => void) | null = null;
  let location: { pathname: string } | null = null;

  const [routerResult, routerError] = trySync(() => {
    return {
      navigate: useNavigate(),
      location: useLocation(),
    };
  });

  if (!routerError && routerResult) {
    navigate = routerResult.navigate;
    location = routerResult.location;
  }

  const getActiveItem = () => {
    if (location) {
      const currentPath = location.pathname;
      // Handle root path as analytics
      if (currentPath === "/" || currentPath === "") {
        return "analytics";
      }
      const activeNav = navItems.find((item) => item.path === currentPath);
      return activeNav?.id || "analytics";
    }
    return activeItem;
  };

  const handleNavClick = (item: NavItem) => {
    if (navigate) {
      navigate(item.path);
    } else {
      setActiveItem(item.id);
    }
  };

  const handleLogout = async () => {
    const [, error] = await tryAsync(logout);

    if (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-[250px]"
      }`}
    >
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center justify-between text-gray-600 hover:text-gray-900 clickable"
        >
          {!isCollapsed && <span className="font-medium">Navigation</span>}
          <Icon name={isCollapsed ? "menu" : "menu_open"} size={20} />
        </button>
      </div>

      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => handleNavClick(item)}
                className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors clickable ${
                  getActiveItem() === item.id
                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  className={getActiveItem() === item.id ? "text-blue-600" : ""}
                />
                {!isCollapsed && (
                  <span className="ml-3 font-medium">{item.label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-2 border-t border-gray-200">
        <RippleButton
          onClick={handleLogout}
          variant="soft"
          className={`w-full text-red-600 hover:text-red-700 hover:bg-red-50 ${
            isCollapsed ? "px-2" : ""
          }`}
        >
          {isCollapsed ? (
            <span className="material-icons text-red-600">logout</span>
          ) : (
            <span>Logout</span>
          )}
        </RippleButton>
      </div>
    </aside>
  );
}

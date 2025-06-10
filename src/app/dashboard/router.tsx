import { HashRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import DashboardApp from "./DashboardApp";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import DNS from "./pages/DNS";

export default function Router() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Always render the same structure to avoid hydration mismatches
  return (
    <div>
      {!isClient ? (
        // SSR: render Analytics by default
        <DashboardApp />
      ) : (
        // Client: use HashRouter
        <HashRouter>
          <Routes>
            <Route path="/" element={<DashboardApp />}>
              <Route index element={<Analytics />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="dns" element={<DNS />} />
              <Route path="users" element={<Users />} />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </div>
  );
}

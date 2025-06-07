import { HashRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import DashboardApp from "./DashboardApp";
import Overview from "./pages/Overview";
import Debug from "./pages/Debug";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import DNS from "./pages/DNS";

export default function Router() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    console.log(isClient);
    setIsClient(true);
  }, []);

  // Always render the same structure to avoid hydration mismatches
  return (
    <div>
      {!isClient ? (
        // SSR: render Overview by default
        <DashboardApp />
      ) : (
        // Client: use HashRouter
        <HashRouter>
          <Routes>
            <Route path="/" element={<DashboardApp />}>
              <Route index element={<Overview />} />
              <Route path="overview" element={<Overview />} />
              <Route path="debug" element={<Debug />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="users" element={<Users />} />
              <Route path="dns" element={<DNS />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </div>
  );
}

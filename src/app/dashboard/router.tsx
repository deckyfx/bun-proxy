import { HashRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import Dashboard from "./Dashboard";

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
        // SSR: render SignIn by default
        <Dashboard />
      ) : (
        // Client: use HashRouter
        <HashRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
          </Routes>
        </HashRouter>
      )}
    </div>
  );
}

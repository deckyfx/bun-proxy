import { HashRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";

import SignIn from "./views/SignIn";
import SignUp from "./views/SignUp";

export default function Router() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Always render the same structure to avoid hydration mismatches
  return (
    <div>
      {!isClient ? (
        // SSR: render SignIn by default
        <SignIn />
      ) : (
        // Client: use HashRouter
        <HashRouter>
          <Routes>
            <Route path="/" element={<SignIn />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
          </Routes>
        </HashRouter>
      )}
    </div>
  );
}

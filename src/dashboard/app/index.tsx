import React, { Suspense } from "react";

import Router from "./router";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <React.StrictMode>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </React.StrictMode>
    </Suspense> 
  );
}

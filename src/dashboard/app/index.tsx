import React from "react";

import Router from "./router";
import { AuthProvider } from "./contexts/AuthContext";

export default function App() {
  return (
    <React.StrictMode>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </React.StrictMode>
  );
}

import React from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@app/contexts/AuthContext";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAuth();
  return tokens ? <>{children}</> : <Navigate to="/login" replace />;
}

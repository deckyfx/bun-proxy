import React from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "@app/contexts/AuthContext";

export default function GuestRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tokens } = useAuth();
  return tokens ? <Navigate to="/" replace /> : <>{children}</>;
}

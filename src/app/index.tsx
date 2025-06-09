import React from "react";
import AuthRouter from "./auth/router";
import DashboardRouter from "./dashboard/router";

interface IndexProps {
  isAuthenticated: boolean;
}

export default function Index({ isAuthenticated }: IndexProps) {
  return (
    <React.StrictMode>
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>{isAuthenticated ? "Dashboard" : "Authentication"}</title>
          <link rel="icon" type="image/x-icon" href="/assets/favicon.ico" />

          <link rel="stylesheet" href="/assets/styles/tailwind.css" />
        </head>
        <body className="min-h-screen bg-gray-50">
          <div id="auth-root" style={{ display: isAuthenticated ? 'none' : 'flex' }} className="min-h-screen items-center justify-center px-4">
            {!isAuthenticated && <AuthRouter />}
          </div>
          <div
            id="dashboard-root"
            style={{ display: isAuthenticated ? "block" : "none" }}
          >
            {isAuthenticated && <DashboardRouter />}
          </div>
        </body>
      </html>
    </React.StrictMode>
  );
}

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
          <link rel="stylesheet" href="/assets/icons/material-icons.css" />
          <style>{`
            .auth-container {
              max-width: 400px;
              margin: 100px auto;
              padding: 20px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .auth-container div {
              margin-bottom: 15px;
            }
            .auth-container label {
              display: block;
              margin-bottom: 5px;
            }
            .auth-container input {
              width: 100%;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 4px;
            }
            .auth-container button {
              width: 100%;
              padding: 10px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
            }
            .auth-container button:disabled {
              background: #ccc;
            }
          `}</style>
        </head>
        <body>
          <div id="auth-root" style={{ display: isAuthenticated ? 'none' : 'block' }}>
            {!isAuthenticated && <AuthRouter />}
          </div>
          <div id="dashboard-root" style={{ display: isAuthenticated ? 'block' : 'none' }}>
            {isAuthenticated && <DashboardRouter />}
          </div>
        </body>
      </html>
    </React.StrictMode>
  );
}

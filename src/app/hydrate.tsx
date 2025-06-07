// hydrate.tsx
/// <reference lib="dom" />

import { hydrateRoot } from "react-dom/client";
import AuthRouter from "./auth/router";
import DashboardRouter from "./dashboard/router";

// Check if containers exist and hydrate accordingly
const authContainer = document.getElementById('auth-root');
const dashboardContainer = document.getElementById('dashboard-root');

if (authContainer && authContainer.style.display !== 'none') {
  hydrateRoot(authContainer, <AuthRouter />);
}

if (dashboardContainer && dashboardContainer.style.display !== 'none') {
  hydrateRoot(dashboardContainer, <DashboardRouter />);
}

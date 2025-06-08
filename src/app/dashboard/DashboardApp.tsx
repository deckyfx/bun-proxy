import { Outlet } from "react-router-dom";
import { DashboardLayout } from "./layout";
import { SnackbarContainer, DialogContainer, ErrorBoundary } from "@app_components/index";

export default function DashboardApp() {
  return (
    <ErrorBoundary>
      <DashboardLayout>
        <Outlet />
        <SnackbarContainer />
        <DialogContainer />
      </DashboardLayout>
    </ErrorBoundary>
  );
}
import { Outlet } from "react-router-dom";
import { DashboardLayout } from "./layout";
import { SnackbarContainer, DialogContainer, ErrorBoundary } from "@app/components/index";
import { Theme } from "@radix-ui/themes";

export default function DashboardApp() {
  return (
    <Theme>
      <ErrorBoundary>
        <DashboardLayout>
          <Outlet />
          <SnackbarContainer />
          <DialogContainer />
        </DashboardLayout>
      </ErrorBoundary>
    </Theme>
  );
}
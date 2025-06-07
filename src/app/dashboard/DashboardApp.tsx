import { Outlet } from "react-router-dom";
import { DashboardLayout } from "./layout";
import { SnackbarContainer, DialogContainer } from "@app/components";

export default function DashboardApp() {
  return (
    <DashboardLayout>
      <Outlet />
      <SnackbarContainer />
      <DialogContainer />
    </DashboardLayout>
  );
}
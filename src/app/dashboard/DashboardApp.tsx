import { Outlet } from "react-router-dom";
import { DashboardLayout } from "./layout";
import { SnackbarContainer, DialogContainer } from "@app_components/index";

export default function DashboardApp() {
  return (
    <DashboardLayout>
      <Outlet />
      <SnackbarContainer />
      <DialogContainer />
    </DashboardLayout>
  );
}
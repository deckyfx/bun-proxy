import React from "react";
import { Box } from "@mui/material";

import Topbar from "./Topbar";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const sidebarWidth = collapsed ? 60 : 240;

  return (
    <Box display="flex" flexDirection="column" height="100vh">
      <Topbar />
      <Box display="flex" flex="1" overflow="hidden">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <Box
          component="main"
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
          }}
        >
          <Box flex="1" p={3}>
            {children}
          </Box>
          <Footer />
        </Box>
      </Box>
    </Box>
  );
}

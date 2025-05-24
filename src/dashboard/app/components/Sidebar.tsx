import React from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Divider,
  Typography,
} from "@mui/material";
import {
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Logout as LogoutIcon,
  Home as HomeIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  Build as BuildIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@app/contexts/AuthContext";

type MenuItem = {
  label: string;
  icon: React.ReactNode;
  path?: string;
  submenu?: { label: string; path: string }[];
};

const menus: MenuItem[] = [
  { label: "Home", icon: <HomeIcon />, path: "/" },
  {
    label: "Settings",
    icon: <SettingsIcon />,
    submenu: [
      { label: "Profile", path: "/settings/profile" },
      { label: "Account", path: "/settings/account" },
    ],
  },
  { label: "About", icon: <InfoIcon />, path: "/about" },
  { label: "Tools", icon: <BuildIcon />, path: "/tools" },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { setTokens } = useAuth();
  const navigate = useNavigate();

  const logout = () => {
    setTokens(null as any);
    localStorage.removeItem("tokens");
    navigate("/login");
  };

  const sidebarWidth = collapsed ? 64 : 240;

  return (
    <Box
      sx={{
        width: sidebarWidth,
        height: "100%",
        bgcolor: "#202123",
        color: "white",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        transition: "width 0.3s",
        userSelect: "none",
      }}
    >
      {/* Top toggle button */}
      <Box
        sx={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-end",
          px: 1,
          borderBottom: "1px solid #444",
        }}
      >
        <IconButton
          onClick={onToggle}
          sx={{ color: "white", p: 0.5 }}
          size="large"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>

      {/* Menu list */}
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        <List disablePadding>
          {menus.map((menu, i) =>
            menu.submenu ? (
              <Accordion
                key={i}
                sx={{
                  background: "transparent",
                  color: "inherit",
                  boxShadow: "none",
                  "&.Mui-expanded": { margin: 0 },
                  "&::before": { display: "none" },
                }}
                disableGutters
              >
                <AccordionSummary
                  expandIcon={
                    <ExpandMoreIcon sx={{ color: "white", fontSize: 18 }} />
                  }
                  sx={{
                    minHeight: 48,
                    "& .MuiAccordionSummary-content": {
                      margin: 0,
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: "white", minWidth: 36 }}>
                    {menu.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <Typography
                      sx={{
                        fontWeight: 500,
                        fontSize: 14,
                        userSelect: "none",
                      }}
                    >
                      {menu.label}
                    </Typography>
                  )}
                </AccordionSummary>
                <AccordionDetails sx={{ px: collapsed ? 0 : 2, py: 0 }}>
                  <List disablePadding>
                    {menu.submenu.map((sub, j) => (
                      <ListItemButton
                        key={j}
                        onClick={() => navigate(sub.path)}
                        sx={{
                          pl: collapsed ? 2 : 4,
                          py: 0.5,
                          minHeight: 36,
                          borderRadius: 1,
                          "&:hover": {
                            bgcolor: "rgba(255, 255, 255, 0.08)",
                          },
                        }}
                      >
                        {!collapsed && (
                          <ListItemText
                            primary={sub.label}
                            primaryTypographyProps={{ fontSize: 13 }}
                          />
                        )}
                      </ListItemButton>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            ) : (
              <Tooltip
                key={i}
                title={collapsed ? menu.label : ""}
                placement="right"
              >
                <ListItemButton
                  onClick={() => menu.path && navigate(menu.path)}
                  sx={{
                    px: 1,
                    py: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: collapsed ? 0 : 1.5,
                    borderRadius: 1,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                      color: "white",
                      justifyContent: "center",
                    }}
                  >
                    {menu.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={menu.label}
                      primaryTypographyProps={{ fontSize: 14 }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            )
          )}
        </List>
      </Box>

      {/* Divider */}
      <Divider sx={{ borderColor: "#444" }} />

      {/* Logout sticky at bottom */}
      <Box sx={{ p: 1, mt: "auto" }}>
        <Tooltip title={collapsed ? "Logout" : ""} placement="right">
          <ListItemButton
            onClick={logout}
            sx={{
              px: 1,
              py: 1,
              borderRadius: 1,
              color: "white",
              "&:hover": { bgcolor: "rgba(255,0,0,0.15)" },
              justifyContent: collapsed ? "center" : "flex-start",
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 36,
                color: "error.main",
                justifyContent: "center",
              }}
            >
              <LogoutIcon />
            </ListItemIcon>
            {!collapsed && <ListItemText primary="Logout" />}
          </ListItemButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

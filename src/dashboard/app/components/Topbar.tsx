import { AppBar, Toolbar, Typography, Breadcrumbs, Link } from "@mui/material";

export default function Topbar() {
  return (
    <AppBar position="static" color="primary">
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          My App Logo
        </Typography>
        <Breadcrumbs color="inherit">
          <Link underline="hover" color="inherit" href="#">
            Home
          </Link>
          <Typography color="inherit">Dashboard</Typography>
        </Breadcrumbs>
      </Toolbar>
    </AppBar>
  );
}

import { Typography, Container, Paper, Button } from "@mui/material";

import { useNavigate } from "react-router-dom";

import { useAuth } from "@app/contexts/AuthContext";

import ProtectedRoute from "@app/components/ProtectedRoute";

export default function Dashboard() {
  const { tokens, setTokens } = useAuth();

  const navigate = useNavigate();

  const logout = () => {
    setTokens(null as any);
    localStorage.removeItem("tokens");
    navigate("/login");
  };

  return (
    <ProtectedRoute>
      <Container maxWidth="md">
        <Paper elevation={2} sx={{ mt: 6, p: 4 }}>
          <Typography variant="h4" gutterBottom>
            Dashboard
          </Typography>
          {tokens ? (
            <>
              <Typography>Access Token:</Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                {tokens.accessToken}
              </Typography>
            </>
          ) : (
            <Typography>You are not logged in.</Typography>
          )}
        </Paper>
        <Button
          onClick={logout}
          color="error"
          variant="outlined"
          sx={{ mt: 3 }}
        >
          Logout
        </Button>
      </Container>
    </ProtectedRoute>
  );
}

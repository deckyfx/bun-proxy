import { HashRouter, Routes, Route } from "react-router-dom";
import LoginForm from "./views/LoginForm";
import DashboardPage from "./views/DashboardPage";

export default function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginForm />} />
      </Routes>
    </HashRouter>
  );
}

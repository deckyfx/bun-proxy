import { HashRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";
import Analytics from "./pages/Analytics";
import Users from "./pages/Users";
import DNS from "./pages/DNS";
import RadixUI from "./pages/RadixUI";

export default function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />}>
          <Route index element={<Analytics />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="dns" element={<DNS />} />
          <Route path="users" element={<Users />} />
          <Route path="radix" element={<RadixUI />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

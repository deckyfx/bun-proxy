import { HashRouter, Routes, Route } from "react-router-dom";

import SignIn from "./views/SignIn";
import SignUp from "./views/SignUp";

export default function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
      </Routes>
    </HashRouter>
  );
}

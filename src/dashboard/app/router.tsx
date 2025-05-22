import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./Home";
import Page2 from "./Page2";

export default function Router() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/page2" element={<Page2 />} />
      </Routes>
    </HashRouter>
  );
}

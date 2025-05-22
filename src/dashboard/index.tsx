import { createRoot } from "react-dom/client";

import App from "./app";

function start() {
  const domNode = document.getElementById("root")!;
  const root = createRoot(domNode);
  root.render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

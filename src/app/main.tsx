import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/tailwind.css";
import { App } from "./App";

window.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

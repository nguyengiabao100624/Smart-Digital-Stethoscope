import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import { ThemeToggle } from "./components/ThemeToggle";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Không tìm thấy phần tử gốc của Smart Health Care");
}

createRoot(root).render(
  <StrictMode>
    <App />
    <ThemeToggle />
  </StrictMode>,
);

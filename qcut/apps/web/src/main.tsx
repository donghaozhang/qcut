import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// Suppress noisy layout normalization warnings from third-party resizable components
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].startsWith("WARNING: Invalid layout total size")
  ) {
    return; // Ignore this specific warning
  }
  return (originalWarn as (...a: unknown[]) => unknown).apply(console, args);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

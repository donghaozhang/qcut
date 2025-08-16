import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// Blob URL monitoring intentionally disabled to comply with no-console policy.

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Root element "#root" not found');
}
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

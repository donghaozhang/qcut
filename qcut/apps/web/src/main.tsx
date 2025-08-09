import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// NUCLEAR OPTION 1: Verify React downgrade
console.log(`🚨 [REACT-DOWNGRADE] Application starting with React ${React.version}`);
console.log(`🚨 [REACT-DOWNGRADE] ReactDOM loaded successfully (React 18 compatible)`);

// Add global error tracking for infinite loops
let globalRenderCount = 0;
const originalLog = console.log;
console.log = (...args) => {
  globalRenderCount++;
  if (globalRenderCount > 100) {
    console.error(`🚨 [REACT-DOWNGRADE] GLOBAL: Excessive console activity (${globalRenderCount} calls) - possible infinite loop`);
  }
  return originalLog.apply(console, args);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

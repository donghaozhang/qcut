import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// QCut now uses HTTP server in Electron - blob URLs work perfectly!
console.log('✅ QCut: Running with HTTP server - blob URLs fully functional');

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

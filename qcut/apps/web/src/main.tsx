import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// DEBUG: Override URL.createObjectURL to track all blob URL creation
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = function(object: File | MediaSource | Blob) {
  const url = originalCreateObjectURL.call(this, object);
  console.error("[BLOB DEBUG] Blob URL created:", {
    url,
    type: object.constructor.name,
    size: object instanceof File || object instanceof Blob ? object.size : 'unknown',
    name: object instanceof File ? object.name : 'no-name',
    stack: new Error().stack
  });
  return url;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

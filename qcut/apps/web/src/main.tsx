import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// Simple debug check for blob URLs (can be removed in production)
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = function(object: File | MediaSource | Blob) {
  const url = originalCreateObjectURL.call(this, object);
  if (url.startsWith('blob:file:///')) {
    console.error('❌ Still creating problematic blob URL:', url, object);
  }
  return url;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

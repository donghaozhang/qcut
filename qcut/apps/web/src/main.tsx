import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// Clean blob URL monitoring (optional - can be removed in production)
console.log('✅ QCut: Blob URL fix applied - using data URLs instead of blob URLs');

// Optional: Keep minimal monitoring for any remaining blob URL creation
const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = function(object: File | MediaSource | Blob) {
  const url = originalCreateObjectURL.call(this, object);
  
  // Only warn if problematic blob URLs are still being created
  if (url.startsWith('blob:file:///')) {
    console.warn('⚠️ Blob URL still created (should be rare):', url);
  }
  
  return url;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

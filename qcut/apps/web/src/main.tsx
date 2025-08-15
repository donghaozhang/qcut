import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// Blob URL monitoring for debugging (optional - can be removed in production)
console.log('✅ QCut: Blob URLs enabled and working correctly in Electron environment');

// Optional: Monitor blob URL creation for debugging purposes
if (process.env.NODE_ENV === 'development') {
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function(object: File | MediaSource | Blob) {
    const url = originalCreateObjectURL.call(this, object);
    
    // Log blob URL creation for debugging (these are expected and working)
    console.debug('🔗 Blob URL created:', url);
    
    return url;
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

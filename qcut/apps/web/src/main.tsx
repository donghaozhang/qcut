import React from "react";
import ReactDOM from "react-dom/client";
import "./app/globals.css";
import App from "./App";

// Enhanced blob URL monitoring with stack traces
console.error('🔍 [MONITORING] === ENHANCED DEBUGGING BUILD v2.0 ===');
console.error('🔍 [MONITORING] Blob URL monitoring installed!');
alert('ENHANCED DEBUGGING BUILD v2.0 - Console monitoring active!');

const originalCreateObjectURL = URL.createObjectURL;
URL.createObjectURL = function(object: File | MediaSource | Blob) {
  const url = originalCreateObjectURL.call(this, object);
  
  // AGGRESSIVE LOGGING - Always log ALL blob URL creation
  console.error('🔍 [BLOB-MONITOR] URL Created:', {
    url: url,
    isProblematic: url.startsWith('blob:file:///'),
    objectType: object.constructor.name,
    objectSize: object instanceof File ? object.size : 'unknown',
    fileName: object instanceof File ? object.name : 'not-a-file',
    timestamp: new Date().toISOString(),
    stack: new Error().stack
  });
  
  if (url.startsWith('blob:file:///')) {
    console.error('❌❌❌ PROBLEMATIC BLOB URL DETECTED:', url);
    console.error('❌❌❌ Object details:', object);
    console.error('❌❌❌ Call stack:', new Error().stack);
    // Make this VERY visible in console
    alert(`BLOB URL ERROR DETECTED: ${url.substring(0, 50)}...`);
  }
  
  return url;
};

// Test the monitoring immediately
console.error('🔍 [MONITORING] Creating test blob to verify monitoring...');
try {
  const testBlob = new Blob(['test'], { type: 'text/plain' });
  const testUrl = URL.createObjectURL(testBlob);
  console.error('🔍 [MONITORING] Test blob created:', testUrl);
  URL.revokeObjectURL(testUrl);
} catch (e) {
  console.error('🔍 [MONITORING] Test failed:', e);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

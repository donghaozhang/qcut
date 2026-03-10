import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import App from "./App";
import { setupPlatform } from "./platform-init";

// Development memory profiler
if (import.meta.env.DEV) {
	import("./lib/debug/dev-memory-profiler");
}

// Blob URL monitoring intentionally disabled to comply with no-console policy.

const rootEl = document.getElementById("root");
if (!rootEl) {
	throw new Error('Root element "#root" not found');
}

// Initialize platform adapter before rendering
setupPlatform().then(() => {
	ReactDOM.createRoot(rootEl).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>
	);
});

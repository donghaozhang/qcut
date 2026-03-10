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
setupPlatform()
	.then(() => {
		ReactDOM.createRoot(rootEl).render(
			<React.StrictMode>
				<App />
			</React.StrictMode>
		);
	})
	.catch((error) => {
		// Render minimal fallback so users don't see a blank screen
		const root = ReactDOM.createRoot(rootEl);
		root.render(
			<div style={{ padding: "2rem", fontFamily: "system-ui" }}>
				<h1>QCut failed to start</h1>
				<p>Platform initialization error. Please restart the application.</p>
				<pre style={{ fontSize: "0.8rem", color: "#888" }}>
					{error instanceof Error ? error.message : String(error)}
				</pre>
			</div>
		);
	});

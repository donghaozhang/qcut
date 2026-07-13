import { Suspense, useEffect, useState } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { createHashHistory } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { LocaleSync } from "./components/locale-sync";

// Create router with hash history for Electron
const router = createRouter({
	routeTree,
	history: createHashHistory(),
	defaultPreload: "intent",
	context: {},
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

function App() {
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		// Small delay to ensure DOM and Electron environment is ready
		const timer = setTimeout(() => {
			setIsReady(true);
		}, 100);

		return () => clearTimeout(timer);
	}, []);

	if (!isReady) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				Initializing...
			</div>
		);
	}

	return (
		<Suspense
			fallback={
				<div className="flex items-center justify-center min-h-screen">
					Loading...
				</div>
			}
		>
			<LocaleSync />
			<RouterProvider router={router} />
		</Suspense>
	);
}

export default App;

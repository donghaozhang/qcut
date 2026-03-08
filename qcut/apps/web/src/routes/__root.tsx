import React, { useEffect } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StorageProvider } from "@/components/storage-provider";
import { UpdateNotification } from "@/components/update-notification";
import { FFmpegHealthNotification } from "@/components/ffmpeg-health-notification";
import { ErrorBoundary } from "@/components/error-boundary";
import { BlobUrlCleanup } from "@/components/providers/migrators/blob-url-cleanup";
import { initializeRemotionStore } from "@/stores/ai/remotion-store";
import { useLicenseStore } from "@/stores/license-store";
import { setupClaudeBridgeLifecycle } from "@/lib/claude-bridge/claude-bridge-lifecycle";
import { debugLog } from "@/lib/debug/debug-config";
import "@/lib/media/blob-url-debug"; // Enable blob URL debugging in development

/**
 * Remotion Store Initializer
 * Ensures Remotion components are registered at app startup,
 * before any timeline elements try to render them.
 */
function RemotionInitializer() {
	useEffect(() => {
		debugLog("[REMOTION] Initializing Remotion store");
		initializeRemotionStore();
	}, []);
	return null;
}

/**
 * Claude Bridge Initializer
 * Connects renderer-side IPC listeners so the Claude HTTP API
 * can read timeline/project data from Zustand stores.
 */
function ClaudeInitializer() {
	useEffect(() => {
		return setupClaudeBridgeLifecycle();
	}, []);
	return null;
}

/**
 * License Initializer
 * Fetches license + user profile at app startup so auth state
 * is available on all pages (header avatar, projects page, etc.)
 */
function LicenseInitializer() {
	const checkLicense = useLicenseStore((s) => s.checkLicense);
	useEffect(() => {
		checkLicense();
	}, [checkLicense]);
	return null;
}

export const Route = createRootRoute({
	component: () => (
		<ThemeProvider attribute="class" defaultTheme="dark">
			<RemotionInitializer />
			<ClaudeInitializer />
			<LicenseInitializer />
			<TooltipProvider>
				<ErrorBoundary>
					<StorageProvider>
						<BlobUrlCleanup>
							<ErrorBoundary isolate>
								<Outlet />
							</ErrorBoundary>
							<Toaster />
							<UpdateNotification />
							<FFmpegHealthNotification />
						</BlobUrlCleanup>
					</StorageProvider>
				</ErrorBoundary>
			</TooltipProvider>
		</ThemeProvider>
	),
	errorComponent: ({ error }) => {
		// TanStack Router error fallback - enhanced with our error boundary style
		const errorId = `ROUTER-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

		return (
			<ThemeProvider attribute="class" defaultTheme="dark">
				<div className="min-h-screen flex items-center justify-center p-6 bg-background">
					<div className="w-full max-w-md text-center space-y-4">
						<div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
							<svg
								className="w-8 h-8 text-destructive"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
								focusable="false"
							>
								<title>Error icon</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 19c-.77.833.192 2.5 1.732 2.5z"
								/>
							</svg>
						</div>
						<h1 className="text-2xl font-bold text-foreground">
							Navigation Error
						</h1>
						<p className="text-muted-foreground">
							Failed to load the requested page
						</p>
						<div className="font-mono text-xs bg-muted p-2 rounded break-all text-muted-foreground">
							Error ID: {errorId}
						</div>
						<pre className="text-sm text-destructive bg-destructive/5 p-3 rounded overflow-auto max-h-32">
							{error instanceof Error ? error.message : String(error)}
						</pre>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
						>
							Reload Page
						</button>
					</div>
				</div>
				<Toaster />
			</ThemeProvider>
		);
	},
});

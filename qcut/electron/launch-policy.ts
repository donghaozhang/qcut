/**
 * Launch-critical decision policies for the main process.
 *
 * Extracted from `main.ts` closures so the decisions that previously caused
 * silent launch failures on Windows are unit-testable. See
 * docs/task/windows-cannot-open-qcut/FIX-PLAN.md.
 *
 * @module electron/launch-policy
 */

export type PortBindAction = "retry-next" | "fallback-random" | "reject";

/**
 * Decide how the static server should react to a port-bind error.
 *
 * `EACCES` is retried like `EADDRINUSE`: Windows WinNAT (Hyper-V/WSL2)
 * reserves excluded port ranges, and binding inside one fails with EACCES,
 * not EADDRINUSE. Once the scan passes `maxPort`, fall back to an
 * OS-assigned random port (port 0) instead of failing startup; if even the
 * random-port bind fails, reject.
 */
export function nextPortAction({
	code,
	port,
	maxPort,
}: {
	code: string | undefined;
	port: number;
	maxPort: number;
}): PortBindAction {
	if (code !== "EADDRINUSE" && code !== "EACCES") return "reject";
	if (port === 0) return "reject";
	if (port < maxPort) return "retry-next";
	return "fallback-random";
}

/**
 * Decide which URL the main window loads.
 *
 * Packaged builds must ignore an inherited NODE_ENV — a user machine with
 * NODE_ENV=development set globally would otherwise point the packaged app
 * at the (absent) Vite dev server and white-screen.
 */
export function resolveRendererTarget({
	isPackaged,
	nodeEnv,
}: {
	isPackaged: boolean;
	nodeEnv: string | undefined;
}): { isDev: boolean; url: string } {
	const isDev = !isPackaged && nodeEnv === "development";
	return {
		isDev,
		url: isDev ? "http://localhost:5173" : "app://./index.html",
	};
}

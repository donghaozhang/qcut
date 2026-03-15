/**
 * Pi Agent barrel export.
 *
 * Lazy-loaded to avoid ESM/CJS incompatibility at startup.
 * pi-mono packages (@mariozechner/pi-ai, pi-agent-core) are ESM-only
 * but Electron main process uses CJS. We defer the import to runtime.
 *
 * @module electron/pi-agent
 */

export async function setupPiAgentIPC(): Promise<void> {
	try {
		const { setupPiAgentIPCImpl } = await import("./pi-agent-handler.js");
		setupPiAgentIPCImpl();
		console.log("✅ PiAgentIPC registered");
	} catch (err) {
		console.warn(
			"⚠️ PiAgentIPC not available (pi-mono packages may not be installed):",
			(err as Error).message
		);
	}
}

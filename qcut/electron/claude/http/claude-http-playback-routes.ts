import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";

/**
 * Real-time playback diagnostics pulled from the renderer's
 * window.__qcutPlaybackDiagnostics collector (installed by the preview
 * panel). Consumed by scripts/playback-diagnose.ts.
 */
export function registerPlaybackDiagnosticsRoutes(
	router: Router,
	options: {
		pullSnapshot: () => Promise<unknown>;
		resetCollector: () => Promise<unknown>;
	}
): void {
	router.get("/api/claude/playback/diagnostics", async () => {
		const snapshot = await options.pullSnapshot();
		if (
			!snapshot ||
			typeof snapshot !== "object" ||
			(snapshot as { installed?: boolean }).installed !== true
		) {
			throw new HttpError(
				503,
				"Playback diagnostics collector is not installed (editor not open?)"
			);
		}
		return snapshot;
	});

	router.post("/api/claude/playback/diagnostics/reset", async () => {
		const result = await options.resetCollector();
		if (
			!result ||
			typeof result !== "object" ||
			(result as { installed?: boolean }).installed !== true
		) {
			throw new HttpError(
				503,
				"Playback diagnostics collector is not installed (editor not open?)"
			);
		}
		return { reset: true };
	});
}

const SNAPSHOT_SCRIPT = `(() => {
	const collector = window.__qcutPlaybackDiagnostics;
	if (!collector) return { installed: false };
	try {
		return collector.snapshot();
	} catch (error) {
		return { installed: false, error: String(error) };
	}
})()`;

const RESET_SCRIPT = `(() => {
	const collector = window.__qcutPlaybackDiagnostics;
	if (!collector) return { installed: false };
	collector.reset();
	return { installed: true };
})()`;

export async function pullPlaybackDiagnosticsFromRenderer(win: {
	webContents: { executeJavaScript: (script: string) => Promise<unknown> };
}): Promise<unknown> {
	return await win.webContents.executeJavaScript(SNAPSHOT_SCRIPT);
}

export async function resetPlaybackDiagnosticsInRenderer(win: {
	webContents: { executeJavaScript: (script: string) => Promise<unknown> };
}): Promise<unknown> {
	return await win.webContents.executeJavaScript(RESET_SCRIPT);
}

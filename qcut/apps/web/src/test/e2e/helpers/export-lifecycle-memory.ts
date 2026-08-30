/**
 * Renderer/utility process memory sampling and export-progress polling for
 * the export lifecycle stability E2E.
 *
 * Electron's `app.getAppMetrics()` reports one row per OS process (Browser,
 * Tab/renderer, Utility, GPU, ...) with `workingSetSize`/`peakWorkingSetSize`
 * in Kilobytes. Sampling it through Playwright's `electronApp.evaluate` needs
 * no new production code or IPC route — the main process already exposes the
 * Electron `app` object to that evaluate call. Export progress is read the
 * same way, from the renderer's already-exposed `window.__exportStore`.
 */

import type { ElectronApplication, Page } from "playwright";

export interface ProcessMemorySample {
	name?: string;
	peakWorkingSetSizeKb: number;
	pid: number;
	type: string;
	workingSetSizeKb: number;
}

export interface MemorySnapshot {
	atMs: number;
	label: string;
	samples: ProcessMemorySample[];
}

export interface ExportProgressSample {
	isExporting: boolean;
	progress: number;
	status: string;
}

/** One `app.getAppMetrics()` call, flattened to plain serializable rows. */
export async function sampleMemory({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<ProcessMemorySample[]> {
	return electronApp.evaluate(({ app }) =>
		app.getAppMetrics().map((metric) => ({
			name: metric.name,
			peakWorkingSetSizeKb: metric.memory.peakWorkingSetSize,
			pid: metric.pid,
			type: metric.type,
			workingSetSizeKb: metric.memory.workingSetSize,
		}))
	);
}

/** MB, rounded to one decimal, for readable evidence JSON. */
function toMb(kb: number): number {
	return Math.round((kb / 1024) * 10) / 10;
}

/** Peak `workingSetSize`, in MB, per process `type`, across a memory series. */
export function peakByType(series: MemorySnapshot[]): Record<string, number> {
	const peakKb: Record<string, number> = {};
	for (const snapshot of series) {
		for (const sample of snapshot.samples) {
			const current = peakKb[sample.type] ?? 0;
			if (sample.workingSetSizeKb > current) {
				peakKb[sample.type] = sample.workingSetSizeKb;
			}
		}
	}
	const peakMb: Record<string, number> = {};
	for (const [type, kb] of Object.entries(peakKb)) {
		peakMb[type] = toMb(kb);
	}
	return peakMb;
}

/** Sum of `workingSetSize` across every process in one snapshot, in MB. */
export function totalMb(samples: ProcessMemorySample[]): number {
	return toMb(
		samples.reduce((sum, sample) => sum + sample.workingSetSizeKb, 0)
	);
}

/** Reads the renderer's export progress from the already-exposed store. */
export async function readExportProgress({
	page,
}: {
	page: Page;
}): Promise<ExportProgressSample> {
	return page.evaluate(() => {
		const store = (
			window as unknown as {
				__exportStore: {
					getState: () => { progress: ExportProgressSample };
				};
			}
		).__exportStore;
		return store.getState().progress;
	});
}

/**
 * Starts an automated export without blocking on completion: the export
 * promise is stashed on `window`, so the caller can poll progress/memory
 * while it runs and collect the result later with `collectExportResult`.
 */
export async function dispatchExportLocalVideo({
	page,
	request,
}: {
	page: Page;
	request: {
		engine: "muxer";
		filename: string;
		format: "mp4";
		frameRate: number;
		height: number;
		outputPath: string;
		projectId: string;
		quality: "1080p" | "720p" | "480p";
		width: number;
	};
}): Promise<void> {
	await page.evaluate((exportRequest) => {
		const actions = (
			window as unknown as {
				__exportActions?: {
					exportLocalVideo: (r: typeof exportRequest) => Promise<void>;
				};
			}
		).__exportActions;
		if (!actions) throw new Error("Export actions are not registered");
		(
			window as unknown as {
				__lifecyclePendingExport?: Promise<{ ok: boolean; error?: string }>;
			}
		).__lifecyclePendingExport = actions.exportLocalVideo(exportRequest).then(
			() => ({ ok: true }),
			(error: unknown) => ({
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			})
		);
	}, request);
}

/** Awaits the export dispatched by `dispatchExportLocalVideo`. */
export async function collectExportResult({
	page,
}: {
	page: Page;
}): Promise<{ ok: boolean; error?: string }> {
	return page.evaluate(
		() =>
			(
				window as unknown as {
					__lifecyclePendingExport?: Promise<{ ok: boolean; error?: string }>;
				}
			).__lifecyclePendingExport ??
			Promise.resolve({ ok: false, error: "no pending export" })
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until the renderer reports an export in flight (`isExporting`). */
export async function waitForExportStart({
	page,
	timeoutMs = 5_000,
}: {
	page: Page;
	timeoutMs?: number;
}): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const progress = await readExportProgress({ page });
		if (progress.isExporting) return;
		await sleep(25);
	}
	throw new Error("Export did not start (isExporting stayed false)");
}

/**
 * Polls export progress and process memory together, appending every tick
 * to `series`. Resolves as soon as `stopAtProgress` is met (used to catch an
 * export mid-flight for a cancel) or `isExporting` flips back to false
 * (natural completion/failure/cancel), whichever comes first.
 */
export async function pollWhileExporting({
	page,
	electronApp,
	series,
	label,
	intervalMs = 150,
	timeoutMs,
	stopAtProgress,
}: {
	page: Page;
	electronApp: ElectronApplication;
	series: MemorySnapshot[];
	label: string;
	intervalMs?: number;
	timeoutMs: number;
	stopAtProgress?: number;
}): Promise<ExportProgressSample> {
	const deadline = Date.now() + timeoutMs;
	const startedAt = Date.now();
	let last: ExportProgressSample | null = null;
	while (Date.now() < deadline) {
		const [progress, samples] = await Promise.all([
			readExportProgress({ page }),
			sampleMemory({ electronApp }),
		]);
		last = progress;
		series.push({ atMs: Date.now() - startedAt, label, samples });
		if (stopAtProgress !== undefined && progress.progress >= stopAtProgress) {
			return progress;
		}
		if (stopAtProgress === undefined && !progress.isExporting) {
			return progress;
		}
		await sleep(intervalMs);
	}
	throw new Error(
		`Export "${label}" did not reach the expected state within ${timeoutMs}ms ` +
			`(last: ${JSON.stringify(last)})`
	);
}

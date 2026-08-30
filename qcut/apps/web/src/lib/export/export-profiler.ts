/**
 * Structured export profiler.
 *
 * Off by default: every hook is a single boolean check until a caller arms
 * the profiler for one export (the Claude export bridge does this when the
 * request carries a `profilePath`). While armed it records per-stage wall
 * times and counters, and on `finishAndSave` writes one JSON report through
 * the Electron file bridge. Production exports never pay more than the
 * disabled-path boolean checks.
 */

interface StageStats {
	count: number;
	totalMs: number;
	p50Ms: number;
	p95Ms: number;
	maxMs: number;
}

interface FrameRecord {
	frame: number;
	totalMs: number;
}

export interface ExportProfileReport {
	schemaVersion: 1;
	kind: "qcut-export-profile-v1";
	startedAt: string;
	finishedAt: string;
	wallMs: number;
	meta: Record<string, unknown>;
	stages: Record<string, StageStats>;
	counters: Record<string, number>;
	slowestFrames: FrameRecord[];
	frameCount: number;
	frameTotalP50Ms: number;
	frameTotalP95Ms: number;
	frameTotalMaxMs: number;
}

const SLOWEST_FRAME_LIMIT = 20;

function percentile(sorted: readonly number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.floor(sorted.length * fraction)
	);
	return sorted[index];
}

function summarize(durations: number[]): StageStats {
	const sorted = [...durations].sort((left, right) => left - right);
	return {
		count: sorted.length,
		totalMs: sorted.reduce((sum, value) => sum + value, 0),
		p50Ms: percentile(sorted, 0.5),
		p95Ms: percentile(sorted, 0.95),
		maxMs: sorted.at(-1) ?? 0,
	};
}

class ExportProfiler {
	private enabled = false;
	private targetPath: string | undefined;
	private startedAtMs = 0;
	private startedAtIso = "";
	private stageDurations = new Map<string, number[]>();
	private counters = new Map<string, number>();
	private frameTotals: FrameRecord[] = [];
	private activeFrame = -1;
	private activeFrameStartMs = 0;

	get isEnabled(): boolean {
		return this.enabled;
	}

	/** Arm the profiler for the next export; report lands at targetPath. */
	arm({ targetPath }: { targetPath: string }): void {
		this.enabled = true;
		this.targetPath = targetPath;
		this.startedAtMs = performance.now();
		this.startedAtIso = new Date().toISOString();
		this.stageDurations = new Map();
		this.counters = new Map();
		this.frameTotals = [];
		this.activeFrame = -1;
	}

	disarm(): void {
		this.enabled = false;
		this.targetPath = undefined;
	}

	/** Time an async stage; passes through untouched when disabled. */
	async time<T>(stage: string, run: () => Promise<T>): Promise<T> {
		if (!this.enabled) return run();
		const start = performance.now();
		try {
			return await run();
		} finally {
			this.record(stage, performance.now() - start);
		}
	}

	/** Time a synchronous stage; passes through untouched when disabled. */
	timeSync<T>(stage: string, run: () => T): T {
		if (!this.enabled) return run();
		const start = performance.now();
		try {
			return run();
		} finally {
			this.record(stage, performance.now() - start);
		}
	}

	record(stage: string, durationMs: number): void {
		if (!this.enabled) return;
		const bucket = this.stageDurations.get(stage);
		if (bucket) bucket.push(durationMs);
		else this.stageDurations.set(stage, [durationMs]);
	}

	count(name: string, delta = 1): void {
		if (!this.enabled) return;
		this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
	}

	frameStart(frame: number): void {
		if (!this.enabled) return;
		this.activeFrame = frame;
		this.activeFrameStartMs = performance.now();
	}

	frameEnd(): void {
		if (!this.enabled || this.activeFrame < 0) return;
		this.frameTotals.push({
			frame: this.activeFrame,
			totalMs: performance.now() - this.activeFrameStartMs,
		});
		this.activeFrame = -1;
	}

	buildReport(meta: Record<string, unknown>): ExportProfileReport {
		const stages: Record<string, StageStats> = {};
		for (const [stage, durations] of this.stageDurations) {
			stages[stage] = summarize(durations);
		}
		const totals = this.frameTotals
			.map(({ totalMs }) => totalMs)
			.sort((left, right) => left - right);
		const slowestFrames = [...this.frameTotals]
			.sort((left, right) => right.totalMs - left.totalMs)
			.slice(0, SLOWEST_FRAME_LIMIT);
		return {
			schemaVersion: 1,
			kind: "qcut-export-profile-v1",
			startedAt: this.startedAtIso,
			finishedAt: new Date().toISOString(),
			wallMs: performance.now() - this.startedAtMs,
			meta,
			stages,
			counters: Object.fromEntries(this.counters),
			slowestFrames,
			frameCount: totals.length,
			frameTotalP50Ms: percentile(totals, 0.5),
			frameTotalP95Ms: percentile(totals, 0.95),
			frameTotalMaxMs: totals.at(-1) ?? 0,
		};
	}

	/** Serialize and persist the report, then disarm. Safe no-op when off. */
	async finishAndSave(meta: Record<string, unknown>): Promise<void> {
		if (!this.enabled) return;
		const targetPath = this.targetPath;
		const report = this.buildReport(meta);
		this.disarm();
		if (!targetPath) return;
		try {
			const written = await window.electronAPI?.writeFile?.(
				targetPath,
				`${JSON.stringify(report, null, 2)}\n`
			);
			if (written) {
				console.log(`[ExportProfiler] Profile written to ${targetPath}`);
			} else {
				console.warn(
					`[ExportProfiler] Profile write refused for ${targetPath}`
				);
			}
		} catch (error) {
			// A failed profile write must never fail the export itself.
			console.warn("[ExportProfiler] Profile write failed:", error);
		}
	}
}

export const exportProfiler = new ExportProfiler();

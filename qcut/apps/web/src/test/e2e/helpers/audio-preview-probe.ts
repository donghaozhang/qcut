/**
 * Realtime audio preview probe.
 *
 * Counts the work the live preview graph does per playback tick: AudioParam
 * automation calls, graph construction, and media-element property writes.
 *
 * All wrappers live in the test. The master-clock rate and long-task counts
 * come from the app's own playback diagnostics collector, so main-thread load
 * is measured the same way `scripts/playback-diagnose.ts` measures it rather
 * than by a parallel implementation.
 */

import type { ElectronApplication, Page } from "@playwright/test";

export interface AudioPreviewStats {
	installed: boolean;
	setTargetAtTime: number;
	cancelScheduledValues: number;
	linearRamp: number;
	setValueAtTime: number;
	mediaElementSources: number;
	/** Graphs created since install; reset() does not clear these. */
	mediaElementSourcesTotal: number;
	/** AudioNode.disconnect calls since install, a graph-teardown proxy. */
	disconnectsTotal: number;
	audioContexts: number;
	/** Wall time spent inside the wrapped AudioParam calls, milliseconds. */
	paramMs: number;
	contextState: string | null;
	baseLatencyMs: number | null;
	sampleRate: number | null;
}

const PROBE_KEY = "__audioPreviewProbe";

/** Wraps the AudioParam automation surface and graph constructors. */
export async function installAudioPreviewProbe({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate((probeKey) => {
		const target = window as unknown as Record<string, unknown>;
		const existing = target[probeKey] as { restore?: () => void } | undefined;
		existing?.restore?.();

		const paramProto = AudioParam.prototype as unknown as Record<
			string,
			(...args: unknown[]) => unknown
		>;
		const contextProto = AudioContext.prototype as unknown as Record<
			string,
			(...args: unknown[]) => unknown
		>;

		const state = {
			audioContexts: 0,
			cancelScheduledValues: 0,
			contexts: [] as AudioContext[],
			linearRamp: 0,
			disconnectsTotal: 0,
			mediaElementSources: 0,
			mediaElementSourcesTotal: 0,
			paramMs: 0,
			restore: () => undefined as void,
			setTargetAtTime: 0,
			setValueAtTime: 0,
		};
		target[probeKey] = state;

		const originals: Array<[Record<string, unknown>, string, unknown]> = [];
		const wrapParam = (name: keyof typeof state & string, method: string) => {
			const original = paramProto[method];
			originals.push([paramProto, method, original]);
			paramProto[method] = function wrapped(...args: unknown[]) {
				const startedAt = performance.now();
				const result = original.apply(this, args);
				state.paramMs += performance.now() - startedAt;
				(state[name] as number) += 1;
				return result;
			};
		};
		wrapParam("setTargetAtTime", "setTargetAtTime");
		wrapParam("cancelScheduledValues", "cancelScheduledValues");
		wrapParam("linearRamp", "linearRampToValueAtTime");
		wrapParam("setValueAtTime", "setValueAtTime");

		const originalCreateSource = contextProto.createMediaElementSource;
		originals.push([
			contextProto,
			"createMediaElementSource",
			originalCreateSource,
		]);
		const nodeProto = AudioNode.prototype as unknown as Record<
			string,
			(...args: unknown[]) => unknown
		>;
		const originalDisconnect = nodeProto.disconnect;
		originals.push([nodeProto, "disconnect", originalDisconnect]);
		nodeProto.disconnect = function wrappedDisconnect(...args: unknown[]) {
			state.disconnectsTotal += 1;
			return originalDisconnect.apply(this, args);
		};

		contextProto.createMediaElementSource = function wrapped(
			...args: unknown[]
		) {
			state.mediaElementSources += 1;
			state.mediaElementSourcesTotal += 1;
			if (!state.contexts.includes(this as AudioContext)) {
				state.contexts.push(this as AudioContext);
				state.audioContexts = state.contexts.length;
			}
			return originalCreateSource.apply(this, args);
		};

		state.restore = () => {
			for (const [holder, key, original] of originals) {
				(holder as Record<string, unknown>)[key] = original;
			}
		};
	}, PROBE_KEY);
}

/** Zeroes the counters without removing the wrappers. */
export async function resetAudioPreviewProbe({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate((probeKey) => {
		const state = (window as unknown as Record<string, unknown>)[probeKey] as
			| Record<string, number>
			| undefined;
		if (!state) return;
		state.cancelScheduledValues = 0;
		state.linearRamp = 0;
		state.mediaElementSources = 0;
		state.paramMs = 0;
		state.setTargetAtTime = 0;
		state.setValueAtTime = 0;
	}, PROBE_KEY);
}

/** Reads the counters plus the shared context's health. */
export async function readAudioPreviewProbe({
	page,
}: {
	page: Page;
}): Promise<AudioPreviewStats> {
	return await page.evaluate((probeKey) => {
		const state = (window as unknown as Record<string, unknown>)[probeKey] as
			| {
					audioContexts: number;
					cancelScheduledValues: number;
					contexts: AudioContext[];
					linearRamp: number;
					disconnectsTotal: number;
					mediaElementSources: number;
					mediaElementSourcesTotal: number;
					paramMs: number;
					setTargetAtTime: number;
					setValueAtTime: number;
			  }
			| undefined;
		if (!state) {
			return {
				audioContexts: 0,
				baseLatencyMs: null,
				cancelScheduledValues: 0,
				contextState: null,
				installed: false,
				linearRamp: 0,
				disconnectsTotal: 0,
				mediaElementSources: 0,
				mediaElementSourcesTotal: 0,
				paramMs: 0,
				sampleRate: null,
				setTargetAtTime: 0,
				setValueAtTime: 0,
			};
		}
		const context = state.contexts[0];
		return {
			audioContexts: state.audioContexts,
			baseLatencyMs: context ? context.baseLatency * 1000 : null,
			cancelScheduledValues: state.cancelScheduledValues,
			contextState: context ? context.state : null,
			installed: true,
			linearRamp: state.linearRamp,
			disconnectsTotal: state.disconnectsTotal,
			mediaElementSources: state.mediaElementSources,
			mediaElementSourcesTotal: state.mediaElementSourcesTotal,
			paramMs: Number(state.paramMs.toFixed(2)),
			sampleRate: context ? context.sampleRate : null,
			setTargetAtTime: state.setTargetAtTime,
			setValueAtTime: state.setValueAtTime,
		};
	}, PROBE_KEY);
}

/** Master clock health from the app's own collector. */
export async function readClockHealth({ page }: { page: Page }): Promise<{
	clockHz: number;
	clockP95Ms: number;
	longTasks: number;
	longTaskMs: number;
	elapsedSeconds: number;
}> {
	return await page.evaluate(() => {
		const api = (
			window as unknown as {
				__qcutPlaybackDiagnostics?: { snapshot: () => Record<string, never> };
			}
		).__qcutPlaybackDiagnostics;
		if (!api) {
			return {
				clockHz: 0,
				clockP95Ms: 0,
				elapsedSeconds: 0,
				longTaskMs: 0,
				longTasks: 0,
			};
		}
		const snapshot = api.snapshot() as unknown as {
			clockIntervalsMs: number[];
			installedAt: number;
			now: number;
			longTaskTotalCount: number;
			longTaskTotalDurationMs: number;
		};
		const intervals = [...snapshot.clockIntervalsMs].sort((a, b) => a - b);
		const totalMs = snapshot.clockIntervalsMs.reduce(
			(sum, value) => sum + value,
			0
		);
		const elapsedSeconds = totalMs / 1000;
		return {
			clockHz:
				elapsedSeconds > 0
					? Number(
							(snapshot.clockIntervalsMs.length / elapsedSeconds).toFixed(2)
						)
					: 0,
			clockP95Ms: intervals.length
				? Number(intervals[Math.floor(intervals.length * 0.95)].toFixed(2))
				: 0,
			elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
			longTaskMs: Number(snapshot.longTaskTotalDurationMs.toFixed(1)),
			longTasks: snapshot.longTaskTotalCount,
		};
	});
}

/** Clears the app's diagnostics ring buffers. */
export async function resetClockHealth({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		(
			window as unknown as {
				__qcutPlaybackDiagnostics?: { reset: () => void };
			}
		).__qcutPlaybackDiagnostics?.reset();
	});
}

/** Sums Electron process CPU and memory. */
export async function readProcessMetrics({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<{ cpuPercent: number; memoryMb: number }> {
	return await electronApp.evaluate(({ app }) => {
		let cpuPercent = 0;
		let memoryKb = 0;
		for (const entry of app.getAppMetrics()) {
			cpuPercent += entry.cpu?.percentCPUUsage ?? 0;
			memoryKb += entry.memory?.workingSetSize ?? 0;
		}
		return { cpuPercent, memoryMb: memoryKb / 1024 };
	});
}

/** Formats one measurement for the test log. */
export function formatAudioStats({
	label,
	stats,
	clock,
	cpuPercent,
	memoryMb,
	clips,
}: {
	label: string;
	stats: AudioPreviewStats;
	clock: { clockHz: number; clockP95Ms: number; longTasks: number };
	cpuPercent: number;
	memoryMb: number;
	clips: number;
}): string {
	const perClipTick =
		clock.clockHz > 0 && clips > 0
			? stats.setTargetAtTime / Math.max(1, clock.clockHz * clips)
			: 0;
	return (
		`[audio-preview] ${label.padEnd(22)} setTarget=${String(stats.setTargetAtTime).padStart(6)} ` +
		`cancel=${String(stats.cancelScheduledValues).padStart(6)} ` +
		`perClipPerTick=${perClipTick.toFixed(1).padStart(5)} ` +
		`paramMs=${stats.paramMs.toFixed(1).padStart(7)} ` +
		`graphsTotal=${stats.mediaElementSourcesTotal} disconnects=${stats.disconnectsTotal} contexts=${stats.audioContexts} ` +
		`clockHz=${clock.clockHz.toFixed(1)} clockP95=${clock.clockP95Ms.toFixed(1)}ms ` +
		`longTasks=${clock.longTasks} cpu=${cpuPercent.toFixed(1)}% mem=${memoryMb.toFixed(0)}MB ` +
		`ctx=${stats.contextState}`
	);
}

export interface AudioScalingSample {
	label: string;
	clips: number;
	setTargetAtTime: number;
	windowSeconds: number;
	clockHz: number;
}

export interface AudioScalingSummary {
	/** Automation writes per clip per master-clock tick. */
	perClipPerTick: Record<string, number>;
	/** Writes per second at the largest layer count. */
	peakWritesPerSecond: number;
	/**
	 * True when per-clip cost is flat across layer counts, i.e. the graph scales
	 * linearly rather than superlinearly.
	 */
	scalesLinearly: boolean;
}

/**
 * Derives per-clip automation cost from a set of scenario samples.
 *
 * Raw call counts are not comparable between scenarios because both the layer
 * count and the tick rate differ, so everything is normalised to
 * writes-per-clip-per-tick before any claim about scaling is made.
 */
export function summarizeAudioScaling({
	samples,
	toleranceRatio = 0.15,
}: {
	samples: readonly AudioScalingSample[];
	toleranceRatio?: number;
}): AudioScalingSummary {
	const perClipPerTick: Record<string, number> = {};
	let peakWritesPerSecond = 0;
	for (const sample of samples) {
		const ticks = Math.max(1, sample.clockHz * sample.windowSeconds);
		const perClip =
			sample.setTargetAtTime / (ticks * Math.max(1, sample.clips));
		perClipPerTick[sample.label] = Number(perClip.toFixed(2));
		const perSecond =
			sample.windowSeconds > 0
				? sample.setTargetAtTime / sample.windowSeconds
				: 0;
		if (perSecond > peakWritesPerSecond) peakWritesPerSecond = perSecond;
	}
	const values = Object.values(perClipPerTick);
	const min = values.length ? Math.min(...values) : 0;
	const max = values.length ? Math.max(...values) : 0;
	return {
		peakWritesPerSecond: Number(peakWritesPerSecond.toFixed(0)),
		perClipPerTick,
		scalesLinearly: max <= min * (1 + toleranceRatio),
	};
}

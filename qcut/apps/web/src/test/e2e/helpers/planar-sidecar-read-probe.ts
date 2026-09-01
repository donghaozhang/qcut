/**
 * Planar tracking sidecar read probe.
 *
 * Counts how many times the tracking sidecar is actually fetched, verified and
 * parsed during playback, seeking and export.
 *
 * The wrapper is installed in the MAIN process, around the registered
 * `planar-tracking-storage:read` invoke handler. Wrapping the renderer-side
 * bridge does not work: `contextBridge` freezes the exposed object, so
 * assigning to `electronAPI.planarTrackingStorage.read` silently does nothing
 * and every measurement reads zero. Production code is untouched either way.
 */

import type { ElectronApplication } from "@playwright/test";

export const PLANAR_READ_CHANNEL = "planar-tracking-storage:read";

export interface SidecarReadStats {
	/** Number of completed reads since the last reset. */
	reads: number;
	/** Wall time spent inside those reads, in milliseconds. */
	totalMs: number;
	/** Slowest single read, in milliseconds. */
	maxMs: number;
	/** Distinct resultUri values that were read. */
	uris: string[];
	/** Sample counts of the sidecars returned. */
	sampleCounts: number[];
	/** Reads since install, ignoring resets. */
	totalEver: number;
	/** True when the probe is installed and counting. */
	installed: boolean;
}

interface ProbeState {
	maxMs: number;
	reads: number;
	sampleCounts: number[];
	totalEver: number;
	totalMs: number;
	uris: string[];
}

const PROBE_KEY = "__planarSidecarReadProbe";

/**
 * Installs the counting wrapper around the main-process invoke handler.
 * Throws if the handler cannot be found or wrapped, rather than silently
 * reporting zero reads.
 */
export async function installSidecarReadProbe({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<void> {
	await electronApp.evaluate(
		({ ipcMain }, { channel, probeKey }) => {
			const globalStore = globalThis as unknown as Record<string, unknown>;

			// Electron keeps invoke handlers in an internal map. This is a private
			// field, so verify it looks right before relying on it.
			const handlers = (
				ipcMain as unknown as {
					_invokeHandlers?: Map<string, (...args: unknown[]) => unknown>;
				}
			)._invokeHandlers;
			if (!handlers || typeof handlers.get !== "function") {
				throw new Error(
					"Sidecar read probe: ipcMain._invokeHandlers is unavailable"
				);
			}

			const existing = globalStore[probeKey] as
				| { original?: (...args: unknown[]) => unknown }
				| undefined;
			// Restore first so repeated installs never nest wrappers.
			if (existing?.original) handlers.set(channel, existing.original);

			const original = handlers.get(channel);
			if (typeof original !== "function") {
				throw new Error(
					`Sidecar read probe: no invoke handler registered for ${channel}`
				);
			}

			const state = {
				maxMs: 0,
				original,
				reads: 0,
				sampleCounts: [] as number[],
				totalEver: 0,
				totalMs: 0,
				uris: [] as string[],
			};
			globalStore[probeKey] = state;

			handlers.set(channel, async (...args: unknown[]) => {
				const startedAt = Date.now();
				const response = (await state.original(...args)) as {
					sidecar?: { samples?: unknown[] };
				};
				const elapsed = Date.now() - startedAt;
				state.reads += 1;
				state.totalEver += 1;
				state.totalMs += elapsed;
				if (elapsed > state.maxMs) state.maxMs = elapsed;
				const request = args[1] as { resultUri?: string } | undefined;
				const uri = request?.resultUri;
				if (uri && !state.uris.includes(uri)) state.uris.push(uri);
				const sampleCount = response?.sidecar?.samples?.length;
				if (typeof sampleCount === "number") {
					state.sampleCounts.push(sampleCount);
				}
				return response;
			});

			if (handlers.get(channel) === original) {
				throw new Error(
					"Sidecar read probe could not be installed: handler map is not writable"
				);
			}
		},
		{ channel: PLANAR_READ_CHANNEL, probeKey: PROBE_KEY }
	);
}

/** Zeroes the counters without removing the wrapper. */
export async function resetSidecarReadProbe({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<void> {
	await electronApp.evaluate((_electron, probeKey) => {
		const state = (globalThis as unknown as Record<string, unknown>)[
			probeKey
		] as ProbeState | undefined;
		if (!state) return;
		state.maxMs = 0;
		state.reads = 0;
		state.sampleCounts = [];
		state.totalMs = 0;
		state.uris = [];
	}, PROBE_KEY);
}

/** Reads the current counters. */
export async function readSidecarReadProbe({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<SidecarReadStats> {
	return await electronApp.evaluate((_electron, probeKey) => {
		const state = (globalThis as unknown as Record<string, unknown>)[
			probeKey
		] as ProbeState | undefined;
		if (!state) {
			return {
				installed: false,
				maxMs: 0,
				reads: 0,
				sampleCounts: [],
				totalEver: 0,
				totalMs: 0,
				uris: [],
			};
		}
		return {
			installed: true,
			maxMs: state.maxMs,
			reads: state.reads,
			sampleCounts: [...state.sampleCounts],
			totalEver: state.totalEver,
			totalMs: state.totalMs,
			uris: [...state.uris],
		};
	}, PROBE_KEY);
}

/** Formats a stats line for the test log. */
export function formatSidecarStats({
	label,
	stats,
}: {
	label: string;
	stats: SidecarReadStats;
}): string {
	const samples = stats.sampleCounts[0];
	return (
		`[planar-bench] ${label.padEnd(30)} reads=${String(stats.reads).padStart(4)} ` +
		`totalMs=${stats.totalMs.toFixed(1).padStart(8)} maxMs=${stats.maxMs.toFixed(1).padStart(6)} ` +
		`uris=${stats.uris.length} everSinceInstall=${stats.totalEver}` +
		(typeof samples === "number" ? ` samplesPerRead=${samples}` : "")
	);
}

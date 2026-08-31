/**
 * Canvas allocation probe.
 *
 * Counts `document.createElement("canvas")` calls inside the page so an export
 * can be checked for per-frame canvas churn. Production code is untouched: the
 * wrapper lives entirely in the test.
 *
 * Allocations are bucketed by the size the canvas ends up at, and a short
 * creation stack is sampled for the largest bucket so the call chain behind the
 * churn can be named rather than guessed.
 */

import type { Page } from "@playwright/test";

export interface CanvasAllocationStats {
	installed: boolean;
	total: number;
	bySize: Record<string, number>;
	sampleStacks: string[];
	/** One representative creation stack per size bucket. */
	stackBySize: Record<string, string>;
}

const PROBE_KEY = "__canvasAllocationProbe";

/** Installs the counting wrapper. Safe to call repeatedly. */
export async function installCanvasCounter({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate((probeKey) => {
		const target = window as unknown as Record<string, unknown>;
		const existing = target[probeKey] as
			| { original?: typeof document.createElement }
			| undefined;
		if (existing?.original) {
			document.createElement = existing.original;
		}

		const original = document.createElement.bind(document);
		const state = {
			bySize: {} as Record<string, number>,
			original: document.createElement,
			sampleStacks: [] as string[],
			stackBySize: {} as Record<string, string>,
			total: 0,
		};
		target[probeKey] = state;

		document.createElement = ((tagName: string, options?: unknown) => {
			const element = original(tagName as "canvas", options as never);
			if (String(tagName).toLowerCase() !== "canvas") return element;
			state.total += 1;
			const stack = new Error("canvas-allocation").stack ?? "";
			const trimmed = stack.split("\n").slice(1, 5).join(" | ").slice(0, 400);
			// Size is set right after creation, so read it on the next microtask.
			queueMicrotask(() => {
				const canvas = element as HTMLCanvasElement;
				const key = `${canvas.width}x${canvas.height}`;
				state.bySize[key] = (state.bySize[key] ?? 0) + 1;
				// One stack per size bucket names the allocator for that bucket,
				// which is what distinguishes the colour stack from the muxer's own
				// frame-wrapping canvases.
				if (!state.stackBySize[key]) state.stackBySize[key] = trimmed;
			});
			return element;
		}) as typeof document.createElement;
	}, PROBE_KEY);
}

/** Zeroes the counters, keeping the wrapper installed. */
export async function resetCanvasCounter({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate((probeKey) => {
		const state = (window as unknown as Record<string, unknown>)[probeKey] as
			| {
					bySize: Record<string, number>;
					sampleStacks: string[];
					total: number;
			  }
			| undefined;
		if (!state) return;
		state.bySize = {};
		state.sampleStacks = [];
		state.stackBySize = {};
		state.total = 0;
	}, PROBE_KEY);
}

/** Reads the counters. */
export async function readCanvasCounter({
	page,
}: {
	page: Page;
}): Promise<CanvasAllocationStats> {
	// Let the size-recording microtasks flush first.
	await page.evaluate(
		() => new Promise<void>((resolve) => queueMicrotask(() => resolve()))
	);
	return await page.evaluate((probeKey) => {
		const state = (window as unknown as Record<string, unknown>)[probeKey] as
			| {
					bySize: Record<string, number>;
					sampleStacks: string[];
					total: number;
			  }
			| undefined;
		if (!state) {
			return {
				bySize: {},
				installed: false,
				sampleStacks: [],
				stackBySize: {},
				total: 0,
			};
		}
		return {
			bySize: { ...state.bySize },
			installed: true,
			sampleStacks: [...state.sampleStacks],
			stackBySize: { ...state.stackBySize },
			total: state.total,
		};
	}, PROBE_KEY);
}

/** Reads the renderer's JS heap, when the runtime exposes it. */
export async function readHeapMb({ page }: { page: Page }): Promise<number> {
	return await page.evaluate(() => {
		const memory = (
			performance as unknown as { memory?: { usedJSHeapSize?: number } }
		).memory;
		return memory?.usedJSHeapSize
			? Number((memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
			: 0;
	});
}

/** Formats one measurement for the test log. */
export function formatAllocationStats({
	label,
	stats,
	frames,
	elements,
}: {
	label: string;
	stats: CanvasAllocationStats;
	frames: number;
	elements: number;
}): string {
	const perFrame = frames > 0 ? stats.total / frames : 0;
	const perElementFrame =
		frames > 0 && elements > 0 ? stats.total / (frames * elements) : 0;
	const top = Object.entries(stats.bySize)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([size, count]) => `${size}:${count}`)
		.join(" ");
	return (
		`[color-alloc] ${label.padEnd(26)} canvases=${String(stats.total).padStart(5)} ` +
		`perFrame=${perFrame.toFixed(2).padStart(6)} ` +
		`perElementFrame=${perElementFrame.toFixed(2).padStart(6)} ` +
		`top=[${top}]`
	);
}

/**
 * Effects frame-logging probe.
 *
 * `applyEffectsToCanvas` emits five `console.log` calls every time it runs,
 * which on the canvas export path is once per element per frame (effects
 * stacked on one element are merged first) and once per adjustment-layer
 * effect element per frame.
 *
 * This probe measures two things the export benchmark cannot separate:
 *  - how much one such logging burst actually costs, and
 *  - how that cost changes when something is consuming the console
 *    (DevTools open, or a Playwright console listener attached).
 *
 * The microbenchmark replicates the exact call shape rather than importing the
 * function, because the renderer bundle does not expose it to the page. The
 * replica is validated against the real export delta in the spec.
 */

import type { Page } from "@playwright/test";

export type LoggingVariant = "logs" | "gated" | "none";

export interface LoggingMeasurement {
	variant: LoggingVariant;
	consumerAttached: boolean;
	iterations: number;
	totalMs: number;
	perCallUs: number;
	p50Us: number;
	p95Us: number;
}

function percentile(values: readonly number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.floor(sorted.length * fraction)
	);
	return sorted[index];
}

/**
 * Runs one variant of the logging burst `iterations` times against a real
 * canvas context and returns per-call timings in microseconds.
 */
export async function measureLoggingVariant({
	page,
	variant,
	iterations,
	consumerAttached,
}: {
	page: Page;
	variant: LoggingVariant;
	iterations: number;
	consumerAttached: boolean;
}): Promise<LoggingMeasurement> {
	const samples = await page.evaluate(
		({ iterations, variant }) => {
			const canvas = document.createElement("canvas");
			canvas.width = 320;
			canvas.height = 240;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not create a 2d context");

			// Same shape as a merged effect parameter set.
			const parameters = {
				blur: 0,
				brightness: 12,
				contrast: 8,
				grayscale: 0,
				saturation: 20,
				sepia: 0,
			};
			const filterString = "brightness(1.12) contrast(1.08) saturate(1.2)";

			const timings: number[] = [];
			for (let index = 0; index < iterations; index += 1) {
				const startedAt = performance.now();
				if (variant === "logs") {
					// Verbatim copy of the production burst.
					console.log("🎨 CANVAS EFFECTS: Applying filter to canvas context");
					console.log("  🔧 Parameters:", parameters);
					console.log(`  ✨ CSS Filter: "${filterString || "none"}"`);
					console.log(`  🎯 Canvas filter before: "${ctx.filter}"`);
					ctx.filter = filterString ? filterString : "none";
					console.log(`  ✅ Canvas filter after: "${ctx.filter}"`);
				} else if (variant === "gated") {
					// What the proposed fix costs when debug mode is off: one
					// localStorage read, then the filter write.
					if (localStorage.getItem("qcut_debug_mode") === "true") {
						console.log("🎨 CANVAS EFFECTS: Applying filter to canvas context");
						console.log("  🔧 Parameters:", parameters);
						console.log(`  ✨ CSS Filter: "${filterString || "none"}"`);
						console.log(`  🎯 Canvas filter before: "${ctx.filter}"`);
					}
					ctx.filter = filterString ? filterString : "none";
					if (localStorage.getItem("qcut_debug_mode") === "true") {
						console.log(`  ✅ Canvas filter after: "${ctx.filter}"`);
					}
				} else {
					// Floor: the only work that actually affects the picture.
					ctx.filter = filterString ? filterString : "none";
				}
				timings.push((performance.now() - startedAt) * 1000);
			}
			return timings;
		},
		{ iterations, variant }
	);

	const totalUs = samples.reduce((sum, value) => sum + value, 0);
	return {
		consumerAttached,
		iterations,
		p50Us: Number(percentile(samples, 0.5).toFixed(2)),
		p95Us: Number(percentile(samples, 0.95).toFixed(2)),
		perCallUs: Number((totalUs / Math.max(1, samples.length)).toFixed(2)),
		totalMs: Number((totalUs / 1000).toFixed(2)),
		variant,
	};
}

/** Formats one measurement for the test log. */
export function formatLoggingMeasurement({
	measurement,
}: {
	measurement: LoggingMeasurement;
}): string {
	return (
		`[effects-log] variant=${measurement.variant.padEnd(6)} ` +
		`consumer=${String(measurement.consumerAttached).padEnd(5)} ` +
		`perCall=${measurement.perCallUs.toFixed(2).padStart(9)}us ` +
		`p50=${measurement.p50Us.toFixed(2).padStart(9)}us ` +
		`p95=${measurement.p95Us.toFixed(2).padStart(9)}us ` +
		`total=${measurement.totalMs.toFixed(1)}ms n=${measurement.iterations}`
	);
}

/**
 * Counts renderer console calls by prefix, so a real export can be checked for
 * per-frame log spam without relying on a host-side listener (which would
 * itself change the cost being measured).
 */
export async function installConsoleCounter({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		const target = window as unknown as Record<string, unknown>;
		const existing = target.__effectsConsoleCounter as
			| { originals?: Record<string, (...args: unknown[]) => void> }
			| undefined;
		const console_ = console as unknown as Record<
			string,
			(...args: unknown[]) => void
		>;
		if (existing?.originals) {
			for (const [level, fn] of Object.entries(existing.originals)) {
				console_[level] = fn;
			}
		}

		const state = {
			counts: { debug: 0, error: 0, info: 0, log: 0, warn: 0 } as Record<
				string,
				number
			>,
			effectsBursts: 0,
			originals: {} as Record<string, (...args: unknown[]) => void>,
		};
		target.__effectsConsoleCounter = state;

		for (const level of ["log", "warn", "error", "info", "debug"]) {
			const original = console_[level].bind(console);
			state.originals[level] = console_[level];
			console_[level] = (...args: unknown[]) => {
				state.counts[level] += 1;
				if (typeof args[0] === "string" && args[0].includes("CANVAS EFFECTS")) {
					state.effectsBursts += 1;
				}
				original(...args);
			};
		}
	});
}

export interface ConsoleCounts {
	log: number;
	warn: number;
	error: number;
	info: number;
	debug: number;
	effectsBursts: number;
	installed: boolean;
}

/** Zeroes the console counters. */
export async function resetConsoleCounter({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		const state = (window as unknown as Record<string, unknown>)
			.__effectsConsoleCounter as
			| { counts: Record<string, number>; effectsBursts: number }
			| undefined;
		if (!state) return;
		for (const level of Object.keys(state.counts)) state.counts[level] = 0;
		state.effectsBursts = 0;
	});
}

/** Reads the console counters. */
export async function readConsoleCounter({
	page,
}: {
	page: Page;
}): Promise<ConsoleCounts> {
	return await page.evaluate(() => {
		const state = (window as unknown as Record<string, unknown>)
			.__effectsConsoleCounter as
			| { counts: Record<string, number>; effectsBursts: number }
			| undefined;
		if (!state) {
			return {
				debug: 0,
				effectsBursts: 0,
				error: 0,
				info: 0,
				installed: false,
				log: 0,
				warn: 0,
			};
		}
		return {
			debug: state.counts.debug ?? 0,
			effectsBursts: state.effectsBursts,
			error: state.counts.error ?? 0,
			info: state.counts.info ?? 0,
			installed: true,
			log: state.counts.log ?? 0,
			warn: state.counts.warn ?? 0,
		};
	});
}

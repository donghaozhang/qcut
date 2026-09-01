/**
 * Stacked audio render scaling — factor isolation.
 *
 * Explains why `audio-render` grows superlinearly as clips stack up (roughly
 * 30 ms for one clip against 625 ms for four in the export benchmark) by
 * rendering synthetic `OfflineAudioContext` graphs in the real renderer and
 * changing exactly one factor at a time.
 *
 * This spec measures only. It never calls the exporter and never changes
 * production behaviour, so its numbers describe Chromium's WebAudio rendering
 * cost rather than QCut's scheduling code.
 */

import { expect } from "@playwright/test";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	baseConfig,
	runScalingProbe,
	type ScalingProbeResult,
} from "./helpers/offline-audio-scaling-probe";

const ROUNDS = 5;

function report(label: string, result: ScalingProbeResult): void {
	console.log(
		`[audio-scaling] ${label.padEnd(26)} median=${result.medianMs
			.toFixed(1)
			.padStart(7)}ms p95=${result.p95Ms.toFixed(1).padStart(7)}ms ` +
			`build=${result.buildMedianMs.toFixed(1).padStart(6)}ms ` +
			`min=${result.minMs.toFixed(1)}ms max=${result.maxMs.toFixed(1)}ms ` +
			`runs=[${result.renderMs.join(", ")}]`
	);
}

test.describe("stacked audio render scaling", () => {
	test.setTimeout(600_000);

	test("attributes stacked audio render cost to a single factor", async ({
		page,
	}) => {
		await page.waitForLoadState("domcontentloaded");

		// Warm-up render, discarded: the first OfflineAudioContext in a renderer
		// pays one-time setup that would otherwise land on the 1-clip number.
		await runScalingProbe({
			config: baseConfig({ clips: 1 }),
			page,
			rounds: 2,
		});

		// --- Phase 1: scaling curve -------------------------------------------
		const scaling: ScalingProbeResult[] = [];
		for (const clips of [1, 2, 4, 8]) {
			const result = await runScalingProbe({
				config: baseConfig({ clips }),
				page,
				rounds: ROUNDS,
			});
			scaling.push(result);
			report(`full chain x${clips}`, result);
		}

		const single = scaling[0].medianMs;
		for (const result of scaling) {
			const perClip = result.medianMs / result.config.clips;
			console.log(
				`[audio-scaling] scale x${result.config.clips}: total=${result.medianMs.toFixed(1)}ms ` +
					`per-clip=${perClip.toFixed(1)}ms growth-vs-1clip=${(
						result.medianMs / single
					).toFixed(2)}x`
			);
		}

		// --- Phase 1b: timeline-shaped scaling --------------------------------
		// Phase 1 held the context length fixed, which isolates clip count. A
		// real timeline grows as clips are appended, and WebAudio renders every
		// node for the whole context regardless of when its source stops, so
		// this phase is what reproduces superlinear growth.
		const timelineScaling: ScalingProbeResult[] = [];
		for (const clips of [1, 2, 4, 8]) {
			const result = await runScalingProbe({
				config: baseConfig({ clips }),
				page,
				rounds: ROUNDS,
				seconds: clips * 1.5,
			});
			timelineScaling.push(result);
			report(`timeline x${clips} (${clips * 1.5}s)`, result);
		}
		const timelineSingle = timelineScaling[0].medianMs;
		for (const result of timelineScaling) {
			console.log(
				`[audio-scaling] timeline x${result.config.clips}: total=${result.medianMs.toFixed(1)}ms ` +
					`growth-vs-1clip=${(result.medianMs / timelineSingle).toFixed(2)}x ` +
					`(linear would be ${result.config.clips}.00x)`
			);
		}

		// --- Phase 1c: does an ended clip keep costing? -----------------------
		// Same 12s context and the same single chain, varying only how long the
		// source actually plays. If a 1.5s clip costs about what a 12s clip
		// costs, the chain is being rendered for the whole context after its
		// source stopped, which is the mechanism behind Phase 1b.
		for (const clipSeconds of [1.5, 12]) {
			const result = await runScalingProbe({
				clipSeconds,
				config: baseConfig({ clips: 1, overrides: { stagger: false } }),
				page,
				rounds: ROUNDS,
				seconds: 12,
			});
			report(`idle-tail: ${clipSeconds}s src in 12s ctx`, result);
		}

		// --- Phase 1d: impulse construction ------------------------------------
		// The exporter rebuilds the reverb impulse per clip from a fixed-seed
		// LCG, so every clip with the same room size and damping produces an
		// identical buffer. Compare that against building it once.
		for (const sharedImpulse of [false, true]) {
			const result = await runScalingProbe({
				config: baseConfig({ clips: 8, overrides: { sharedImpulse } }),
				page,
				rounds: ROUNDS,
				seconds: 12,
			});
			report(
				sharedImpulse ? "impulse: shared once" : "impulse: per clip",
				result
			);
		}

		// --- Phase 2: same-code control (noise floor) -------------------------
		const controlA = await runScalingProbe({
			config: baseConfig({ clips: 8 }),
			page,
			rounds: ROUNDS,
			seconds: 12,
		});
		const controlB = await runScalingProbe({
			config: baseConfig({ clips: 8 }),
			page,
			rounds: ROUNDS,
			seconds: 12,
		});
		report("control A (8 clips)", controlA);
		report("control B (8 clips)", controlB);
		const controlDelta =
			Math.abs(controlA.medianMs - controlB.medianMs) /
			Math.max(controlA.medianMs, 1);
		console.log(
			`[audio-scaling] same-code control drift: ${(controlDelta * 100).toFixed(1)}%`
		);

		// --- Phase 3: one factor at a time, at the worst stack depth ----------
		const factors: Array<{
			label: string;
			overrides: Record<string, boolean>;
		}> = [
			{ label: "no convolver", overrides: { convolver: false } },
			{ label: "shared impulse buffer", overrides: { sharedImpulse: true } },
			{ label: "no delay branch", overrides: { delay: false } },
			{ label: "no automation", overrides: { automation: false } },
			{ label: "shared mix bus", overrides: { mixBus: true } },
			{ label: "no stagger", overrides: { stagger: false } },
			{
				label: "no chain (sources only)",
				overrides: { chain: false },
			},
		];

		const baseline = controlA;
		for (const factor of factors) {
			const result = await runScalingProbe({
				config: baseConfig({ clips: 8, overrides: factor.overrides }),
				page,
				rounds: ROUNDS,
				seconds: 12,
			});
			report(factor.label, result);
			const saved = baseline.medianMs - result.medianMs;
			console.log(
				`[audio-scaling] factor "${factor.label}": ${saved.toFixed(1)}ms ` +
					`(${((saved / Math.max(baseline.medianMs, 1)) * 100).toFixed(1)}% of 8-clip baseline)`
			);
		}

		// Every configuration must actually have rendered.
		for (const result of [...scaling, controlA, controlB]) {
			expect(result.renderMs.length).toBe(ROUNDS);
			expect(result.medianMs).toBeGreaterThan(0);
		}
		// The 8-clip stack must cost meaningfully more than one clip, otherwise
		// this probe is not reproducing the reported superlinear growth.
		expect(scaling[3].medianMs).toBeGreaterThan(scaling[0].medianMs);
	});
});

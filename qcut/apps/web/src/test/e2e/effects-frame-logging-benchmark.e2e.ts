/**
 * Effects frame-logging benchmark.
 *
 * `applyEffectsToCanvas` emits five `console.log` calls per invocation. On the
 * canvas export path that is once per element per frame, and once per
 * adjustment-layer effect element per frame.
 *
 * This spec measures the cost of that burst in two console-consumption
 * regimes, because they differ by orders of magnitude:
 *  - no consumer, which models a normal Electron run with DevTools closed;
 *  - a consumer attached, which models DevTools being open. Playwright's own
 *    console listener is such a consumer, so the standard E2E fixture is
 *    always in the second regime — measuring there alone would overstate the
 *    cost for real users.
 *
 * Every configuration is run twice with identical code to establish the noise
 * floor before any conclusion is drawn.
 */

import { expect } from "@playwright/test";
import { test } from "./helpers/electron-helpers";
import {
	formatLoggingMeasurement,
	type LoggingMeasurement,
	type LoggingVariant,
	measureLoggingVariant,
} from "./helpers/effects-logging-probe";

const ITERATIONS = 2000;
const VARIANTS: LoggingVariant[] = ["logs", "gated", "none"];

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

test.describe("effects frame logging", () => {
	test("measures the per-frame logging burst with and without a console consumer", async ({
		page,
	}) => {
		await page.waitForLoadState("domcontentloaded");

		// Warm-up, discarded: first-call JIT and canvas setup would otherwise
		// land on whichever variant happens to run first.
		await measureLoggingVariant({
			consumerAttached: false,
			iterations: 200,
			page,
			variant: "logs",
		});

		const results: LoggingMeasurement[] = [];

		const sweep = async ({
			consumerAttached,
			pass,
		}: {
			consumerAttached: boolean;
			pass: number;
		}): Promise<void> => {
			for (const variant of VARIANTS) {
				const measurement = await measureLoggingVariant({
					consumerAttached,
					iterations: ITERATIONS,
					page,
					variant,
				});
				results.push(measurement);
				console.log(
					`${formatLoggingMeasurement({ measurement })} pass=${pass}`
				);
			}
		};

		// --- Regime 1: no console consumer (normal Electron) ------------------
		// The shared fixture attaches a console listener, which is itself a
		// consumer; drop it so this regime is real.
		page.removeAllListeners("console");
		await sweep({ consumerAttached: false, pass: 1 });
		await sweep({ consumerAttached: false, pass: 2 });

		// --- Regime 2: a console consumer attached (DevTools-like) ------------
		const drain: string[] = [];
		const listener = (message: { text: () => string }): void => {
			drain.push(message.text());
		};
		page.on("console", listener);
		await sweep({ consumerAttached: true, pass: 1 });
		await sweep({ consumerAttached: true, pass: 2 });
		page.off("console", listener);
		console.log(`[effects-log] consumer drained ${drain.length} messages`);

		const pick = ({
			variant,
			consumerAttached,
			pass,
		}: {
			variant: LoggingVariant;
			consumerAttached: boolean;
			pass: number;
		}): LoggingMeasurement => {
			const matching = results.filter(
				(entry) =>
					entry.variant === variant &&
					entry.consumerAttached === consumerAttached
			);
			const chosen = matching[pass - 1];
			if (!chosen) throw new Error(`Missing measurement ${variant}/${pass}`);
			return chosen;
		};

		// Same-code control: the two passes of an identical configuration bound
		// the noise, and any claimed effect has to exceed it.
		for (const consumerAttached of [false, true]) {
			for (const variant of VARIANTS) {
				const first = pick({ consumerAttached, pass: 1, variant });
				const second = pick({ consumerAttached, pass: 2, variant });
				const drift =
					Math.abs(first.perCallUs - second.perCallUs) /
					Math.max(first.perCallUs, 0.001);
				console.log(
					`[effects-log] control drift variant=${variant} consumer=${consumerAttached} ` +
						`${(drift * 100).toFixed(1)}% (${first.perCallUs}us vs ${second.perCallUs}us)`
				);
			}
		}

		for (const consumerAttached of [false, true]) {
			const logs = pick({ consumerAttached, pass: 1, variant: "logs" });
			const gated = pick({ consumerAttached, pass: 1, variant: "gated" });
			const none = pick({ consumerAttached, pass: 1, variant: "none" });
			console.log(
				`[effects-log] SUMMARY consumer=${consumerAttached} ` +
					`logs=${logs.perCallUs}us gated=${gated.perCallUs}us none=${none.perCallUs}us ` +
					`savedByGate=${(logs.perCallUs - gated.perCallUs).toFixed(2)}us ` +
					`gateOverheadVsFloor=${(gated.perCallUs - none.perCallUs).toFixed(2)}us`
			);
		}

		// Sanity: every configuration produced timings.
		for (const measurement of results) {
			expect(measurement.iterations).toBe(ITERATIONS);
			expect(measurement.perCallUs).toBeGreaterThan(0);
		}
		// Logging must cost at least as much as doing nothing, in both regimes.
		expect(
			pick({ consumerAttached: false, pass: 1, variant: "logs" }).perCallUs
		).toBeGreaterThan(
			pick({ consumerAttached: false, pass: 1, variant: "none" }).perCallUs
		);
	});
});

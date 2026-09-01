/**
 * Planar tracking sticker render benchmark.
 *
 * Measures how often the tracking sidecar is fetched, verified and parsed
 * across three comparable timelines — no sticker, a plain untracked sticker,
 * and a real planar-tracked sticker — over continuous playback, seeking, and a
 * real export.
 *
 * The export is run through the muxer engine on purpose. That is the canvas
 * per-frame engine, and it is the one force-selected when a timeline carries a
 * Sticker Lab runtime sticker; the default desktop CLI engine bakes tracking
 * geometry into the filter graph and loads the sidecar once per sticker, so it
 * cannot show this cost.
 */

import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	startElectronApp,
	stubExportSaveDialog,
	test as qcutTest,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	createPlanarTrackingWorkspace,
	type PlanarTrackingWorkspace,
} from "./helpers/planar-tracking-video-fixture";
import {
	formatSidecarStats,
	installSidecarReadProbe,
	readSidecarReadProbe,
	resetSidecarReadProbe,
	type SidecarReadStats,
} from "./helpers/planar-sidecar-read-probe";
import {
	addBenchSticker,
	addPlanarSourceVideo,
	captureQuadSamples,
	focusStickerForTracking,
	measureReadCostBySize,
	readSidecarQuadCentres,
	readTrackingBinding,
	PLANAR_BENCH,
	playForSeconds,
	runRealTracking,
	seekThrough,
	type StickerQuadSample,
} from "./helpers/planar-sticker-bench-scenarios";

const EVIDENCE_DIR = path.resolve("output/playwright/planar-sticker-bench");

/** Fixed times used for both the seek workload and the geometry fixture. */
const QUAD_TIMES = [0, 0.4, 0.8, 1.2, 1.6] as const;
const PLAYBACK_SECONDS = 2;

interface ScenarioMeasurement {
	scenario: string;
	playback: SidecarReadStats;
	seek: SidecarReadStats;
	exportStats: SidecarReadStats;
	exportWallMs: number;
	exportedFrames: number;
}

const test = qcutTest.extend<{ planarWorkspace: PlanarTrackingWorkspace }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	planarWorkspace: async ({}, use) => {
		const workspace = await createPlanarTrackingWorkspace();
		try {
			await use(workspace);
		} finally {
			await rm(workspace.rootDirectory, { force: true, recursive: true });
		}
	},
	electronApp: async ({ planarWorkspace }, use) => {
		const electronApp = await startElectronApp({
			userDataDirectory: planarWorkspace.profileDirectory,
		});
		await electronApp.evaluate(({ app }, documentsDirectory) => {
			app.setPath("documents", documentsDirectory);
		}, planarWorkspace.documentsDirectory);
		try {
			await use(electronApp);
		} finally {
			await electronApp.close();
		}
	},
});

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

test.describe("planar sticker render benchmark", () => {
	test("measures sidecar loads across playback, seek and export", async ({
		electronApp,
		page,
		planarWorkspace,
	}) => {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		const consoleLines: string[] = [];
		page.on("console", (message) => consoleLines.push(message.text()));
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000);
		});
		await createTestProject(page, "Planar Sticker Render Benchmark");
		await uploadTestMedia(page, planarWorkspace.videoPath);
		await uploadTestMedia(
			page,
			path.resolve("apps/web/src/test/e2e/fixtures/media/sample-image.png")
		);

		// In Electron the factory returns the CLI engine before honouring a
		// requested engine, and the CLI path bakes tracking geometry into the
		// filter graph (one sidecar load per sticker). This existing debug switch
		// selects the canvas per-frame engine instead, which is the path the
		// muxer also uses and the one this benchmark is about. It adds no work of
		// its own, unlike forcing the muxer via a filter stack.
		await page.evaluate(() => {
			localStorage.setItem("qcut_force_regular_engine", "true");
		});

		const { mediaElementId, projectId } = await addPlanarSourceVideo({ page });
		expect(projectId).toBeTruthy();
		await installSidecarReadProbe({ electronApp });

		const measurements: ScenarioMeasurement[] = [];

		const measureScenario = async ({
			scenario,
		}: {
			scenario: string;
		}): Promise<ScenarioMeasurement> => {
			await resetSidecarReadProbe({ electronApp });
			await playForSeconds({ page, seconds: PLAYBACK_SECONDS });
			const playback = await readSidecarReadProbe({ electronApp });

			await resetSidecarReadProbe({ electronApp });
			await seekThrough({ page, times: QUAD_TIMES });
			const seek = await readSidecarReadProbe({ electronApp });

			const outputPath = path.join(EVIDENCE_DIR, `${scenario}.mp4`);
			await stubExportSaveDialog({ electronApp, outputPath });
			await ensureExportActions({ page });
			await resetSidecarReadProbe({ electronApp });
			const startedAt = Date.now();
			await runMuxerExport({ page, outputPath });
			const exportWallMs = Date.now() - startedAt;
			const exportStats = await readSidecarReadProbe({ electronApp });

			// An export that silently did nothing would report zero reads and look
			// like a win, so prove the file was written and note which engine ran.
			await expect
				.poll(() => existsSync(outputPath), { timeout: 120_000 })
				.toBe(true);
			const engineLine = [...consoleLines]
				.reverse()
				.find((line) => line.includes("EXPORT ENGINE SELECTION:"));
			console.log(
				`[planar-bench] ${scenario} engine=${engineLine?.trim() ?? "(not logged)"}`
			);

			const measurement: ScenarioMeasurement = {
				exportStats,
				exportWallMs,
				exportedFrames: Math.ceil(PLANAR_BENCH.durationSeconds * 30),
				playback,
				scenario,
				seek,
			};
			console.log(
				formatSidecarStats({ label: `${scenario} playback`, stats: playback })
			);
			console.log(
				formatSidecarStats({ label: `${scenario} seek`, stats: seek })
			);
			console.log(
				formatSidecarStats({ label: `${scenario} export`, stats: exportStats })
			);
			console.log(
				`[planar-bench] ${scenario.padEnd(30)} exportWallMs=${exportWallMs} ` +
					`expectedFrames=${measurement.exportedFrames} ` +
					`readsPerFrame=${(exportStats.reads / measurement.exportedFrames).toFixed(2)}`
			);
			return measurement;
		};

		// Scenario 1: no sticker at all.
		measurements.push(await measureScenario({ scenario: "no-sticker" }));

		// Scenario 2: a plain, untracked sticker.
		const sticker = await addBenchSticker({ page });
		measurements.push(await measureScenario({ scenario: "plain-sticker" }));
		const plainQuads = await captureQuadSamples({
			page,
			stickerId: sticker.stickerId,
			times: QUAD_TIMES,
		});

		// Scenario 3: the same sticker, now really planar-tracked.
		await focusStickerForTracking({ page, ...sticker });
		await runRealTracking({ page });

		// Prove the binding really committed before measuring it. Without this
		// the tracked scenario can silently degrade into a second plain-sticker
		// run and the benchmark would report zero reads as if that were a win.
		const binding = await readTrackingBinding({
			mediaElementId,
			page,
			stickerElementId: sticker.stickerElementId,
		});
		console.log(`[planar-bench] BINDING=${JSON.stringify(binding)}`);
		expect(binding.mode).toBe("planar");
		expect(binding.referenceStatus).toBe("ready");
		expect(binding.resultSha256).toMatch(/^[a-f\d]{64}$/);
		expect(binding.sourceElementId).toBe(mediaElementId);
		expect(binding.sampleCount ?? 0).toBeGreaterThanOrEqual(20);

		measurements.push(await measureScenario({ scenario: "planar-tracked" }));
		const trackedQuads = await captureQuadSamples({
			page,
			stickerId: sticker.stickerId,
			times: QUAD_TIMES,
		});

		console.log(`[planar-bench] QUADS_PLAIN=${JSON.stringify(plainQuads)}`);
		console.log(`[planar-bench] QUADS_TRACKED=${JSON.stringify(trackedQuads)}`);

		const tracked = measurements.find((m) => m.scenario === "planar-tracked");
		const plain = measurements.find((m) => m.scenario === "plain-sticker");
		const control = measurements.find((m) => m.scenario === "no-sticker");
		if (!tracked || !plain || !control) throw new Error("Missing scenario");

		// Untracked timelines must never touch the tracking store.
		expect(control.exportStats.reads).toBe(0);
		expect(control.playback.reads).toBe(0);
		expect(plain.exportStats.reads).toBe(0);
		expect(plain.playback.reads).toBe(0);

		// The tracked sticker must actually be tracked, and its geometry must
		// move over time — otherwise this benchmark proves nothing.
		expect(trackedQuads.every((sample) => sample.visible)).toBe(true);
		const distinctPositions = new Set(
			trackedQuads.map(
				(sample) => `${sample.x.toFixed(2)}x${sample.y.toFixed(2)}`
			)
		);
		expect(distinctPositions.size).toBeGreaterThan(1);

		// The probe must have been active.
		expect(tracked.exportStats.installed).toBe(true);

		// Geometry invariant, anchored to the sidecar rather than to screen
		// pixels. Preview zoom differs between runs, so absolute positions are
		// not comparable across builds; displacement *ratios* are, because they
		// cancel any uniform scale and offset. If caching changed which sample a
		// frame resolves to, this profile would break.
		const centres = await readSidecarQuadCentres({
			expectedSha256: binding.resultSha256 ?? "",
			page,
			projectId,
			resultUri: binding.resultUri ?? "",
			times: QUAD_TIMES,
		});
		console.log(`[planar-bench] SIDECAR_CENTRES=${JSON.stringify(centres)}`);

		const ratios = (values: number[]): number[] => {
			const first = values[0];
			const span = values[values.length - 1] - first;
			return values.map((value) => (value - first) / span);
		};
		const renderedX = ratios(trackedQuads.map((sample) => sample.x));
		const sidecarX = ratios(centres.map((centre) => centre.x));
		console.log(
			`[planar-bench] PROFILE_RENDERED_X=${JSON.stringify(renderedX.map((v) => Number(v.toFixed(4))))}`
		);
		console.log(
			`[planar-bench] PROFILE_SIDECAR_X=${JSON.stringify(sidecarX.map((v) => Number(v.toFixed(4))))}`
		);
		for (const [index, expected] of sidecarX.entries()) {
			expect(renderedX[index]).toBeCloseTo(expected, 1);
		}

		// How much work one avoided read represents at realistic tracking sizes.
		const readCosts = await measureReadCostBySize({
			page,
			projectId,
			sampleCounts: [24, 300, 1800, 5400],
		});
		for (const cost of readCosts) {
			console.log(
				`[planar-bench] read-cost samples=${String(cost.samples).padStart(5)} ` +
					`bytes=${String(cost.bytes).padStart(8)} readMs=${cost.readMs.toFixed(2)}`
			);
		}
		expect(readCosts).toHaveLength(4);
	});
});

/** Opens the export panel so `__exportActions` is registered. */
async function ensureExportActions({
	page,
}: {
	page: import("@playwright/test").Page;
}): Promise<void> {
	const registered = await page.evaluate(() =>
		Boolean(
			(window as unknown as { __exportActions?: unknown }).__exportActions
		)
	);
	if (registered) return;
	await page.locator('[data-testid="export-button"]').click();
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					Boolean(
						(window as unknown as { __exportActions?: unknown }).__exportActions
					)
				),
			{ timeout: 60_000 }
		)
		.toBe(true);
}

/** Runs one export through the muxer (canvas per-frame) engine. */
async function runMuxerExport({
	page,
	outputPath,
}: {
	page: import("@playwright/test").Page;
	outputPath: string;
}): Promise<void> {
	await page.evaluate(async (target) => {
		const actions = (
			window as unknown as {
				__exportActions?: {
					exportLocalVideo: (
						options: Record<string, unknown>
					) => Promise<unknown>;
				};
			}
		).__exportActions;
		if (!actions) throw new Error("Export actions are not registered");
		await actions.exportLocalVideo({
			engine: "muxer",
			filename: "planar-bench.mp4",
			format: "mp4",
			frameRate: 30,
			height: 720,
			outputPath: target,
			quality: "720p",
			width: 1280,
		});
	}, outputPath);
}

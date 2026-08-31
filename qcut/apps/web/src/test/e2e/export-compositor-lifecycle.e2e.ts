/**
 * Export compositor lifecycle: does ExportEngineMuxer's screen-recording
 * export compositor (background + zoom compositing) get created fresh and
 * torn down on every muxer export — across repeats, a cancel, an intentional
 * failure, and a recovery export in the same renderer process — or does it
 * silently retain the first export's config?
 *
 * `ExportEngineMuxer.export()` overrides `ExportEngine.export()` entirely,
 * and (before the compositor-lifecycle fix landed alongside this test) never
 * called `destroyExportCompositor()`. `getExportCompositor()` only builds a
 * new compositor when the module-level singleton is null, so a second muxer
 * export could silently reuse the first export's frozen screen-recording
 * config (zoom focus, background) instead of the current store state.
 *
 * Prior lifecycle E2E coverage (export-lifecycle-memory.e2e.ts) never set
 * any screen-recording enhancement, so the compositor was never created and
 * this gap went unexercised. This test seeds real zoom/background config
 * through the (now unconditionally exposed) screen-recording store and
 * drives real muxer exports, so `getExportCompositor`/`ScreenRecordingExportCompositor`
 * genuinely run in every export.
 *
 * Compositor lifecycle is verified two ways:
 *  - Cross-run `compositor-create` counter: `getExportCompositor()` only
 *    builds a new compositor when the module-level singleton is null, so a
 *    fresh `create` on every run proves the *previous* run's
 *    `destroyExportCompositor()` actually nulled it out. (The
 *    `compositor-destroy` counter itself is not reliably observable in a
 *    successful run's own profile report: ExportEngineMuxer's pre-existing
 *    success path calls `exportProfiler.finishAndSave()` — which disarms the
 *    profiler — before its `finally` block runs `destroyExportCompositor()`,
 *    so the destroy event lands after the report is already written. This is
 *    a same-run observability gap in the profiler wiring, not evidence that
 *    destroy didn't happen — the cross-run `create` signal below is proof it
 *    did.)
 *  - Frame content: changing only the zoom focus between two real exports
 *    must change the exported frame at the same timestamp. An unchanged
 *    frame would mean the second export silently rendered with the first
 *    export's stale compositor config.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import {
	collectExportResult,
	dispatchExportLocalVideo,
	type MemorySnapshot,
	peakByType,
	pollWhileExporting,
	readExportProgress,
	sampleMemory,
	totalMb,
	waitForExportStart,
} from "./helpers/export-lifecycle-memory";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	audioRmsDb,
	decodeFrame,
	generateToneClip,
	meanAbsDiff,
	probeVideo,
} from "./helpers/transition-export-evidence";

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const CLIP_SECONDS = 8;
const TOTAL_FRAMES = CLIP_SECONDS * FPS;
const SUCCESSFUL_RUNS = 3;
const SAMPLE_TIME_SECONDS = CLIP_SECONDS / 2;
const BACKGROUND_SOLID_COLOR = "#123456";
const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"output/playwright/export-compositor-lifecycle"
);

interface ExposedWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{ id: string; localPath?: string; name: string }>;
		};
	};
	__projectStore: {
		getState: () => { activeProject: { id: string } | null };
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{ id: string; isMain?: boolean; type: string }>;
			addElementToTrack: (
				trackId: string,
				element: Record<string, unknown>
			) => string | null;
		};
	};
	__screenRecordingEnhancementStore__?: {
		setState: (partial: Record<string, unknown>) => void;
	};
	__exportProfiler?: {
		arm: (options: { targetPath: string }) => void;
		finishAndSave: (meta: Record<string, unknown>) => Promise<void>;
	};
}

interface ZoomRegionInput {
	id: string;
	startMs: number;
	endMs: number;
	depth: number;
	focus: { cx: number; cy: number };
	auto: boolean;
}

async function waitForLocalPaths({ page }: { page: Page }): Promise<void> {
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					(window as unknown as ExposedWindow).__mediaStore
						.getState()
						.mediaItems.every((item) => Boolean(item.localPath))
				),
			{ timeout: 30_000 }
		)
		.toBe(true);
}

async function buildOneClipTimeline({
	page,
	name,
}: {
	page: Page;
	name: string;
}): Promise<{ projectId: string }> {
	return page.evaluate(
		({ name, clipSeconds }) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const media = editorWindow.__mediaStore.getState().mediaItems;
			const item = media.find((candidate) => candidate.name === name);
			if (!item) throw new Error(`Media ${name} was not imported`);
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!track) throw new Error("Missing main media track");
			const id = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: item.id,
				name: item.name,
				startTime: 0,
				duration: clipSeconds,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!id) throw new Error(`Could not place ${item.name}`);
			return { projectId };
		},
		{ name, clipSeconds: CLIP_SECONDS }
	);
}

/** Seeds the real screen-recording enhancement store so getExportCompositor()
 * genuinely activates — background + a full-clip zoom region focused at
 * `focus`, both fields the production compositor draws. */
async function activateScreenRecordingCompositor({
	page,
	focus,
	regionId,
}: {
	page: Page;
	focus: { cx: number; cy: number };
	regionId: string;
}): Promise<void> {
	const region: ZoomRegionInput = {
		id: regionId,
		startMs: 0,
		endMs: CLIP_SECONDS * 1000,
		depth: 2,
		focus,
		auto: false,
	};
	await page.evaluate(
		({ region, backgroundColor }) => {
			const store = (window as unknown as ExposedWindow)
				.__screenRecordingEnhancementStore__;
			if (!store) {
				throw new Error("screen-recording enhancement store is not exposed");
			}
			store.setState({
				zoomRegions: [region],
				background: {
					type: "solid",
					solidColor: backgroundColor,
					padding: 100,
					borderRadius: 0,
					shadow: false,
				},
			});
		},
		{ region, backgroundColor: BACKGROUND_SOLID_COLOR }
	);
}

async function clearScreenRecordingCompositor({ page }: { page: Page }) {
	await page.evaluate(() => {
		const store = (window as unknown as ExposedWindow)
			.__screenRecordingEnhancementStore__;
		store?.setState({
			zoomRegions: [],
			background: { type: "none", padding: 40, borderRadius: 12, shadow: true },
		});
	});
}

async function armExportProfiler({
	page,
	targetPath,
}: {
	page: Page;
	targetPath: string;
}): Promise<void> {
	await page.evaluate((targetPath) => {
		const profiler = (window as unknown as ExposedWindow).__exportProfiler;
		if (!profiler) throw new Error("exportProfiler is not exposed on window");
		profiler.arm({ targetPath });
	}, targetPath);
}

/** Disarms and saves the profiler report, then reads back its counters. */
async function finishAndReadCompositorCounters({
	page,
	targetPath,
	label,
}: {
	page: Page;
	targetPath: string;
	label: string;
}): Promise<{ create: number; destroy: number }> {
	await page.evaluate((label) => {
		const profiler = (window as unknown as ExposedWindow).__exportProfiler;
		return profiler?.finishAndSave({ label });
	}, label);
	const raw = await readFile(targetPath, "utf-8");
	const report = JSON.parse(raw) as { counters?: Record<string, number> };
	return {
		create: report.counters?.["compositor-create"] ?? 0,
		destroy: report.counters?.["compositor-destroy"] ?? 0,
	};
}

test("export compositor is created fresh and destroyed on every muxer export — repeats, cancel, failure, recovery", async ({
	page,
	electronApp,
}) => {
	test.setTimeout(600_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});
	const workDir = await mkdtemp(
		path.join(tmpdir(), "qcut-compositor-lifecycle-")
	);
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const memorySeries: MemorySnapshot[] = [];
	const attempts: Array<Record<string, unknown>> = [];

	try {
		const sourcePath = path.join(workDir, "screen-recording-source.mp4");
		await generateToneClip({
			filePath: sourcePath,
			pattern: "testsrc2",
			toneHz: 330,
			seconds: CLIP_SECONDS,
			width: WIDTH,
			height: HEIGHT,
		});

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Export Compositor Lifecycle E2E");
		await uploadTestMedia(page, sourcePath);
		await waitForLocalPaths({ page });
		const { projectId } = await buildOneClipTimeline({
			page,
			name: path.basename(sourcePath),
		});

		// Opens the export panel so `__exportActions`/the Cancel button exist.
		await page.getByTestId("export-button").click();
		await expect(page.getByTestId("export-dialog")).toBeVisible();
		await page.waitForFunction(
			() =>
				Boolean(
					(window as unknown as { __exportActions?: unknown }).__exportActions
				),
			undefined,
			{ timeout: 10_000 }
		);
		await page.waitForFunction(
			() =>
				Boolean(
					(window as unknown as ExposedWindow)
						.__screenRecordingEnhancementStore__
				),
			undefined,
			{ timeout: 10_000 }
		);

		const startupSamples = await sampleMemory({ electronApp });
		memorySeries.push({ atMs: 0, label: "startup", samples: startupSamples });

		const assertGoodOutput = async ({
			outputPath,
			label,
		}: {
			outputPath: string;
			label: string;
		}) => {
			expect(existsSync(outputPath), label).toBe(true);
			const probe = await probeVideo({ filePath: outputPath });
			expect(probe, label).toMatchObject({
				width: WIDTH,
				height: HEIGHT,
				hasAudio: true,
				frameCount: TOTAL_FRAMES,
			});
			expect(probe.videoDurationSeconds, label).toBeCloseTo(CLIP_SECONDS, 1);
			const toneDb = await audioRmsDb({
				filePath: outputPath,
				startSeconds: 1,
				durationSeconds: 0.5,
			});
			expect(toneDb, label).toBeGreaterThan(-35);
			return probe;
		};

		/** One automated muxer export with the compositor's counters recorded. */
		const runCompositorExport = async ({
			label,
			outputPath,
		}: {
			label: string;
			outputPath: string;
		}) => {
			const profilePath = path.join(workDir, `${label}-profile.json`);
			await armExportProfiler({ page, targetPath: profilePath });
			await dispatchExportLocalVideo({
				page,
				request: {
					engine: "muxer",
					filename: path.basename(outputPath),
					format: "mp4",
					frameRate: FPS,
					height: HEIGHT,
					outputPath,
					projectId,
					quality: "720p",
					width: WIDTH,
				},
			});
			await waitForExportStart({ page });
			await pollWhileExporting({
				page,
				electronApp,
				series: memorySeries,
				label,
				timeoutMs: 120_000,
			});
			const result = await collectExportResult({ page });
			const counters = await finishAndReadCompositorCounters({
				page,
				targetPath: profilePath,
				label,
			});
			return { result, counters };
		};

		// ---- Run 0: zoom focused left ------------------------------------------
		await activateScreenRecordingCompositor({
			page,
			focus: { cx: 0.25, cy: 0.5 },
			regionId: "zoom-left",
		});
		const run0Path = path.join(workDir, "run-0.mp4");
		const run0 = await runCompositorExport({
			label: "run-0",
			outputPath: run0Path,
		});
		expect(run0.result, "run-0").toMatchObject({ ok: true });
		// First activation: the singleton starts null, so this must create fresh.
		expect(run0.counters.create, "run-0 compositor-create").toBe(1);
		const run0Probe = await assertGoodOutput({
			outputPath: run0Path,
			label: "run-0",
		});
		attempts.push({
			label: "run-0",
			result: run0.result,
			counters: run0.counters,
			probe: run0Probe,
		});

		// ---- Run 1: zoom focused right — same renderer, no restart -------------
		// The regression this test guards: before the fix, ExportEngineMuxer
		// never destroyed the compositor, so this export would silently keep
		// reusing run-0's frozen (left-focused) compositor instead of picking up
		// the new focus below.
		await activateScreenRecordingCompositor({
			page,
			focus: { cx: 0.75, cy: 0.5 },
			regionId: "zoom-right",
		});
		const run1Path = path.join(workDir, "run-1.mp4");
		const run1 = await runCompositorExport({
			label: "run-1",
			outputPath: run1Path,
		});
		expect(run1.result, "run-1").toMatchObject({ ok: true });
		// The regression signal: this only reads 1 (not 0) if run-0's finally
		// destroyed the compositor and nulled the singleton — otherwise
		// getExportCompositor()'s `if (!exportCompositor)` guard would skip
		// creating a new one and this counter would stay 0.
		expect(run1.counters.create, "run-1 compositor-create").toBe(1);
		const run1Probe = await assertGoodOutput({
			outputPath: run1Path,
			label: "run-1",
		});
		attempts.push({
			label: "run-1",
			result: run1.result,
			counters: run1.counters,
			probe: run1Probe,
		});

		// ---- Frame-geometry evidence: run-0 vs run-1 must genuinely differ -----
		const frame0 = await decodeFrame({
			filePath: run0Path,
			timeSeconds: SAMPLE_TIME_SECONDS,
		});
		const frame1 = await decodeFrame({
			filePath: run1Path,
			timeSeconds: SAMPLE_TIME_SECONDS,
		});
		const zoomFocusDiff = meanAbsDiff({ a: frame0, b: frame1 });
		// Background/padding is identical between run-0 and run-1; only the zoom
		// focus changed. A near-zero diff would mean the second export rendered
		// with the first export's stale (left-focused) compositor.
		expect(
			zoomFocusDiff,
			"run-1 must reflect its own zoom focus, not run-0's stale compositor config"
		).toBeGreaterThan(15);

		// ---- Background layer evidence: compositor ON vs OFF at the same time --
		// A separate short reference export with the compositor fully
		// deactivated (no zoom, no background) isolates the background/padding
		// layer specifically — zoom's translate+scale can otherwise cover the
		// padding band entirely, so it can't be read off run-1 alone.
		await clearScreenRecordingCompositor({ page });
		const referencePath = path.join(workDir, "reference-no-compositor.mp4");
		const reference = await runCompositorExport({
			label: "reference",
			outputPath: referencePath,
		});
		expect(reference.result, "reference (compositor off)").toMatchObject({
			ok: true,
		});
		expect(
			reference.counters.create,
			"reference run must not create a compositor"
		).toBe(0);
		const referenceFrame = await decodeFrame({
			filePath: referencePath,
			timeSeconds: SAMPLE_TIME_SECONDS,
		});
		const backgroundLayerDiff = meanAbsDiff({ a: frame1, b: referenceFrame });
		expect(
			backgroundLayerDiff,
			"compositor-on output must differ from the same clip with no compositor active"
		).toBeGreaterThan(15);
		attempts.push({
			label: "reference",
			result: reference.result,
			counters: reference.counters,
		});
		// Re-activate for the remaining runs, same focus as run-1.
		await activateScreenRecordingCompositor({
			page,
			focus: { cx: 0.75, cy: 0.5 },
			regionId: "zoom-right",
		});

		// ---- Remaining successful runs (compositor stays on run-1's config) ----
		for (let index = 2; index < SUCCESSFUL_RUNS; index += 1) {
			const label = `run-${index}`;
			const outputPath = path.join(workDir, `${label}.mp4`);
			const { result, counters } = await runCompositorExport({
				label,
				outputPath,
			});
			expect(result, label).toMatchObject({ ok: true });
			expect(counters.create, `${label} compositor-create`).toBe(1);
			const probe = await assertGoodOutput({ outputPath, label });
			await new Promise((resolve) => setTimeout(resolve, 400));
			const idleSamples = await sampleMemory({ electronApp });
			memorySeries.push({
				atMs: Date.now(),
				label: `${label}-idle`,
				samples: idleSamples,
			});
			attempts.push({ label, result, counters, probe });
		}
		await new Promise((resolve) => setTimeout(resolve, 400));
		const run1IdleSamples = await sampleMemory({ electronApp });
		memorySeries.push({
			atMs: Date.now(),
			label: "run-1-idle",
			samples: run1IdleSamples,
		});

		// ---- Cancellation mid-export, compositor still active ------------------
		const cancelOutputPath = path.join(workDir, "cancelled.mp4");
		const cancelProfilePath = path.join(workDir, "cancel-profile.json");
		await armExportProfiler({ page, targetPath: cancelProfilePath });
		await dispatchExportLocalVideo({
			page,
			request: {
				engine: "muxer",
				filename: path.basename(cancelOutputPath),
				format: "mp4",
				frameRate: FPS,
				height: HEIGHT,
				outputPath: cancelOutputPath,
				projectId,
				quality: "720p",
				width: WIDTH,
			},
		});
		await waitForExportStart({ page });
		await pollWhileExporting({
			page,
			electronApp,
			series: memorySeries,
			label: "cancel-inflight",
			timeoutMs: 60_000,
			stopAtProgress: 5,
		});
		await page.getByRole("button", { name: "Cancel Export" }).click();
		await pollWhileExporting({
			page,
			electronApp,
			series: memorySeries,
			label: "cancel-settle",
			timeoutMs: 30_000,
		});
		const cancelResult = await collectExportResult({ page });
		expect(cancelResult.ok, "cancelled export result").toBe(false);
		expect(existsSync(cancelOutputPath), "cancelled output").toBe(false);
		await expect
			.poll(async () => (await readExportProgress({ page })).isExporting, {
				timeout: 10_000,
			})
			.toBe(false);
		const cancelCounters = await finishAndReadCompositorCounters({
			page,
			targetPath: cancelProfilePath,
			label: "cancel",
		});
		expect(cancelCounters.create, "cancel compositor-create").toBe(1);
		// Unlike a successful export, a cancelled one throws before reaching
		// ExportEngineMuxer's own finishAndSave() call, so the profiler is
		// still armed when finally's destroyExportCompositor() runs — this is
		// the one path where compositor-destroy is directly observable here.
		expect(cancelCounters.destroy, "cancel compositor-destroy").toBe(1);
		attempts.push({
			label: "cancel",
			result: cancelResult,
			counters: cancelCounters,
		});

		// ---- Intentional failure (unwritable output path) ----------------------
		const failOutputPath = path.join(
			workDir,
			"does-not-exist",
			"unreachable.mp4"
		);
		const failLabel = "failure";
		const failCounters = await runCompositorExport({
			label: failLabel,
			outputPath: failOutputPath,
		});
		expect(failCounters.result.ok, "failed export result").toBe(false);
		expect(failCounters.result.error, "failed export error").toBeTruthy();
		expect(existsSync(failOutputPath), "failed output").toBe(false);
		await expect
			.poll(async () => (await readExportProgress({ page })).isExporting, {
				timeout: 10_000,
			})
			.toBe(false);
		expect(failCounters.counters.create, "failure compositor-create").toBe(1);
		attempts.push({
			label: failLabel,
			result: failCounters.result,
			counters: failCounters.counters,
		});

		// ---- Recovery export, same project, no restart -------------------------
		const recoveryPath = path.join(workDir, "recovery.mp4");
		const recovery = await runCompositorExport({
			label: "recovery",
			outputPath: recoveryPath,
		});
		expect(recovery.result, "recovery result").toMatchObject({ ok: true });
		expect(recovery.counters.create, "recovery compositor-create").toBe(1);
		const recoveryProbe = await assertGoodOutput({
			outputPath: recoveryPath,
			label: "recovery",
		});
		// Recovery must still reflect run-1's zoom focus (unchanged since run-1),
		// not fall back to an identity/no-zoom render.
		const recoveryFrame = await decodeFrame({
			filePath: recoveryPath,
			timeSeconds: SAMPLE_TIME_SECONDS,
		});
		const recoveryVsRun1Diff = meanAbsDiff({ a: frame1, b: recoveryFrame });
		expect(
			recoveryVsRun1Diff,
			"recovery export should still composite the active zoom/background config"
		).toBeLessThan(15);
		await new Promise((resolve) => setTimeout(resolve, 400));
		const finalIdleSamples = await sampleMemory({ electronApp });
		memorySeries.push({
			atMs: Date.now(),
			label: "final-idle",
			samples: finalIdleSamples,
		});
		attempts.push({
			label: "recovery",
			result: recovery.result,
			counters: recovery.counters,
			probe: recoveryProbe,
		});

		// ---- Evidence ------------------------------------------------------------
		const idleSnapshots = memorySeries.filter(
			(snapshot) =>
				snapshot.label.endsWith("-idle") || snapshot.label === "startup"
		);
		await writeFile(
			path.join(EVIDENCE_DIR, "evidence.json"),
			JSON.stringify(
				{
					timeline: {
						clipSeconds: CLIP_SECONDS,
						totalFrames: TOTAL_FRAMES,
						width: WIDTH,
						height: HEIGHT,
					},
					geometryEvidence: {
						zoomFocusDiff,
						backgroundLayerDiff,
						recoveryVsRun1Diff,
					},
					attempts,
					memorySeries,
					idleTotalsMb: idleSnapshots.map((snapshot) => ({
						label: snapshot.label,
						totalMb: totalMb(snapshot.samples),
						peaksByType: peakByType([snapshot]),
					})),
					overallPeaksByTypeMb: peakByType(memorySeries),
				},
				null,
				2
			)
		);

		// ---- Memory sanity guard ---------------------------------------------
		const startupTotal = totalMb(startupSamples);
		const finalTotal = totalMb(finalIdleSamples);
		expect(
			finalTotal - startupTotal,
			`idle total RSS grew ${(finalTotal - startupTotal).toFixed(1)}MB ` +
				`(startup ${startupTotal}MB -> final ${finalTotal}MB) across ` +
				`${SUCCESSFUL_RUNS + 3} compositor-active export attempts`
		).toBeLessThan(800);
	} finally {
		await clearScreenRecordingCompositor({ page }).catch(() => {});
		await rm(workDir, { force: true, recursive: true });
	}
});

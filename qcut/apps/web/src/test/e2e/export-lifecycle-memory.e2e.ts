/**
 * Export lifecycle stability: renderer/utility process memory across warm
 * startup, several consecutive 1080p muxer exports, a cancellation
 * mid-export, an intentional export failure, and a recovery export — all
 * driven against one running app instance, without a restart.
 *
 * Every completed output is checked for duration/frame count/audio, and the
 * cancel and failure paths are checked for no partial output and no stuck
 * `isExporting` state before the next export starts.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
	generateToneClip,
	probeVideo,
} from "./helpers/transition-export-evidence";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const CLIP_SECONDS = 10;
const TIMELINE_SECONDS = CLIP_SECONDS * 2;
const TOTAL_FRAMES = Math.round(TIMELINE_SECONDS * FPS);
const SUCCESSFUL_RUNS = 6;
const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"output/playwright/export-lifecycle-memory"
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

async function buildTwoClipTimeline({
	page,
	names,
}: {
	page: Page;
	names: { a: string; b: string };
}): Promise<{ projectId: string }> {
	return page.evaluate(
		({ names, clipSeconds }) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const media = editorWindow.__mediaStore.getState().mediaItems;
			const byName = (name: string) => {
				const item = media.find((candidate) => candidate.name === name);
				if (!item) throw new Error(`Media ${name} was not imported`);
				return item;
			};
			const a = byName(names.a);
			const b = byName(names.b);
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!track) throw new Error("Missing main media track");
			const addClip = (
				item: { id: string; name: string },
				index: number
			): string => {
				const id = timeline.addElementToTrack(track.id, {
					type: "media",
					mediaId: item.id,
					name: item.name,
					startTime: index * clipSeconds,
					duration: clipSeconds,
					trimStart: 0,
					trimEnd: 0,
				});
				if (!id) throw new Error(`Could not place ${item.name}`);
				return id;
			};
			addClip(a, 0);
			addClip(b, 1);
			return { projectId };
		},
		{ names, clipSeconds: CLIP_SECONDS }
	);
}

/** Runs one automated muxer export to completion, sampling memory throughout. */
async function runExportToCompletion({
	page,
	electronApp,
	projectId,
	outputPath,
	label,
	memorySeries,
	timeoutMs = 120_000,
}: {
	page: Page;
	electronApp: import("playwright").ElectronApplication;
	projectId: string;
	outputPath: string;
	label: string;
	memorySeries: MemorySnapshot[];
	timeoutMs?: number;
}): Promise<{ ok: boolean; error?: string }> {
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
			quality: "1080p",
			width: WIDTH,
		},
	});
	await waitForExportStart({ page });
	await pollWhileExporting({
		page,
		electronApp,
		series: memorySeries,
		label,
		timeoutMs,
	});
	return collectExportResult({ page });
}

test("export lifecycle holds up across repeated runs, a cancel, a failure, and a recovery export", async ({
	page,
	electronApp,
}) => {
	test.setTimeout(900_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-lifecycle-mem-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const memorySeries: MemorySnapshot[] = [];
	const cycles: Array<Record<string, unknown>> = [];

	try {
		const sources = {
			a: path.join(workDir, "lifecycle-a.mp4"),
			b: path.join(workDir, "lifecycle-b.mp4"),
		};
		await generateToneClip({
			filePath: sources.a,
			pattern: "testsrc2",
			toneHz: 220,
			seconds: CLIP_SECONDS,
			width: WIDTH,
			height: HEIGHT,
		});
		await generateToneClip({
			filePath: sources.b,
			pattern: "smptebars",
			toneHz: 440,
			seconds: CLIP_SECONDS,
			width: WIDTH,
			height: HEIGHT,
		});

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Export Lifecycle Memory E2E");
		for (const filePath of [sources.a, sources.b]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({ page });
		const { projectId } = await buildTwoClipTimeline({
			page,
			names: { a: path.basename(sources.a), b: path.basename(sources.b) },
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
			expect(probe.videoDurationSeconds, label).toBeCloseTo(
				TIMELINE_SECONDS,
				1
			);
			const toneDb = await audioRmsDb({
				filePath: outputPath,
				startSeconds: 1,
				durationSeconds: 0.5,
			});
			expect(toneDb, label).toBeGreaterThan(-35);
			return probe;
		};

		// ---- N consecutive successful 1080p muxer exports --------------------
		for (let index = 0; index < SUCCESSFUL_RUNS; index += 1) {
			const label = `run-${index}`;
			const outputPath = path.join(workDir, `${label}.mp4`);
			const result = await runExportToCompletion({
				page,
				electronApp,
				projectId,
				outputPath,
				label,
				memorySeries,
			});
			expect(result, label).toMatchObject({ ok: true });
			const probe = await assertGoodOutput({ outputPath, label });
			await new Promise((resolve) => setTimeout(resolve, 400));
			const idleSamples = await sampleMemory({ electronApp });
			memorySeries.push({
				atMs: Date.now(),
				label: `${label}-idle`,
				samples: idleSamples,
			});
			cycles.push({ label, outputPath, probe, result });
		}

		// ---- Cancellation mid-export -------------------------------------------
		const cancelOutputPath = path.join(workDir, "cancelled.mp4");
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
				quality: "1080p",
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
		cycles.push({ label: "cancel", result: cancelResult });

		// ---- Intentional failure (unwritable output path) ----------------------
		const failOutputPath = path.join(
			workDir,
			"does-not-exist",
			"unreachable.mp4"
		);
		const failResult = await runExportToCompletion({
			page,
			electronApp,
			projectId,
			outputPath: failOutputPath,
			label: "failure",
			memorySeries,
		});
		expect(failResult.ok, "failed export result").toBe(false);
		expect(failResult.error, "failed export error").toBeTruthy();
		expect(existsSync(failOutputPath), "failed output").toBe(false);
		await expect
			.poll(async () => (await readExportProgress({ page })).isExporting, {
				timeout: 10_000,
			})
			.toBe(false);
		cycles.push({ label: "failure", result: failResult });

		// ---- Recovery export, same project, no restart -------------------------
		const recoveryOutputPath = path.join(workDir, "recovery.mp4");
		const recoveryResult = await runExportToCompletion({
			page,
			electronApp,
			projectId,
			outputPath: recoveryOutputPath,
			label: "recovery",
			memorySeries,
		});
		expect(recoveryResult, "recovery result").toMatchObject({ ok: true });
		const recoveryProbe = await assertGoodOutput({
			outputPath: recoveryOutputPath,
			label: "recovery",
		});
		await new Promise((resolve) => setTimeout(resolve, 400));
		const finalIdleSamples = await sampleMemory({ electronApp });
		memorySeries.push({
			atMs: Date.now(),
			label: "final-idle",
			samples: finalIdleSamples,
		});
		cycles.push({
			label: "recovery",
			outputPath: recoveryOutputPath,
			probe: recoveryProbe,
			result: recoveryResult,
		});

		// ---- Evidence ----------------------------------------------------------
		const idleSnapshots = memorySeries.filter(
			(snapshot) =>
				snapshot.label.endsWith("-idle") || snapshot.label === "startup"
		);
		await writeFile(
			path.join(EVIDENCE_DIR, "evidence.json"),
			JSON.stringify(
				{
					timeline: {
						totalSeconds: TIMELINE_SECONDS,
						totalFrames: TOTAL_FRAMES,
						width: WIDTH,
						height: HEIGHT,
					},
					cycles,
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

		// ---- Memory sanity guard ------------------------------------------------
		// A loose regression ceiling, not a leak-detection assertion — the
		// measured before/after analysis lives in the comparison doc. This just
		// keeps a runaway regression from only showing up in the evidence file.
		const startupTotal = totalMb(startupSamples);
		const finalTotal = totalMb(finalIdleSamples);
		expect(
			finalTotal - startupTotal,
			`idle total RSS grew ${(finalTotal - startupTotal).toFixed(1)}MB ` +
				`(startup ${startupTotal}MB -> final ${finalTotal}MB) across ` +
				`${SUCCESSFUL_RUNS + 3} export attempts`
		).toBeLessThan(800);
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
});

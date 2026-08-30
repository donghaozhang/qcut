import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type TestInfo } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import {
	inspectAndPreserveLocalStickerVideo,
	type StickerVideoEvidenceProfile,
} from "./exported-sticker-video-evidence";
import { createTestProject } from "./electron-helpers";
import { runQCutPipelineCli } from "./qcut-pipeline-cli";
import {
	installStickerExportRuntimeTrace,
	readStickerExportRuntimeTrace,
} from "./sticker-lab-export-runtime-trace";
import { redactStickerLabEvidence } from "./sticker-lab-evidence-redaction";
import {
	addBaseVideoToTimeline,
	buildVideoEvidenceArtifacts,
	forceTerminateElectronApp,
	launchIsolatedQCut,
	readRestrictedState,
	readRuntimeCanvasEvidence,
	saveCurrentProject,
	seekTimeline,
} from "./sticker-lab-lifecycle-harness";
import {
	REAL_STICKER_CACHE_CASES,
	REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
	type RealStickerCacheCase,
} from "./sticker-lab-real-cache-cases";
import {
	assertCompletedCliExport,
	findAvailableEditorApiPort,
	runStickerExportCli,
	verifyRealCachedPreviewRuntime,
	waitForEditorApiHealth,
} from "./sticker-lab-real-cache-lifecycle";
import { verifyAndPreserveRealVideoExports } from "./sticker-lab-real-video-evidence";

const CLI_LIFE_CACHE_CASE = REAL_STICKER_CACHE_CASES[2];
type AnimatedRealStickerCacheCase = Extract<
	RealStickerCacheCase,
	{ animated: true }
>;
const EVIDENCE_DIRECTORY = "/private/tmp/qcut-sticker-lab-export-evidence";
const STICKER_GEOMETRY = {
	height: 500,
	width: 500,
	x: 710,
	y: 290,
} as const;
const PROJECT_CANVAS_SIZE = { height: 1080, width: 1920 } as const;
const STICKER_EVIDENCE_REGION = {
	height: STICKER_GEOMETRY.height / PROJECT_CANVAS_SIZE.height,
	width: STICKER_GEOMETRY.width / PROJECT_CANVAS_SIZE.width,
	x: STICKER_GEOMETRY.x / PROJECT_CANVAS_SIZE.width,
	y: STICKER_GEOMETRY.y / PROJECT_CANVAS_SIZE.height,
} as const;
export const REAL_VIDEO_PROFILE: StickerVideoEvidenceProfile = {
	durationSeconds: 6,
	frameHashFrames: [1, 7, 13, 19, 25],
	frameRate: 30,
	maxDimension: 1280,
	minDimension: 720,
	postSplitFrameHashFrames: [121, 127, 133, 139, 145],
	times: {
		animated: 0.21,
		early: 0.01,
		nearEnd: 5.8,
		postSplit: 4.2,
		splitLeft: 2.99,
		splitRight: 3.01,
	},
};

function assertStickerTrackAboveMedia({
	state,
}: {
	state: Awaited<ReturnType<typeof readRestrictedState>>;
}): void {
	const stickerTrackIndex = state.trackTypes.indexOf("sticker");
	const mediaTrackIndex = state.trackTypes.indexOf("media");
	expect(stickerTrackIndex).toBeGreaterThanOrEqual(0);
	expect(mediaTrackIndex).toBeGreaterThanOrEqual(0);
	expect(stickerTrackIndex).toBeLessThan(mediaTrackIndex);
}

function expectedVisibleExportTimes({
	cacheCase,
	profile,
}: {
	cacheCase: AnimatedRealStickerCacheCase;
	profile: StickerVideoEvidenceProfile;
}): number[] {
	const baseTimes =
		"expectedVisibleExportTimes" in cacheCase
			? [...cacheCase.expectedVisibleExportTimes]
			: [
					profile.times.early,
					profile.times.animated,
					0.41,
					profile.times.splitLeft,
					profile.times.splitRight,
					profile.times.postSplit,
					profile.times.nearEnd,
				];
	const completeCycleTimes =
		profile.durationSeconds > cacheCase.runtime.cycleDurationSeconds
			? [profile.times.nearEnd, cacheCase.runtime.cycleDurationSeconds + 0.05]
			: [];
	return [...new Set([...baseTimes, ...completeCycleTimes])].filter(
		(time) => time < profile.durationSeconds
	);
}

function assertCliAddEvidence({
	cacheCase,
	evidence,
	rootPath,
}: {
	cacheCase: AnimatedRealStickerCacheCase;
	evidence: Awaited<ReturnType<typeof runQCutPipelineCli>>;
	rootPath: string;
}): void {
	const completed = evidence.envelopes.at(-1);
	expect(completed).toMatchObject({
		status: "ok",
		data: {
			command: "editor:sticker:add",
			data: {
				provenance: {
					batchId: cacheCase.batchId,
					byteSize: cacheCase.byteSize,
					checksumSha256: cacheCase.checksumSha256,
					kind: "local-reference",
					rootPath,
					stickerId: cacheCase.itemId,
				},
				redistribution: "prohibited",
				referenceOnly: true,
				timeline: { elementId: expect.any(String) },
				usage: "internal-reference-only",
				warning: expect.stringContaining("Do not redistribute"),
			},
		},
	});
}

function assertCliImportedSticker({
	cacheCase,
	durationSeconds,
	expectFileMime,
	expectedOpacity,
	state,
}: {
	cacheCase: AnimatedRealStickerCacheCase;
	durationSeconds: number;
	expectFileMime: boolean;
	expectedOpacity: number;
	state: Awaited<ReturnType<typeof readRestrictedState>>;
}): void {
	expect(state.media).toHaveLength(1);
	expect(state.stickers).toHaveLength(1);
	const media = state.media[0];
	const sticker = state.stickers[0];
	expect(media).toMatchObject({
		byteSize: cacheCase.byteSize,
		name: expect.stringMatching(/\.gif$/),
		type: "image",
	});
	if (expectFileMime) expect(media?.mimeType).toBe("image/gif");
	expect(media?.metadata).toMatchObject({
		animatedSticker: true,
		batchId: cacheCase.batchId,
		checksumSha256: cacheCase.checksumSha256,
		itemId: cacheCase.itemId,
		redistribution: "prohibited",
		referenceOnly: true,
		source: "sticker-lab",
		usage: "internal-reference-only",
	});
	expect(media?.metadata.stickerRuntime).toEqual(cacheCase.runtime);
	expect(sticker).toMatchObject({
		duration: durationSeconds,
		mediaId: media?.id,
		opacity: expectedOpacity,
		rotation: 0,
		startTime: 0,
		stickerAssetId: `sticker-lab:${cacheCase.batchId}:${cacheCase.itemId}`,
		stickerId: expect.stringMatching(/^sticker-/),
		stickerRuntime: cacheCase.runtime,
		trimEnd: 0,
		trimStart: 0,
		type: "sticker",
	});
	expect(sticker?.x).toBeCloseTo(50, 6);
	expect(sticker?.y).toBeCloseTo(50, 6);
	expect(sticker?.width).toBeCloseTo((500 / 1080) * 100, 6);
	expect(sticker?.height).toBeCloseTo((500 / 1080) * 100, 6);
	expect(cacheCase.runtime.frames).toHaveLength(cacheCase.frameCount);
}

async function runCliAdd({
	apiPort,
	cacheCase,
	durationSeconds,
	projectId,
	rootPath,
}: {
	apiPort: number;
	cacheCase: AnimatedRealStickerCacheCase;
	durationSeconds: number;
	projectId: string;
	rootPath: string;
}): Promise<Awaited<ReturnType<typeof runQCutPipelineCli>>> {
	return runQCutPipelineCli({
		apiPort,
		args: [
			"editor:sticker:add",
			"--project-id",
			projectId,
			"--provider",
			"sticker-lab",
			"--root",
			rootPath,
			"--batch-id",
			cacheCase.batchId,
			"--sticker-id",
			cacheCase.itemId,
			"--x",
			String(STICKER_GEOMETRY.x),
			"--y",
			String(STICKER_GEOMETRY.y),
			"--width",
			String(STICKER_GEOMETRY.width),
			"--height",
			String(STICKER_GEOMETRY.height),
			"--start-time",
			"0",
			"--end-time",
			String(durationSeconds),
			"--opacity",
			"0",
		],
	});
}

async function runCliOpacityUpdate({
	apiPort,
	elementId,
	projectId,
}: {
	apiPort: number;
	elementId: string;
	projectId: string;
}): Promise<Awaited<ReturnType<typeof runQCutPipelineCli>>> {
	return runQCutPipelineCli({
		apiPort,
		args: [
			"editor:sticker:update",
			"--project-id",
			projectId,
			"--element-id",
			elementId,
			"--opacity",
			"1",
		],
	});
}

async function assertSplitRuntime({
	cacheCase,
	page,
	profile,
}: {
	cacheCase: AnimatedRealStickerCacheCase;
	page: Parameters<typeof seekTimeline>[0]["page"];
	profile: StickerVideoEvidenceProfile;
}): Promise<void> {
	const runtimeCanvas = page
		.locator('canvas[data-sticker-runtime-kind="direct-gif"]:visible')
		.first();
	await seekTimeline({
		page,
		time: profile.times.splitLeft,
	});
	await expect(runtimeCanvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		cacheCase.runtimeSeek.splitLeftFrame
	);
	const splitLeft = await readRuntimeCanvasEvidence({ canvas: runtimeCanvas });
	await seekTimeline({
		page,
		time: profile.times.splitRight,
	});
	await expect(runtimeCanvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		cacheCase.runtimeSeek.splitRightFrame
	);
	const splitRight = await readRuntimeCanvasEvidence({ canvas: runtimeCanvas });
	expect(splitRight.pixelHash).not.toBe(splitLeft.pixelHash);
}

async function assertCompleteCycleRuntime({
	cacheCase,
	page,
	profile,
}: {
	cacheCase: AnimatedRealStickerCacheCase;
	page: Parameters<typeof seekTimeline>[0]["page"];
	profile: StickerVideoEvidenceProfile;
}): Promise<void> {
	const cycleDurationSeconds = cacheCase.runtime.cycleDurationSeconds;
	if (profile.durationSeconds <= cycleDurationSeconds + 0.05) return;
	const runtimeCanvas = page
		.locator('canvas[data-sticker-runtime-kind="direct-gif"]:visible')
		.first();
	await seekTimeline({ page, time: cycleDurationSeconds - 0.01 });
	await expect(runtimeCanvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		String(cacheCase.runtime.frames.length - 1)
	);
	const lastFrame = await readRuntimeCanvasEvidence({ canvas: runtimeCanvas });
	await seekTimeline({ page, time: cycleDurationSeconds + 0.05 });
	await expect(runtimeCanvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		"0"
	);
	const wrappedFrame = await readRuntimeCanvasEvidence({
		canvas: runtimeCanvas,
	});
	expect(wrappedFrame.pixelHash).not.toBe(lastFrame.pixelHash);
}

export async function runTrueCliCachedStickerExport({
	artifactStem = "real-hevc-aac-life-cli",
	cacheCase = CLI_LIFE_CACHE_CASE,
	inputVideoPath,
	profile = REAL_VIDEO_PROFILE,
	testInfo,
}: {
	artifactStem?: string;
	cacheCase?: AnimatedRealStickerCacheCase;
	inputVideoPath: string;
	profile?: StickerVideoEvidenceProfile;
	testInfo: TestInfo;
}): Promise<void> {
	if (!REAL_STICKER_CACHE_VIDEOS_DIRECTORY) {
		throw new Error("Real Sticker Lab videos directory is not configured");
	}
	const cleanupRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-cli-real-sticker-cache-e2e-")
	);
	const profileDirectory = path.join(cleanupRoot, "profile");
	const baselinePath = path.join(cleanupRoot, "baseline.mp4");
	const outputPath = path.join(cleanupRoot, `${cacheCase.itemId}-sticker.mp4`);
	const apiPort = await findAvailableEditorApiPort({ host: "127.0.0.1" });
	const splitTimeSeconds =
		(profile.times.splitLeft + profile.times.splitRight) / 2;
	let activeApp: ElectronApplication | null = null;

	try {
		await mkdir(profileDirectory, { recursive: true });
		const firstRun = await launchIsolatedQCut({
			apiPort,
			profileDirectory,
			videosDirectory: REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
		});
		activeApp = firstRun.electronApp;
		const firstPage = firstRun.page;
		await expect
			.poll(
				() => firstPage.evaluate(() => Boolean(window.electronAPI?.stickerLab)),
				{ timeout: 30_000, intervals: [100, 250, 500] }
			)
			.toBe(true);
		const cacheDiscovery = await firstPage.evaluate(async () => {
			const stickerLab = window.electronAPI?.stickerLab;
			if (!stickerLab) throw new Error("Sticker Lab desktop bridge is missing");
			const discovery = await stickerLab.discoverLocalReferences({});
			return {
				rootPath: discovery.rootPath,
				summary: discovery.summary,
				warnings: discovery.warnings,
			};
		});
		expect(cacheDiscovery.summary.batchCount).toBeGreaterThanOrEqual(18);
		expect(cacheDiscovery.summary.itemCount).toBeGreaterThanOrEqual(2_924);
		expect(cacheDiscovery.warnings).toHaveLength(0);

		await createTestProject(firstPage, "True CLI Sticker Lab Real Video E2E");
		await addBaseVideoToTimeline({ filePath: inputVideoPath, page: firstPage });
		const baseState = await readRestrictedState({ page: firstPage });
		const projectId = baseState.projectId;
		if (!projectId) throw new Error("CLI Sticker Lab project ID is missing");
		expect(baseState.mediaElements).toHaveLength(1);
		expect(baseState.mediaElements[0]?.duration).toBeCloseTo(
			profile.durationSeconds,
			3
		);

		await waitForEditorApiHealth({ apiPort });
		const cliAddEvidence = await runCliAdd({
			apiPort,
			cacheCase,
			durationSeconds: profile.durationSeconds,
			projectId,
			rootPath: cacheDiscovery.rootPath,
		});
		assertCliAddEvidence({
			cacheCase,
			evidence: cliAddEvidence,
			rootPath: cacheDiscovery.rootPath,
		});
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: firstPage });
				return { media: state.media.length, stickers: state.stickers.length };
			})
			.toEqual({ media: 1, stickers: 1 });
		const transparentState = await readRestrictedState({ page: firstPage });
		assertCliImportedSticker({
			cacheCase,
			durationSeconds: profile.durationSeconds,
			expectFileMime: true,
			expectedOpacity: 0,
			state: transparentState,
		});

		const baselineCli = await runStickerExportCli({
			apiPort,
			frameRate: profile.frameRate,
			outputPath: baselinePath,
			projectId,
		});
		assertCompletedCliExport({
			evidence: baselineCli,
			expectedEngine: "renderer-muxer",
			outputPath: baselinePath,
			projectId,
		});
		await inspectAndPreserveLocalStickerVideo({
			filePath: baselinePath,
			profile,
		});

		const transparentStickerId = transparentState.stickers[0]?.id;
		if (!transparentStickerId) {
			throw new Error("CLI-added Sticker Lab element ID is missing");
		}
		const opacityUpdateEvidence = await runCliOpacityUpdate({
			apiPort,
			elementId: transparentStickerId,
			projectId,
		});
		expect(opacityUpdateEvidence.envelopes.at(-1)).toMatchObject({
			status: "ok",
			data: { command: "editor:sticker:update" },
		});
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: firstPage });
				return state.stickers[0]?.opacity;
			})
			.toBe(1);
		const addedState = await readRestrictedState({ page: firstPage });
		assertCliImportedSticker({
			cacheCase,
			durationSeconds: profile.durationSeconds,
			expectFileMime: true,
			expectedOpacity: 1,
			state: addedState,
		});
		await verifyRealCachedPreviewRuntime({
			cacheCase,
			page: firstPage,
		});
		await assertCompleteCycleRuntime({ cacheCase, page: firstPage, profile });

		const timelineSticker = firstPage.locator(
			'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
		);
		await expect(timelineSticker).toHaveCount(1);
		await seekTimeline({ page: firstPage, time: splitTimeSeconds });
		await timelineSticker.first().click({ position: { x: 24, y: 12 } });
		await expect(firstPage.getByTestId("split-clip-button")).toBeEnabled();
		await firstPage.getByTestId("split-clip-button").click();
		await expect(timelineSticker).toHaveCount(2);
		await assertSplitRuntime({ cacheCase, page: firstPage, profile });

		const splitState = await readRestrictedState({ page: firstPage });
		assertStickerTrackAboveMedia({ state: splitState });
		expect(
			splitState.stickers.map(
				({
					duration,
					startTime,
					stickerAssetId,
					stickerRuntime,
					trimEnd,
					trimStart,
				}) => ({
					duration,
					startTime,
					stickerAssetId,
					stickerRuntime,
					trimEnd,
					trimStart,
				})
			)
		).toEqual([
			{
				duration: profile.durationSeconds,
				startTime: 0,
				stickerAssetId: `sticker-lab:${cacheCase.batchId}:${cacheCase.itemId}`,
				stickerRuntime: cacheCase.runtime,
				trimEnd: profile.durationSeconds - splitTimeSeconds,
				trimStart: 0,
			},
			{
				duration: profile.durationSeconds,
				startTime: splitTimeSeconds,
				stickerAssetId: `sticker-lab:${cacheCase.batchId}:${cacheCase.itemId}`,
				stickerRuntime: cacheCase.runtime,
				trimEnd: 0,
				trimStart: splitTimeSeconds,
			},
		]);
		expect(
			new Set(splitState.stickers.map(({ stickerId }) => stickerId)).size
		).toBe(2);
		expect(splitState.stickers.map(({ opacity }) => opacity)).toEqual([1, 1]);
		expect(
			splitState.stickers.every(({ stickerId }) =>
				stickerId?.startsWith("sticker-")
			)
		).toBe(true);
		await saveCurrentProject({ page: firstPage });
		await forceTerminateElectronApp({ electronApp: activeApp });
		activeApp = null;

		const reopened = await launchIsolatedQCut({
			apiPort,
			profileDirectory,
			videosDirectory: REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
		});
		activeApp = reopened.electronApp;
		const reopenedPage = reopened.page;
		await reopenedPage.evaluate((id) => {
			window.location.hash = `#/editor/${id}`;
		}, projectId);
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: reopenedPage });
				return {
					media: state.media.length,
					mediaElements: state.mediaElements.length,
					stickers: state.stickers.length,
				};
			})
			.toEqual({ media: 1, mediaElements: 1, stickers: 2 });
		const reopenedState = await readRestrictedState({ page: reopenedPage });
		assertStickerTrackAboveMedia({ state: reopenedState });
		expect(
			reopenedState.stickers.every(
				({ stickerAssetId }) =>
					stickerAssetId ===
					`sticker-lab:${cacheCase.batchId}:${cacheCase.itemId}`
			)
		).toBe(true);
		expect(
			new Set(reopenedState.stickers.map(({ stickerId }) => stickerId)).size
		).toBe(2);
		expect(reopenedState.stickers.map(({ opacity }) => opacity)).toEqual([
			1, 1,
		]);
		expect(
			reopenedState.stickers.map(({ stickerRuntime }) => stickerRuntime)
		).toEqual([cacheCase.runtime, cacheCase.runtime]);
		await verifyRealCachedPreviewRuntime({
			cacheCase,
			page: reopenedPage,
		});
		await assertSplitRuntime({ cacheCase, page: reopenedPage, profile });
		await assertCompleteCycleRuntime({
			cacheCase,
			page: reopenedPage,
			profile,
		});
		await installStickerExportRuntimeTrace({
			page: reopenedPage,
		});

		await waitForEditorApiHealth({ apiPort });
		const exportCliEvidence = await runStickerExportCli({
			apiPort,
			frameRate: profile.frameRate,
			outputPath,
			projectId,
		});
		assertCompletedCliExport({
			evidence: exportCliEvidence,
			outputPath,
			projectId,
		});
		const runtimeExportTrace = await readStickerExportRuntimeTrace({
			descriptor: cacheCase.runtime,
			evidencePath: path.join(
				EVIDENCE_DIRECTORY,
				`${artifactStem}-runtime-trace.json`
			),
			expectedFrameCount: Math.ceil(
				profile.durationSeconds * profile.frameRate
			),
			expectedSourceHeight: cacheCase.height,
			expectedSourceWidth: cacheCase.width,
			frameRate: profile.frameRate,
			page: reopenedPage,
			testInfo,
			timelineDurationSeconds: profile.durationSeconds,
		});
		await inspectAndPreserveLocalStickerVideo({
			artifacts: buildVideoEvidenceArtifacts({
				prefix: `${artifactStem}-export`,
				reportContext: redactStickerLabEvidence({
					cacheRootPath: cacheDiscovery.rootPath,
					inputVideoPath,
					value: {
						baselineCli,
						cacheDiscovery,
						cliAddEvidence,
						exportCliEvidence,
						inputVideoPath,
						opacityUpdateEvidence,
						profile,
						runtimeExportTrace,
						scenario: "true-cli-add-real-cache-hevc-aac",
					},
				}) as Record<string, unknown>,
				testInfo,
				times: profile.times,
			}),
			filePath: outputPath,
			profile,
		});
		const exportEvidence = await verifyAndPreserveRealVideoExports({
			artifactStem,
			baselinePath,
			evidenceDirectory: EVIDENCE_DIRECTORY,
			expectedDurationSeconds: profile.durationSeconds,
			inputPath: inputVideoPath,
			outputPath,
			stickerRegion: STICKER_EVIDENCE_REGION,
			testInfo,
			times: expectedVisibleExportTimes({ cacheCase, profile }),
		});
		expect(exportEvidence.preservedOutputPath).toBe(
			path.join(EVIDENCE_DIRECTORY, `${artifactStem}-sticker.mp4`)
		);
		await reopenedPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(`${artifactStem}-after-export.png`),
		});
	} finally {
		try {
			if (activeApp?.process().exitCode === null) {
				await forceTerminateElectronApp({ electronApp: activeApp });
			}
		} finally {
			await rm(cleanupRoot, { recursive: true, force: true });
		}
	}
}

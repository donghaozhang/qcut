import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { readLocalReference } from "../../../../../../electron/native-pipeline/stickers/local-reference-catalog/index";
import { resolveStickerGeometry } from "../../../lib/stickers/sticker-geometry";
import { createTestProject } from "./electron-helpers";
import {
	exportLocalStickerVideo,
	inspectAndPreserveLocalStickerVideo,
} from "./exported-sticker-video-evidence";
import {
	addStickerLabReferenceWithCli,
	removeStickerWithCli,
} from "./sticker-lab-cli-reference-commands";
import {
	type StratifiedStickerBatchEvidence,
	verifyStratifiedStickerBatchVideo,
} from "./sticker-lab-stratified-batch-evidence";
import type { StratifiedStickerSourceReference } from "./sticker-lab-source-frame-evidence";
import {
	type AddedStratifiedSticker,
	buildStickerTimelineSlots,
	chunkStickerSamples,
	mapSequentially,
	STICKER_BATCH_CANVAS_SIZE,
	STICKER_BATCH_GEOMETRY,
	STICKER_BATCH_MAX_GIF_CYCLE_DURATION_SECONDS,
	STICKER_BATCH_PROFILE,
} from "./sticker-lab-stratified-batch-model";
import {
	selectRepresentativeUiSamples,
	selectStratifiedStickerSamples,
	type StratifiedStickerSample,
} from "./sticker-lab-stratified-samples";
import {
	addBaseVideoToTimeline,
	forceTerminateElectronApp,
	launchIsolatedQCut,
	readRestrictedState,
	saveCurrentProject,
	seekTimeline,
} from "./sticker-lab-lifecycle-harness";
import {
	assertCompletedCliExport,
	findAvailableEditorApiPort,
	runStickerExportCli,
	waitForEditorApiHealth,
} from "./sticker-lab-real-cache-lifecycle";
import { addStickerLabUiBatch } from "./sticker-lab-stratified-ui-batch";
import { waitForStickerCount } from "./sticker-lab-restricted-state-wait";
import { readStratifiedTimelineItem } from "./sticker-lab-stratified-timeline-evidence";
import {
	type ExpectedStratifiedMedia,
	inspectStratifiedMediaFile,
	type VerifiedStratifiedMedia,
} from "./sticker-lab-stratified-media-evidence";
import {
	installStickerExportRuntimeTrace,
	readRawStickerExportRuntimeDraws,
	readStickerSourceRuntimeFrameHashes,
	resetStickerExportRuntimeTrace,
} from "./sticker-lab-export-runtime-trace";

const CLI_BATCH_SIZE = 8;
const UI_BATCH_SIZE = 6;
const UI_SAMPLE_COUNT = 12;
const OFF_CANVAS_BASELINE_GEOMETRY = {
	...STICKER_BATCH_GEOMETRY,
	x: STICKER_BATCH_CANVAS_SIZE.width + 1,
	y: 0,
};
const EXPECTED_INPUT_MEDIA: ExpectedStratifiedMedia = {
	audioChannels: 2,
	audioCodec: "aac",
	audioSampleRate: 44_100,
	durationSeconds: STICKER_BATCH_PROFILE.durationSeconds,
	frameRate: STICKER_BATCH_PROFILE.frameRate,
	videoCodec: "hevc",
};
const EXPECTED_OUTPUT_MEDIA: ExpectedStratifiedMedia = {
	audioChannels: 2,
	audioCodec: "aac",
	audioSampleRate: 48_000,
	durationSeconds: STICKER_BATCH_PROFILE.durationSeconds,
	frameRate: STICKER_BATCH_PROFILE.frameRate,
	height: STICKER_BATCH_PROFILE.minDimension,
	videoCodec: "h264",
	width: STICKER_BATCH_PROFILE.maxDimension,
};

interface BatchRunSummary {
	batchId: string;
	failedItemIds: string[];
	itemIds: string[];
	media: VerifiedStratifiedMedia;
	outputFileName: string;
	passedItemCount: number;
	reportFileName: string;
	runtimeTraceFileName: string;
	trigger: "cli" | "ui";
}

type StickerSourceReferenceCache = Map<
	string,
	StratifiedStickerSourceReference
>;

export interface StratifiedStickerRunSummary {
	baselineMedia: VerifiedStratifiedMedia;
	categoryCount: number;
	cliBatchCount: number;
	cliPassedItemCount: number;
	evidenceDirectory: string;
	itemCount: number;
	outputVideoCount: number;
	sourceBatchCount: number;
	sourceMedia: VerifiedStratifiedMedia;
	uiBatchCount: number;
	uiPassedItemCount: number;
}

function assertOffCanvasBaselineSticker({
	elementId,
	state,
}: {
	elementId: string;
	state: Awaited<ReturnType<typeof readRestrictedState>>;
}): void {
	const sticker = state.stickers.find(({ id }) => id === elementId);
	if (!sticker) throw new Error("Off-canvas baseline sticker is missing");
	const { height, opacity, width, x, y } = sticker;
	if (typeof width !== "number" || typeof x !== "number") {
		throw new Error("Off-canvas baseline sticker geometry is incomplete");
	}
	const { left } = resolveStickerGeometry({
		canvasHeight: STICKER_BATCH_CANVAS_SIZE.height,
		canvasWidth: STICKER_BATCH_CANVAS_SIZE.width,
		position: { x, y: y ?? 0 },
		size: { height: height ?? width, width },
	});
	if (opacity !== 1 || left < STICKER_BATCH_CANVAS_SIZE.width) {
		throw new Error("Baseline sticker intersects the exported video canvas");
	}
}

function runDirectoryName(): string {
	return `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

async function removeAddedStickers({
	added,
	apiPort,
	page,
	projectId,
}: {
	added: AddedStratifiedSticker[];
	apiPort: number;
	page: Page;
	projectId: string;
}): Promise<void> {
	await mapSequentially({
		items: added,
		worker: async ({ item }) => {
			await removeStickerWithCli({
				apiPort,
				elementId: item.elementId,
				projectId,
			});
			return item.elementId;
		},
	});
	await waitForStickerCount({ count: 0, page });
}

async function readBatchSourceReferences({
	cache,
	rootPath,
	samples,
}: {
	cache: StickerSourceReferenceCache;
	rootPath: string;
	samples: StratifiedStickerSample[];
}): Promise<ReadonlyMap<string, StratifiedStickerSourceReference>> {
	const missing = samples.filter(({ itemId }) => !cache.has(itemId));
	const references = await Promise.all(
		missing.map(async (sample) => {
			const reference = await readLocalReference({
				batchId: sample.batchId,
				rootPath,
				stickerId: sample.itemId,
			});
			if (reference.mimeType !== sample.mimeType) {
				throw new Error(
					`Sticker ${sample.itemId} source MIME type does not match discovery`
				);
			}
			return [
				sample.itemId,
				{
					bytes: reference.bytes,
					checksumSha256: reference.checksumSha256,
					mimeType: reference.mimeType,
				},
			] as const;
		})
	);
	for (const [itemId, reference] of references) cache.set(itemId, reference);
	return new Map(
		samples.map(({ itemId }) => {
			const reference = cache.get(itemId);
			if (!reference) {
				throw new Error(`Sticker ${itemId} source reference was not cached`);
			}
			return [itemId, reference] as const;
		})
	);
}

async function preserveBatchScreenshot({
	added,
	batchId,
	page,
	runDirectory,
}: {
	added: AddedStratifiedSticker[];
	batchId: string;
	page: Page;
	runDirectory: string;
}): Promise<void> {
	const first = added[0];
	await seekTimeline({
		page,
		time: (first.slot.startTime + first.slot.endTime) / 2,
	});
	const screenshotPath = path.join(runDirectory, `${batchId}-preview.png`);
	await page.screenshot({ animations: "disabled", path: screenshotPath });
}

async function exportAndVerifyBatch({
	added,
	apiPort,
	baselinePath,
	batchId,
	electronApp,
	page,
	projectId,
	runDirectory,
	runtimeFrameHashesByItemId,
	sourceReferences,
	testInfo,
	trigger,
}: {
	added: AddedStratifiedSticker[];
	apiPort: number;
	baselinePath: string;
	batchId: string;
	electronApp: ElectronApplication;
	page: Page;
	projectId: string;
	runDirectory: string;
	runtimeFrameHashesByItemId: ReadonlyMap<string, string[]>;
	sourceReferences: ReadonlyMap<string, StratifiedStickerSourceReference>;
	testInfo: TestInfo;
	trigger: "cli" | "ui";
}): Promise<BatchRunSummary> {
	await waitForStickerCount({ count: added.length, page });
	const state = await readRestrictedState({ page });
	const timelineItems = added.map((item) =>
		readStratifiedTimelineItem({ added: item, state })
	);
	const outputPath = path.join(runDirectory, `${batchId}.mp4`);
	await resetStickerExportRuntimeTrace({ page });
	if (trigger === "cli") {
		const cliEvidence = await runStickerExportCli({
			apiPort,
			frameRate: STICKER_BATCH_PROFILE.frameRate,
			outputPath,
			projectId,
		});
		assertCompletedCliExport({
			evidence: cliEvidence,
			outputPath,
			projectId,
		});
	}
	if (trigger === "ui") {
		await exportLocalStickerVideo({
			electronApp,
			filePath: outputPath,
			includeAudio: true,
			page,
			profile: STICKER_BATCH_PROFILE,
		});
		await page.getByRole("button", { name: "Close export dialog" }).click();
		await expect(page.getByTestId("export-dialog")).toBeHidden();
	}
	const runtimeTracePath = path.join(
		runDirectory,
		`${batchId}-runtime-trace.json`
	);
	const runtimeDraws = await readRawStickerExportRuntimeDraws({ page });
	await writeFile(
		runtimeTracePath,
		`${JSON.stringify({ batchId, draws: runtimeDraws }, null, 2)}\n`
	);
	await testInfo.attach(`${batchId}-runtime-trace`, {
		contentType: "application/json",
		path: runtimeTracePath,
	});
	if (trigger === "cli") {
		await inspectAndPreserveLocalStickerVideo({
			filePath: outputPath,
			profile: STICKER_BATCH_PROFILE,
		});
	}
	const media = await inspectStratifiedMediaFile({
		expected: EXPECTED_OUTPUT_MEDIA,
		filePath: outputPath,
	});
	const reportPath = path.join(runDirectory, `${batchId}-evidence.json`);
	const evidence: StratifiedStickerBatchEvidence =
		await verifyStratifiedStickerBatchVideo({
			baselinePath,
			batchId,
			frameRate: STICKER_BATCH_PROFILE.frameRate,
			items: timelineItems,
			outputPath,
			reportPath,
			runtimeDraws,
			runtimeFrameHashesByItemId,
			sourceReferences,
			testInfo,
		});
	await preserveBatchScreenshot({
		added,
		batchId,
		page,
		runDirectory,
	});
	return {
		batchId,
		failedItemIds: evidence.failedItemIds,
		itemIds: added.map(({ sample }) => sample.itemId),
		media,
		outputFileName: path.basename(outputPath),
		passedItemCount: evidence.passedItemCount,
		reportFileName: path.basename(reportPath),
		runtimeTraceFileName: path.basename(runtimeTracePath),
		trigger,
	};
}

async function addCliBatch({
	apiPort,
	projectId,
	rootPath,
	samples,
}: {
	apiPort: number;
	projectId: string;
	rootPath: string;
	samples: StratifiedStickerSample[];
}): Promise<AddedStratifiedSticker[]> {
	const slots = buildStickerTimelineSlots({ samples });
	return mapSequentially({
		items: samples,
		worker: async ({ index, item: sample }) => {
			const slot = slots[index];
			const result = await addStickerLabReferenceWithCli({
				apiPort,
				endTime: slot.endTime,
				geometry: STICKER_BATCH_GEOMETRY,
				projectId,
				rootPath,
				sample,
				startTime: slot.startTime,
			});
			return {
				elementId: result.elementId,
				sample,
				slot,
				trigger: "cli" as const,
			};
		},
	});
}

async function runBatches({
	apiPort,
	baselinePath,
	electronApp,
	onBatchCompleted,
	page,
	projectId,
	rootPath,
	runDirectory,
	sampleBatches,
	sourceReferenceCache,
	testInfo,
	trigger,
}: {
	apiPort: number;
	baselinePath: string;
	electronApp: ElectronApplication;
	onBatchCompleted: (options: { summary: BatchRunSummary }) => void;
	page: Page;
	projectId: string;
	rootPath: string;
	runDirectory: string;
	sampleBatches: StratifiedStickerSample[][];
	sourceReferenceCache: StickerSourceReferenceCache;
	testInfo: TestInfo;
	trigger: "cli" | "ui";
}): Promise<BatchRunSummary[]> {
	return mapSequentially({
		items: sampleBatches,
		worker: async ({ index, item: samples }) => {
			const batchId = `${trigger}-batch-${String(index + 1).padStart(2, "0")}`;
			const sourceReferences = await readBatchSourceReferences({
				cache: sourceReferenceCache,
				rootPath,
				samples,
			});
			const runtimeFrameHashesByItemId =
				await readStickerSourceRuntimeFrameHashes({
					page,
					rootPath,
					samples,
					sourceReferences,
				});
			const added =
				trigger === "cli"
					? await addCliBatch({ apiPort, projectId, rootPath, samples })
					: await addStickerLabUiBatch({ apiPort, page, projectId, samples });
			const summary = await exportAndVerifyBatch({
				added,
				apiPort,
				baselinePath,
				batchId,
				electronApp,
				page,
				projectId,
				runDirectory,
				runtimeFrameHashesByItemId,
				sourceReferences,
				testInfo,
				trigger,
			});
			onBatchCompleted({ summary });
			await removeAddedStickers({ added, apiPort, page, projectId });
			return summary;
		},
	});
}

export async function runStratifiedRealCacheStickerExports({
	inputVideoPath,
	testInfo,
	videosDirectory,
}: {
	inputVideoPath: string;
	testInfo: TestInfo;
	videosDirectory: string;
}): Promise<StratifiedStickerRunSummary> {
	const cleanupRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-stratified-sticker-e2e-")
	);
	const evidenceRoot =
		process.env.QCUT_STICKER_LAB_BATCH_EVIDENCE_DIRECTORY ??
		path.join(tmpdir(), "qcut-sticker-lab-batch-evidence");
	const runDirectory = path.join(evidenceRoot, runDirectoryName());
	const profileDirectory = path.join(cleanupRoot, "profile");
	const baselinePath = path.join(runDirectory, "baseline.mp4");
	const apiPort = await findAvailableEditorApiPort({ host: "127.0.0.1" });
	let activeApp: ElectronApplication | null = null;
	let completedBatches: BatchRunSummary[] = [];
	const sourceReferenceCache: StickerSourceReferenceCache = new Map();
	const recordCompletedBatch = ({
		summary,
	}: {
		summary: BatchRunSummary;
	}): void => {
		completedBatches = [...completedBatches, summary];
	};
	await mkdir(runDirectory, { recursive: true });
	try {
		const sourceMedia = await inspectStratifiedMediaFile({
			expected: EXPECTED_INPUT_MEDIA,
			filePath: inputVideoPath,
		});
		const launched = await launchIsolatedQCut({
			apiPort,
			profileDirectory,
			videosDirectory,
		});
		activeApp = launched.electronApp;
		const { page } = launched;
		await installStickerExportRuntimeTrace({ page });
		await waitForEditorApiHealth({ apiPort });
		const discovery = await page.evaluate(async () => {
			const stickerLab = window.electronAPI?.stickerLab;
			if (!stickerLab) throw new Error("Sticker Lab desktop bridge is missing");
			return stickerLab.discoverLocalReferences({});
		});
		const samples = selectStratifiedStickerSamples({
			discovery,
			maxGifCycleDurationSeconds: STICKER_BATCH_MAX_GIF_CYCLE_DURATION_SECONDS,
		});
		if (samples.length !== discovery.summary.categoryCount * 2) {
			throw new Error("Sticker Lab matrix does not cover every category twice");
		}
		const uiSamples = selectRepresentativeUiSamples({
			limit: UI_SAMPLE_COUNT,
			samples,
		});
		await writeFile(
			path.join(runDirectory, "selection.json"),
			`${JSON.stringify(
				{
					discovery: discovery.summary,
					redistribution: "prohibited",
					samples,
					uiItemIds: uiSamples.map(({ itemId }) => itemId),
				},
				null,
				2
			)}\n`
		);
		await createTestProject(page, "Stratified Real Sticker Cache E2E");
		await addBaseVideoToTimeline({ filePath: inputVideoPath, page });
		const state = await readRestrictedState({ page });
		const projectId = state.projectId;
		if (!projectId)
			throw new Error("Stratified Sticker Lab project ID is missing");
		const offCanvasBaselineSticker = await addStickerLabReferenceWithCli({
			apiPort,
			endTime: STICKER_BATCH_PROFILE.durationSeconds,
			geometry: OFF_CANVAS_BASELINE_GEOMETRY,
			projectId,
			rootPath: discovery.rootPath,
			sample: samples[0],
			startTime: 0,
		});
		await waitForStickerCount({ count: 1, page });
		assertOffCanvasBaselineSticker({
			elementId: offCanvasBaselineSticker.elementId,
			state: await readRestrictedState({ page }),
		});
		const baselineCli = await runStickerExportCli({
			apiPort,
			frameRate: STICKER_BATCH_PROFILE.frameRate,
			outputPath: baselinePath,
			projectId,
		});
		assertCompletedCliExport({
			evidence: baselineCli,
			outputPath: baselinePath,
			projectId,
		});
		await inspectAndPreserveLocalStickerVideo({
			filePath: baselinePath,
			profile: STICKER_BATCH_PROFILE,
		});
		const baselineMedia = await inspectStratifiedMediaFile({
			expected: EXPECTED_OUTPUT_MEDIA,
			filePath: baselinePath,
		});
		await removeStickerWithCli({
			apiPort,
			elementId: offCanvasBaselineSticker.elementId,
			projectId,
		});
		await waitForStickerCount({ count: 0, page });
		const uiBatches = chunkStickerSamples({
			items: uiSamples,
			size: UI_BATCH_SIZE,
		});
		const uiResults = await runBatches({
			apiPort,
			baselinePath,
			electronApp: activeApp,
			onBatchCompleted: recordCompletedBatch,
			page,
			projectId,
			rootPath: discovery.rootPath,
			runDirectory,
			sampleBatches: uiBatches,
			sourceReferenceCache,
			testInfo,
			trigger: "ui",
		});
		const cliBatches = chunkStickerSamples({
			items: samples,
			size: CLI_BATCH_SIZE,
		});
		const cliResults = await runBatches({
			apiPort,
			baselinePath,
			electronApp: activeApp,
			onBatchCompleted: recordCompletedBatch,
			page,
			projectId,
			rootPath: discovery.rootPath,
			runDirectory,
			sampleBatches: cliBatches,
			sourceReferenceCache,
			testInfo,
			trigger: "cli",
		});
		await saveCurrentProject({ page });
		const summary: StratifiedStickerRunSummary = {
			baselineMedia,
			categoryCount: discovery.summary.categoryCount,
			cliBatchCount: cliResults.length,
			cliPassedItemCount: cliResults.reduce(
				(total, batch) => total + batch.passedItemCount,
				0
			),
			evidenceDirectory: runDirectory,
			itemCount: discovery.summary.itemCount,
			outputVideoCount: 1 + uiResults.length + cliResults.length,
			sourceBatchCount: discovery.summary.batchCount,
			sourceMedia,
			uiBatchCount: uiResults.length,
			uiPassedItemCount: uiResults.reduce(
				(total, batch) => total + batch.passedItemCount,
				0
			),
		};
		await writeFile(
			path.join(runDirectory, "index.json"),
			`${JSON.stringify(
				{
					batches: completedBatches,
					inputFileName: path.basename(inputVideoPath),
					redistribution: "prohibited",
					summary,
				},
				null,
				2
			)}\n`
		);
		const failedItemIds = completedBatches.flatMap(
			(batch) => batch.failedItemIds
		);
		if (failedItemIds.length > 0) {
			throw new Error(
				`Stratified Sticker Lab source fidelity failed for ${failedItemIds.length} execution(s): ${failedItemIds.join(", ")}`
			);
		}
		console.log(`Sticker Lab stratified evidence: ${runDirectory}`);
		return summary;
	} catch (error) {
		await writeFile(
			path.join(runDirectory, "failure.json"),
			`${JSON.stringify(
				{
					completedBatches,
					error:
						"Stratified Sticker Lab E2E failed; inspect the test runner output",
					redistribution: "prohibited",
				},
				null,
				2
			)}\n`
		);
		throw error;
	} finally {
		try {
			if (activeApp?.process().exitCode === null) {
				await forceTerminateElectronApp({ electronApp: activeApp });
			}
		} finally {
			await rm(cleanupRoot, { force: true, recursive: true });
		}
	}
}

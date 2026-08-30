import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import { expect, type TestInfo } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { createTestProject } from "./electron-helpers";
import {
	exportAndVerifyRealCachedStickerVideo,
	inspectAndVerifyRealCachedStickerVideo,
} from "./exported-sticker-video-evidence";
import {
	installStickerExportRuntimeTrace,
	readRawStickerExportRuntimeDraws,
	type StickerExportRuntimeDraw,
} from "./sticker-lab-export-runtime-trace";
import {
	addBaseVideoToTimeline,
	buildVideoEvidenceArtifacts,
	forceTerminateElectronApp,
	launchIsolatedQCut,
	readRestrictedState,
	type RestrictedState,
	saveCurrentProject,
	withoutTransientFileMime,
} from "./sticker-lab-lifecycle-harness";
import {
	addPrivateRealRuntimeWithCli,
	addPrivateRealRuntimeWithUi,
	assertPrivateRealRuntimeState,
	assertPrivateRuntimeExportDraws,
	exercisePrivateRealRuntimeSeekAndSplit,
	normalizedPrivateRuntimeStickerRegion,
	PRIVATE_REAL_RUNTIME_SPLIT_RIGHT_SAMPLE_SECONDS,
	readPrivateRealRuntimeAt,
} from "./sticker-lab-private-real-runtime-assertions";
import {
	discoverPrivateRealRuntimeCase,
	PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH,
	PRIVATE_REAL_RUNTIME_VIDEO_PROFILE,
	PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY,
	type PrivateRealRuntimeCase,
	type PrivateRealRuntimeDefinition,
} from "./sticker-lab-private-real-runtime-cases";
import {
	assertCompletedCliExport,
	findAvailableEditorApiPort,
	runStickerExportCli,
	waitForEditorApiHealth,
} from "./sticker-lab-real-cache-lifecycle";
import { verifyAndPreserveRealVideoExports } from "./sticker-lab-real-video-evidence";

const EVIDENCE_DIRECTORY = path.join(
	tmpdir(),
	"qcut-sticker-lab-real-runtime-evidence"
);

interface PrivateRuntimeTraceWindow extends Window {
	__privateRuntimeImageTraceInstalled?: boolean;
	__stickerExportRuntimeFingerprintSource?: (source: CanvasImageSource) => {
		alphaPixelRatio: number;
		pixelHash: string;
	};
	__stickerExportRuntimeTrace?: {
		draws: StickerExportRuntimeDraw[];
		outputFrameIndex: number;
	};
}

async function installPrivateRuntimeExportTrace({
	page,
}: {
	page: Page;
}): Promise<void> {
	await installStickerExportRuntimeTrace({ page });
	await page.evaluate(() => {
		const traceWindow = window as PrivateRuntimeTraceWindow;
		if (traceWindow.__privateRuntimeImageTraceInstalled) return;
		const previousDrawImage = CanvasRenderingContext2D.prototype.drawImage;
		const augmentedDrawImage = function (
			this: CanvasRenderingContext2D,
			...args: unknown[]
		): unknown {
			const source = args[0];
			const targetCanvas = this.canvas;
			if (
				source instanceof HTMLImageElement &&
				targetCanvas instanceof HTMLCanvasElement &&
				targetCanvas.classList.contains("export-canvas")
			) {
				const fingerprint =
					traceWindow.__stickerExportRuntimeFingerprintSource?.(source);
				const trace = traceWindow.__stickerExportRuntimeTrace;
				if (fingerprint && trace) {
					trace.draws.push({
						alphaPixelRatio: fingerprint.alphaPixelRatio,
						...(trace.outputFrameIndex >= 0
							? { outputFrameIndex: trace.outputFrameIndex }
							: {}),
						pixelHash: fingerprint.pixelHash,
						sourceHeight: source.naturalHeight,
						sourceKind: source.constructor.name,
						sourceWidth: source.naturalWidth,
					});
				}
			}
			return Reflect.apply(previousDrawImage, this, args);
		};
		Reflect.set(
			CanvasRenderingContext2D.prototype,
			"drawImage",
			augmentedDrawImage
		);
		traceWindow.__privateRuntimeImageTraceInstalled = true;
	});
}

function runtimeEvidenceTimes({
	descriptor,
}: {
	descriptor: StickerRuntimeDescriptor;
}): number[] {
	const { times } = PRIVATE_REAL_RUNTIME_VIDEO_PROFILE;
	if (descriptor.kind === "alpha-video") {
		return [
			times.animated,
			descriptor.cycleDurationSeconds * 0.75,
			times.splitLeft,
			times.splitRight,
		];
	}
	return [
		times.early,
		times.animated,
		descriptor.cycleDurationSeconds * 0.75,
		times.splitLeft,
		times.splitRight,
		times.postSplit,
		times.nearEnd,
	].filter(
		(timeSeconds, index, values) =>
			timeSeconds < PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.durationSeconds &&
			values.indexOf(timeSeconds) === index
	);
}

async function writeRuntimeTraceEvidence({
	draws,
	runtimeCase,
	testInfo,
	trigger,
}: {
	draws: Awaited<ReturnType<typeof readRawStickerExportRuntimeDraws>>;
	runtimeCase: PrivateRealRuntimeCase;
	testInfo: TestInfo;
	trigger: "cli" | "ui";
}): Promise<void> {
	const tracePath = testInfo.outputPath(
		`${runtimeCase.kind}-${trigger}-runtime-trace.json`
	);
	await mkdir(path.dirname(tracePath), { recursive: true });
	await writeFile(
		tracePath,
		`${JSON.stringify(
			{
				batchId: runtimeCase.batchId,
				draws,
				itemId: runtimeCase.stickerId,
				kind: runtimeCase.kind,
				redistribution: "prohibited",
				resourceCount: runtimeCase.resources.length,
				trigger,
			},
			null,
			2
		)}\n`
	);
	await testInfo.attach(`${runtimeCase.kind}-${trigger}-runtime-trace`, {
		contentType: "application/json",
		path: tracePath,
	});
}

async function exportAndVerifyRuntimeVideo({
	activeApp,
	apiPort,
	descriptor,
	outputPath,
	page,
	projectId,
	runtimeCase,
	state,
	testInfo,
	trigger,
}: {
	activeApp: ElectronApplication;
	apiPort?: number;
	descriptor: StickerRuntimeDescriptor;
	outputPath: string;
	page: Page;
	projectId: string;
	runtimeCase: PrivateRealRuntimeCase;
	state: RestrictedState;
	testInfo: TestInfo;
	trigger: "cli" | "ui";
}): Promise<void> {
	const artifactStem = `real-runtime-${runtimeCase.kind}-${trigger}`;
	const artifacts = buildVideoEvidenceArtifacts({
		prefix: artifactStem,
		reportContext: {
			batchId: runtimeCase.batchId,
			itemId: runtimeCase.stickerId,
			kind: runtimeCase.kind,
			redistribution: "prohibited",
			referenceOnly: true,
			resourceCount: runtimeCase.resources.length,
			trigger,
		},
		testInfo,
		times: PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.times,
	});
	await installPrivateRuntimeExportTrace({ page });
	const evidence =
		trigger === "ui"
			? await exportAndVerifyRealCachedStickerVideo({
					animated: true,
					artifacts,
					electronApp: activeApp,
					filePath: outputPath,
					includeAudio: true,
					page,
					profile: PRIVATE_REAL_RUNTIME_VIDEO_PROFILE,
				})
			: await (async () => {
					if (!apiPort) throw new Error("CLI export port is missing");
					await rm(outputPath, { force: true });
					await waitForEditorApiHealth({ apiPort });
					const cliEvidence = await runStickerExportCli({
						apiPort,
						frameRate: PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.frameRate,
						outputPath,
						projectId,
					});
					assertCompletedCliExport({
						evidence: cliEvidence,
						outputPath,
						projectId,
					});
					return inspectAndVerifyRealCachedStickerVideo({
						animated: true,
						artifacts,
						filePath: outputPath,
						profile: PRIVATE_REAL_RUNTIME_VIDEO_PROFILE,
					});
				})();
	expect(evidence.sizeBytes).toBeGreaterThan(1_000);
	const runtimeDraws = await readRawStickerExportRuntimeDraws({ page });
	assertPrivateRuntimeExportDraws({
		draws: runtimeDraws,
		runtimeCase,
		state,
	});
	await writeRuntimeTraceEvidence({
		draws: runtimeDraws,
		runtimeCase,
		testInfo,
		trigger,
	});
	await verifyAndPreserveRealVideoExports({
		artifactStem,
		baselinePath: PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH,
		baselineVideoCodec: "hevc",
		evidenceDirectory: EVIDENCE_DIRECTORY,
		expectedDurationSeconds: PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.durationSeconds,
		inputPath: PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH,
		outputPath,
		stickerRegion: normalizedPrivateRuntimeStickerRegion({ state }),
		testInfo,
		times: runtimeEvidenceTimes({ descriptor }),
	});
}

export async function runPrivateRealRuntimeLifecycle({
	definition,
	testInfo,
	trigger,
}: {
	definition: PrivateRealRuntimeDefinition;
	testInfo: TestInfo;
	trigger: "cli" | "ui";
}): Promise<void> {
	if (!PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY) {
		throw new Error("Private runtime Sticker Lab videos directory is missing");
	}
	const cleanupRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-real-runtime-cache-e2e-")
	);
	const profileDirectory = path.join(cleanupRoot, "profile");
	const outputPath = path.join(
		cleanupRoot,
		`${definition.kind}-${trigger}-export.mp4`
	);
	const apiPort =
		trigger === "cli"
			? await findAvailableEditorApiPort({ host: "127.0.0.1" })
			: undefined;
	let activeApp: ElectronApplication | null = null;

	try {
		await mkdir(profileDirectory, { recursive: true });
		const firstRun = await launchIsolatedQCut({
			apiPort,
			profileDirectory,
			videosDirectory: PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY,
		});
		activeApp = firstRun.electronApp;
		const page = firstRun.page;
		const { discovery, runtimeCase } = await discoverPrivateRealRuntimeCase({
			definition,
			page,
		});
		await createTestProject(
			page,
			`Real ${runtimeCase.kind} ${trigger.toUpperCase()} lifecycle`
		);
		await addBaseVideoToTimeline({
			filePath: PRIVATE_REAL_RUNTIME_INPUT_VIDEO_PATH,
			page,
		});
		const baseState = await readRestrictedState({ page });
		const projectId = baseState.projectId;
		if (!projectId) throw new Error("Runtime E2E project ID is missing");
		if (trigger === "ui") {
			await addPrivateRealRuntimeWithUi({ page, runtimeCase });
		} else {
			if (!apiPort) throw new Error("CLI add port is missing");
			await addPrivateRealRuntimeWithCli({
				apiPort,
				projectId,
				rootPath: discovery.rootPath,
				runtimeCase,
			});
		}
		await expect
			.poll(
				async () => {
					const state = await readRestrictedState({ page });
					return {
						resources: state.runtimeResources.length,
						stickers: state.stickers.length,
					};
				},
				{ timeout: 120_000 }
			)
			.toEqual({ resources: runtimeCase.resources.length, stickers: 1 });
		const split = await exercisePrivateRealRuntimeSeekAndSplit({
			page,
			runtimeCase,
			trigger,
		});
		await saveCurrentProject({ page });
		await forceTerminateElectronApp({ electronApp: activeApp });
		activeApp = null;

		const reopened = await launchIsolatedQCut({
			apiPort,
			profileDirectory,
			videosDirectory: PRIVATE_REAL_RUNTIME_VIDEOS_DIRECTORY,
		});
		activeApp = reopened.electronApp;
		const reopenedPage = reopened.page;
		await reopenedPage.evaluate((id) => {
			window.location.hash = `#/editor/${id}`;
		}, projectId);
		await expect(
			reopenedPage.locator('[data-testid="timeline-track"]')
		).toBeVisible({ timeout: 60_000 });
		await expect
			.poll(
				async () => {
					const state = await readRestrictedState({ page: reopenedPage });
					return {
						resources: state.runtimeResources.length,
						stickers: state.stickers.length,
					};
				},
				{ timeout: 120_000 }
			)
			.toEqual({ resources: runtimeCase.resources.length, stickers: 2 });
		const reopenedState = await readRestrictedState({ page: reopenedPage });
		assertPrivateRealRuntimeState({
			runtimeCase,
			state: reopenedState,
			stickerCount: 2,
			trigger,
		});
		expect(withoutTransientFileMime({ media: reopenedState.media })).toEqual(
			withoutTransientFileMime({ media: split.state.media })
		);
		expect(
			withoutTransientFileMime({ media: reopenedState.runtimeResources })
		).toEqual(
			withoutTransientFileMime({ media: split.state.runtimeResources })
		);
		const reopenedRightSticker = reopenedState.stickers[1];
		if (!reopenedRightSticker) {
			throw new Error("Reopened split runtime sticker is missing");
		}
		await readPrivateRealRuntimeAt({
			descriptor: split.descriptor,
			page: reopenedPage,
			sticker: reopenedRightSticker,
			timelineTimeSeconds: PRIVATE_REAL_RUNTIME_SPLIT_RIGHT_SAMPLE_SECONDS,
		});
		await exportAndVerifyRuntimeVideo({
			activeApp,
			apiPort,
			descriptor: split.descriptor,
			outputPath,
			page: reopenedPage,
			projectId,
			runtimeCase,
			state: reopenedState,
			testInfo,
			trigger,
		});
		await reopenedPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(
				`${runtimeCase.kind}-${trigger}-after-export.png`
			),
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

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type TestInfo } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { createTestProject, ensureStickersTabActive } from "./electron-helpers";
import {
	DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE,
	type ExportedStickerVideoEvidence,
	exportAndVerifyRealCachedStickerVideo,
	inspectAndVerifyRealCachedStickerVideo,
	REAL_CACHE_STICKER_VIDEO_EVIDENCE_PROFILE,
	type StickerVideoEvidenceProfile,
	verifyBlackStickerBaseVideo,
} from "./exported-sticker-video-evidence";
import { createStickerLabExportBaseVideo } from "./sticker-lab-desktop-fixture";
import {
	addBaseVideoToTimeline,
	buildVideoEvidenceArtifacts,
	forceTerminateElectronApp,
	launchIsolatedQCut,
	readDecodedPreviewImage,
	readRestrictedState,
	readRuntimeCanvasEvidence,
	type RestrictedState,
	saveCurrentProject,
	seekTimeline,
	withoutTransientFileMime,
} from "./sticker-lab-lifecycle-harness";
import {
	REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
	type RealStickerCacheCase,
} from "./sticker-lab-real-cache-cases";

interface CliJsonEnvelope extends Record<string, unknown> {
	data?: Record<string, unknown>;
	jobId?: string;
	status?: string;
}

interface CliExportEvidence {
	apiPort: number;
	envelopes: CliJsonEnvelope[];
	stderr: string;
}

function realCacheEvidenceProfile({
	exportTrigger,
	profileOverride,
}: {
	exportTrigger: RealStickerCacheCase["exportTrigger"];
	profileOverride?: StickerVideoEvidenceProfile;
}): StickerVideoEvidenceProfile {
	const profile = profileOverride ?? REAL_CACHE_STICKER_VIDEO_EVIDENCE_PROFILE;
	if (exportTrigger !== "cli") {
		return profile;
	}
	return {
		...profile,
		maxDimension: 1280,
		minDimension: 720,
	};
}

async function findAvailableEditorApiPort({
	host,
}: {
	host: string;
}): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, host, resolve);
	});
	const address = server.address();
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	if (!address || typeof address === "string") {
		throw new Error("Could not allocate a unique QCut editor API port");
	}
	return address.port;
}

async function waitForEditorApiHealth({
	apiPort,
}: {
	apiPort: number;
}): Promise<void> {
	await expect
		.poll(
			async () => {
				try {
					const response = await fetch(
						`http://127.0.0.1:${apiPort}/api/claude/health`
					);
					return response.ok;
				} catch {
					return false;
				}
			},
			{ intervals: [100, 250, 500], timeout: 30_000 }
		)
		.toBe(true);
}

function parseCliJsonEnvelopes({
	stdout,
}: {
	stdout: string;
}): CliJsonEnvelope[] {
	const documents = stdout
		.trim()
		.split(/(?=^\{)/m)
		.map((document) => document.trim())
		.filter(Boolean);
	if (documents.length === 0) {
		throw new Error(`QCut CLI produced no JSON envelopes: ${stdout}`);
	}
	return documents.map((document) => {
		const parsed: unknown = JSON.parse(document);
		if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
			throw new Error(`QCut CLI emitted a non-object JSON value: ${document}`);
		}
		return parsed as CliJsonEnvelope;
	});
}

function runStickerExportCli({
	apiPort,
	frameRate,
	outputPath,
	projectId,
}: {
	apiPort: number;
	frameRate: number;
	outputPath: string;
	projectId: string;
}): Promise<CliExportEvidence> {
	return new Promise((resolve, reject) => {
		execFile(
			"bun",
			[
				"--silent",
				"run",
				"pipeline",
				"--",
				"editor:export:start",
				"--port",
				String(apiPort),
				"--project-id",
				projectId,
				"--preset",
				"youtube-720p",
				"--format",
				"mp4",
				"--fps",
				String(frameRate),
				"--output",
				outputPath,
				"--poll",
				"--json",
			],
			{
				cwd: process.cwd(),
				env: { ...process.env, QCUT_API_PORT: String(apiPort) },
				maxBuffer: 4 * 1024 * 1024,
				timeout: 240_000,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(
							`QCut CLI Sticker Lab export failed: ${stderr || stdout || error.message}`
						)
					);
					return;
				}
				resolve({
					apiPort,
					envelopes: parseCliJsonEnvelopes({ stdout }),
					stderr,
				});
			}
		);
	});
}

function assertCompletedCliExport({
	evidence,
	outputPath,
	projectId,
}: {
	evidence: CliExportEvidence;
	outputPath: string;
	projectId: string;
}): void {
	const pending = evidence.envelopes.find(
		(envelope) => envelope.status === "pending"
	);
	const completed = evidence.envelopes.at(-1);
	expect(pending).toMatchObject({
		status: "pending",
		jobId: expect.any(String),
	});
	expect(completed).toMatchObject({
		status: "ok",
		data: {
			command: "editor:export:start",
			data: {
				engine: "renderer-muxer",
				jobId: pending?.jobId,
				outputPath,
				projectId,
				status: "completed",
			},
		},
	});
}

function assertRealCachedMedia({
	cacheCase,
	expectFileMime,
	state,
}: {
	cacheCase: RealStickerCacheCase;
	expectFileMime: boolean;
	state: RestrictedState;
}): void {
	const media = state.media[0];
	expect(media).toMatchObject({
		byteSize: cacheCase.byteSize,
		duration: 0,
		height: cacheCase.height,
		name: cacheCase.fileName,
		type: "image",
		width: cacheCase.width,
	});
	if (expectFileMime) expect(media?.mimeType).toBe(cacheCase.mimeType);
	expect(media?.metadata).toMatchObject({
		animatedSticker: cacheCase.animated,
		batchId: cacheCase.batchId,
		checksumSha256: cacheCase.checksumSha256,
		itemId: cacheCase.itemId,
		redistribution: "prohibited",
		referenceOnly: true,
		source: "sticker-lab",
		usage: "internal-reference-only",
	});
	expect(media?.metadata.stickerRuntime).toEqual(
		cacheCase.runtime ?? undefined
	);
	if (!cacheCase.runtime || cacheCase.frameRate === null) return;
	expect(cacheCase.runtime.frames).toHaveLength(cacheCase.frameCount);
	expect(1 / cacheCase.runtime.frames[0].durationSeconds).toBeCloseTo(
		cacheCase.frameRate,
		8
	);
}

async function verifyRealCachedPreviewRuntime({
	cacheCase,
	page,
}: {
	cacheCase: RealStickerCacheCase;
	page: Page;
}): Promise<Record<string, unknown>> {
	if (!cacheCase.runtime) {
		const timelineImage = page
			.getByTestId("preview-capture-surface")
			.getByRole("img", { name: cacheCase.fileName, exact: true });
		return {
			kind: "static-image",
			timelineImage: await readDecodedPreviewImage({
				expectedHeight: cacheCase.height,
				expectedWidth: cacheCase.width,
				previewImage: timelineImage,
			}),
		};
	}

	const canvas = page
		.locator('canvas[data-sticker-runtime-kind="direct-gif"]:visible')
		.first();
	await expect(canvas).toBeVisible();
	await seekTimeline({ page, time: cacheCase.runtimeSeek.initialTimeSeconds });
	await expect(canvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		cacheCase.runtimeSeek.initialFrame
	);
	const first = await readRuntimeCanvasEvidence({ canvas });
	await seekTimeline({ page, time: cacheCase.runtimeSeek.changedTimeSeconds });
	await expect(canvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		cacheCase.runtimeSeek.changedFrame
	);
	const changed = await readRuntimeCanvasEvidence({ canvas });
	await seekTimeline({ page, time: cacheCase.runtimeSeek.initialTimeSeconds });
	await expect(canvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		cacheCase.runtimeSeek.initialFrame
	);
	const returned = await readRuntimeCanvasEvidence({ canvas });

	expect(first).toMatchObject({
		frame: cacheCase.runtimeSeek.initialFrame,
		height: cacheCase.height,
		width: cacheCase.width,
	});
	expect(changed).toMatchObject({
		frame: cacheCase.runtimeSeek.changedFrame,
		height: cacheCase.height,
		width: cacheCase.width,
	});
	expect(returned).toEqual(first);
	expect(changed.pixelHash).not.toBe(first.pixelHash);
	return { changed, first, kind: "direct-gif", returned };
}

export async function runRealCachedStickerExport({
	cacheCase,
	fullRenderBenchmark = false,
	testInfo,
}: {
	cacheCase: RealStickerCacheCase;
	fullRenderBenchmark?: boolean;
	testInfo: TestInfo;
}): Promise<void> {
	if (!REAL_STICKER_CACHE_VIDEOS_DIRECTORY) {
		throw new Error("Real Sticker Lab videos directory is not configured");
	}
	const cleanupRoot = await mkdtemp(
		path.join(tmpdir(), "qcut-real-sticker-cache-e2e-")
	);
	const profileDirectory = path.join(cleanupRoot, "profile");
	const outputPath = path.join(
		cleanupRoot,
		`${cacheCase.itemId}-real-cache-export.mp4`
	);
	const baseVideoPath = path.join(cleanupRoot, "sticker-lab-export-base.mp4");
	const evidenceProfile = realCacheEvidenceProfile({
		exportTrigger: cacheCase.exportTrigger,
		profileOverride: fullRenderBenchmark
			? DEFAULT_STICKER_VIDEO_EVIDENCE_PROFILE
			: undefined,
	});
	const splitLeftSampleSeconds = evidenceProfile.times.splitLeft;
	const splitRightSampleSeconds = evidenceProfile.times.splitRight;
	const splitTimeSeconds =
		(splitLeftSampleSeconds + splitRightSampleSeconds) / 2;
	let activeApp: ElectronApplication | null = null;

	try {
		await mkdir(profileDirectory, { recursive: true });
		await createStickerLabExportBaseVideo({
			durationSeconds: evidenceProfile.durationSeconds,
			filePath: baseVideoPath,
			frameRate: evidenceProfile.frameRate,
		});
		await verifyBlackStickerBaseVideo({
			filePath: baseVideoPath,
			profile: evidenceProfile,
		});
		const firstRun = await launchIsolatedQCut({
			profileDirectory,
			videosDirectory: REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
		});
		activeApp = firstRun.electronApp;
		const firstPage = firstRun.page;
		const cacheDiscoveryEvidence = await firstPage.evaluate(async () => {
			const stickerLab = window.electronAPI?.stickerLab;
			if (!stickerLab)
				throw new Error("Desktop Sticker Lab bridge is unavailable");
			const discovery = await stickerLab.discoverLocalReferences({});
			return {
				rootPath: discovery.rootPath,
				summary: discovery.summary,
				warningCount: discovery.warnings.length,
			};
		});
		expect(cacheDiscoveryEvidence.summary.batchCount).toBeGreaterThanOrEqual(
			18
		);
		expect(cacheDiscoveryEvidence.summary.itemCount).toBeGreaterThanOrEqual(
			2_924
		);
		expect(cacheDiscoveryEvidence.warningCount).toBe(0);
		await createTestProject(
			firstPage,
			`Real Sticker Cache ${cacheCase.itemId} E2E`
		);
		await addBaseVideoToTimeline({ filePath: baseVideoPath, page: firstPage });
		await ensureStickersTabActive(firstPage);
		const labEntry = firstPage.getByTestId("sticker-reference-lab-entry");
		await expect(labEntry).toBeVisible({ timeout: 60_000 });
		await labEntry.getByRole("button", { name: "贴纸实验室" }).click();
		await firstPage
			.getByTestId(`sticker-lab-category-private-${cacheCase.categoryId}`)
			.click();
		const referenceItem = firstPage.locator(
			`[data-sticker-reference-id="${cacheCase.itemId}"]`
		);
		await referenceItem.scrollIntoViewIfNeeded();
		await expect(referenceItem).toBeEnabled({ timeout: 30_000 });
		await expect(referenceItem).toHaveAccessibleName(
			`添加${cacheCase.displayName}到时间线`
		);
		const previewImage = referenceItem.getByRole("img", {
			name: cacheCase.displayName,
			exact: true,
		});
		const previewEvidence = await readDecodedPreviewImage({
			expectedHeight: cacheCase.height,
			expectedWidth: cacheCase.width,
			previewImage,
		});
		await referenceItem.click();
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: firstPage });
				return {
					mediaCount: state.media.length,
					stickerCount: state.stickers.length,
				};
			})
			.toEqual({ mediaCount: 1, stickerCount: 1 });
		await expect(referenceItem).toBeEnabled({ timeout: 30_000 });

		const firstState = await readRestrictedState({ page: firstPage });
		assertRealCachedMedia({
			cacheCase,
			expectFileMime: true,
			state: firstState,
		});
		const runtimeEvidence = await verifyRealCachedPreviewRuntime({
			cacheCase,
			page: firstPage,
		});
		if (!firstState.projectId) {
			throw new Error("Real cached sticker project ID is missing");
		}
		const firstBaseMedia = firstState.allMedia.find(
			(item) => item.name === path.basename(baseVideoPath)
		);
		expect(firstBaseMedia).toBeDefined();
		expect(firstState.mediaElements).toHaveLength(1);
		expect(firstState.mediaElements[0]?.mediaId).toBe(firstBaseMedia?.id);
		expect(firstState.mediaElements[0]?.startTime).toBeCloseTo(0, 6);
		expect(firstState.mediaElements[0]?.duration).toBeCloseTo(
			evidenceProfile.durationSeconds,
			6
		);
		const originalStickerDuration = firstState.stickers[0]?.duration ?? 0;
		expect(originalStickerDuration).toBeGreaterThan(splitTimeSeconds);
		const timelineSticker = firstPage.locator(
			'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
		);
		await expect(timelineSticker).toHaveCount(1);
		await seekTimeline({
			page: firstPage,
			time: splitTimeSeconds,
		});
		await timelineSticker.first().click({ position: { x: 24, y: 12 } });
		await expect(firstPage.getByTestId("split-clip-button")).toBeEnabled();
		await firstPage.getByTestId("split-clip-button").click();
		await expect(timelineSticker).toHaveCount(2);
		if (cacheCase.runtime) {
			const expectedSplitLeftFrame = fullRenderBenchmark
				? cacheCase.runtimeSeek.fullSplitLeftFrame
				: cacheCase.runtimeSeek.splitLeftFrame;
			const expectedSplitRightFrame = fullRenderBenchmark
				? cacheCase.runtimeSeek.fullSplitRightFrame
				: cacheCase.runtimeSeek.splitRightFrame;
			const splitRuntimeCanvas = firstPage
				.locator('canvas[data-sticker-runtime-kind="direct-gif"]:visible')
				.first();
			await seekTimeline({
				page: firstPage,
				time: splitLeftSampleSeconds,
			});
			await expect(splitRuntimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				expectedSplitLeftFrame
			);
			await seekTimeline({
				page: firstPage,
				time: splitRightSampleSeconds,
			});
			await expect(splitRuntimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				expectedSplitRightFrame
			);
		}
		const savedState = await readRestrictedState({ page: firstPage });
		expect(savedState.stickers.map(({ startTime }) => startTime)).toEqual([
			0,
			splitTimeSeconds,
		]);
		expect(
			savedState.stickers.map(({ trimEnd, trimStart }) => [trimStart, trimEnd])
		).toEqual([
			[0, originalStickerDuration - splitTimeSeconds],
			[splitTimeSeconds, 0],
		]);
		expect(new Set(savedState.stickers.map(({ id }) => id)).size).toBe(2);
		for (const sticker of savedState.stickers) {
			expect(
				sticker.duration - sticker.trimStart - sticker.trimEnd
			).toBeGreaterThan(0);
		}
		await saveCurrentProject({ page: firstPage });
		await forceTerminateElectronApp({ electronApp: activeApp });
		activeApp = null;

		const apiPort =
			cacheCase.exportTrigger === "cli"
				? await findAvailableEditorApiPort({ host: "127.0.0.1" })
				: undefined;
		const reopened = await launchIsolatedQCut({
			apiPort,
			profileDirectory,
			videosDirectory: REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
		});
		activeApp = reopened.electronApp;
		const reopenedPage = reopened.page;
		await reopenedPage.evaluate((projectId) => {
			window.location.hash = `#/editor/${projectId}`;
		}, firstState.projectId);
		await expect(
			reopenedPage.locator('[data-testid="timeline-track"]')
		).toBeVisible();
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: reopenedPage });
				return {
					mediaCount: state.media.length,
					stickerCount: state.stickers.length,
				};
			})
			.toEqual({ mediaCount: 1, stickerCount: 2 });
		const reopenedState = await readRestrictedState({ page: reopenedPage });
		expect(withoutTransientFileMime({ media: reopenedState.media })).toEqual(
			withoutTransientFileMime({ media: firstState.media })
		);
		assertRealCachedMedia({
			cacheCase,
			expectFileMime: false,
			state: reopenedState,
		});
		expect(
			reopenedState.stickers.every(
				(sticker) => sticker.mediaId === reopenedState.media[0]?.id
			)
		).toBe(true);
		expect(
			reopenedState.stickers.map(({ startTime, trimEnd, trimStart }) => ({
				startTime,
				trimEnd,
				trimStart,
			}))
		).toEqual(
			savedState.stickers.map(({ startTime, trimEnd, trimStart }) => ({
				startTime,
				trimEnd,
				trimStart,
			}))
		);
		const reopenedBaseMedia = reopenedState.allMedia.find(
			(item) => item.name === path.basename(baseVideoPath)
		);
		if (!(firstBaseMedia && reopenedBaseMedia)) {
			throw new Error("Base export video did not survive project reload");
		}
		expect(withoutTransientFileMime({ media: [reopenedBaseMedia] })).toEqual(
			withoutTransientFileMime({ media: [firstBaseMedia] })
		);
		expect(reopenedState.mediaElements).toHaveLength(1);
		expect(reopenedState.mediaElements[0]?.mediaId).toBe(reopenedBaseMedia?.id);

		const reportContext = {
			cacheDiscoveryEvidence,
			expectedCacheRecord: cacheCase,
			exportTrigger: cacheCase.exportTrigger,
			previewEvidence,
			reopenedStickerCount: reopenedState.stickers.length,
			runtimeEvidence,
			scenario: "real-local-cache",
			evidenceProfile,
			splitTimeSeconds,
		};
		let evidence: ExportedStickerVideoEvidence;
		if (cacheCase.exportTrigger === "cli") {
			if (!apiPort) {
				throw new Error("CLI Sticker Lab export requires a unique API port");
			}
			await rm(outputPath, { force: true });
			await waitForEditorApiHealth({ apiPort });
			const cliEvidence = await runStickerExportCli({
				apiPort,
				frameRate: evidenceProfile.frameRate,
				outputPath,
				projectId: firstState.projectId,
			});
			assertCompletedCliExport({
				evidence: cliEvidence,
				outputPath,
				projectId: firstState.projectId,
			});
			evidence = await inspectAndVerifyRealCachedStickerVideo({
				animated: cacheCase.animated,
				artifacts: buildVideoEvidenceArtifacts({
					prefix: `real-cache-${cacheCase.itemId}-export`,
					reportContext: { ...reportContext, cliEvidence },
					testInfo,
					times: evidenceProfile.times,
				}),
				filePath: outputPath,
				profile: evidenceProfile,
			});
		} else {
			evidence = await exportAndVerifyRealCachedStickerVideo({
				animated: cacheCase.animated,
				artifacts: buildVideoEvidenceArtifacts({
					prefix: `real-cache-${cacheCase.itemId}-export`,
					reportContext,
					testInfo,
					times: evidenceProfile.times,
				}),
				electronApp: activeApp,
				filePath: outputPath,
				page: reopenedPage,
				profile: evidenceProfile,
			});
		}
		expect(evidence.sizeBytes).toBeGreaterThan(1_000);
		await reopenedPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(
				`real-cache-${cacheCase.itemId}-editor-after-export.png`
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

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type TestInfo,
} from "@playwright/test";
import type { ElectronApplication, Locator, Page } from "playwright";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import {
	createTestProject,
	ensureStickersTabActive,
	navigateToProjects,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	type DecodedStickerFrameArtifact,
	type ExportedStickerVideoEvidence,
	exportAndVerifyLocalStickerVideo,
	exportAndVerifyRealCachedStickerVideo,
	inspectAndVerifyRealCachedStickerVideo,
	STICKER_VIDEO_EVIDENCE_TIMES,
	type StickerVideoEvidenceArtifacts,
	verifyBlackStickerBaseVideo,
} from "./helpers/exported-sticker-video-evidence";
import {
	createStickerLabExportBaseVideo,
	createOriginalStickerLabFixture,
	type OriginalStickerLabFixture,
	type StickerLabRuntimeFixtureCase,
} from "./helpers/sticker-lab-desktop-fixture";

const SPLIT_TIME_SECONDS = 2.75;
const SPLIT_LEFT_SAMPLE_SECONDS = SPLIT_TIME_SECONDS - 0.01;
const SPLIT_RIGHT_SAMPLE_SECONDS = SPLIT_TIME_SECONDS + 0.01;
const REAL_STICKER_CACHE_VIDEOS_DIRECTORY =
	process.env.QCUT_REAL_STICKER_LAB_VIDEOS_DIRECTORY;

const REAL_GIF_RUNTIME = {
	canvasSize: { width: 1080, height: 1080 },
	completion: "freeze-last",
	cycleDurationSeconds: 0.78,
	frames: Array.from({ length: 13 }, (_, index) => ({
		delayCentiseconds: 6,
		disposalMethod: 2,
		durationSeconds: 0.06,
		frameRect: { x: 0, y: 0, width: 1080, height: 1080 },
		hasTransparency: true,
		startSeconds: Number((index * 0.06).toFixed(2)),
		transparentColorIndex: 0,
	})),
	kind: "direct-gif",
	repeat: { kind: "infinite" },
} as const;

const REAL_GAME_LIFE_GIF_RUNTIME = {
	canvasSize: { width: 500, height: 500 },
	completion: "freeze-last",
	cycleDurationSeconds: 0.6,
	frames: [
		{
			delayCentiseconds: 20,
			disposalMethod: 1,
			durationSeconds: 0.2,
			frameRect: { x: 0, y: 0, width: 500, height: 500 },
			hasTransparency: true,
			startSeconds: 0,
			transparentColorIndex: 13,
		},
		{
			delayCentiseconds: 20,
			disposalMethod: 1,
			durationSeconds: 0.2,
			frameRect: { x: 270, y: 230, width: 100, height: 40 },
			hasTransparency: true,
			startSeconds: 0.2,
			transparentColorIndex: 13,
		},
		{
			delayCentiseconds: 20,
			disposalMethod: 1,
			durationSeconds: 0.2,
			frameRect: { x: 370, y: 230, width: 90, height: 40 },
			hasTransparency: true,
			startSeconds: 0.4,
			transparentColorIndex: 13,
		},
	],
	kind: "direct-gif",
	repeat: { kind: "infinite" },
} as const;

const REAL_STICKER_CACHE_CASES = [
	{
		animated: true,
		batchId: "jianying-2026-08-22-batch-6-v2",
		byteSize: 245_282,
		categoryId: "10515",
		checksumSha256:
			"4bab1533d972fe17bb8854a0748eef964eacd835db438af04e238094b803bbbd",
		displayName: "综艺风红色指示箭头互动引导",
		exportTrigger: "ui",
		fileName: "7485743630703955224-综艺风红色指示箭头互动引导.gif",
		frameCount: 13,
		frameRate: 16.666666666666668,
		height: 1080,
		itemId: "7485743630703955224",
		mimeType: "image/gif",
		runtime: REAL_GIF_RUNTIME,
		runtimeSeek: {
			changedFrame: "6",
			changedTimeSeconds: 0.37,
			initialFrame: "0",
			initialTimeSeconds: 0.01,
			splitLeftFrame: "6",
			splitRightFrame: "7",
		},
		width: 1080,
	},
	{
		animated: false,
		batchId: "jianying-2026-08-22-batch-6-v2",
		byteSize: 136_239,
		categoryId: "10515",
		checksumSha256:
			"23115cb3757cb9fabfd8a29d39b01d01e586f95d27d7c482353a5204aa2b673a",
		displayName: "害羞表情挡脸",
		exportTrigger: "ui",
		fileName: "7665957139579424024-害羞表情挡脸.png",
		frameCount: 1,
		frameRate: null,
		height: 800,
		itemId: "7665957139579424024",
		mimeType: "image/png",
		runtime: null,
		width: 800,
	},
	{
		animated: true,
		batchId: "jianying-2026-08-22-batch-14-v2",
		byteSize: 5_462,
		categoryId: "10531",
		checksumSha256:
			"e68449e989b3c84204f1291aa80cdf6170c9c68a3a3e60aaf37ea6585df73913",
		displayName: "生命",
		exportTrigger: "cli",
		fileName: "7299844209714924827-生命.gif",
		frameCount: 3,
		frameRate: 5,
		height: 500,
		itemId: "7299844209714924827",
		mimeType: "image/gif",
		runtime: REAL_GAME_LIFE_GIF_RUNTIME,
		runtimeSeek: {
			changedFrame: "1",
			changedTimeSeconds: 0.21,
			initialFrame: "0",
			initialTimeSeconds: 0.01,
			splitLeftFrame: "1",
			splitRightFrame: "1",
		},
		width: 500,
	},
	{
		animated: false,
		batchId: "jianying-2026-08-22-batch-7-v2",
		byteSize: 4_869,
		categoryId: "11443",
		checksumSha256:
			"f4899ee351e4f0c5e84171295586a9b4ca46f129fec044fdd3b0ec5b9ce5dc26",
		displayName: "像素蝴蝶结",
		exportTrigger: "ui",
		fileName: "7197279973323935034-像素蝴蝶结.png",
		frameCount: 1,
		frameRate: null,
		height: 800,
		itemId: "7197279973323935034",
		mimeType: "image/png",
		runtime: null,
		width: 800,
	},
] as const;

type RealStickerCacheCase = (typeof REAL_STICKER_CACHE_CASES)[number];

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
	outputPath,
	projectId,
}: {
	apiPort: number;
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
				"30",
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

interface HarnessMediaItem {
	duration?: number;
	file?: File;
	height?: number;
	id: string;
	metadata?: Record<string, unknown>;
	name: string;
	type: string;
	width?: number;
}

interface HarnessTimelineElement {
	duration: number;
	id: string;
	mediaId?: string;
	startTime: number;
	stickerId?: string;
	trimEnd: number;
	trimStart: number;
	type: string;
}

interface HarnessTimelineTrack {
	elements: HarnessTimelineElement[];
	id: string;
	type: string;
}

interface RuntimePlaybackSample {
	frame: string | null;
	pixel: number[];
	time: number;
}

interface StickerLabHarnessWindow extends Window {
	__exportStore: {
		getState: () => { error: string | null };
	};
	__mediaStore: {
		getState: () => { mediaItems: HarnessMediaItem[] };
	};
	__playbackStore: {
		getState: () => {
			currentTime: number;
			isPlaying: boolean;
			seek: (time: number) => void;
		};
	};
	__projectStore: {
		getState: () => {
			activeProject: { id: string; name: string } | null;
			saveCurrentProject: () => Promise<void>;
		};
	};
	__timelineStore: {
		getState: () => { tracks: HarnessTimelineTrack[] };
	};
	__stickerRuntimePlaybackProbe?: {
		animatedFrame: RuntimePlaybackSample | null;
		cleanup: () => void;
		done: Promise<RuntimePlaybackSample | null>;
		firstUpdateTime: number | null;
		lastUpdateTime: number | null;
		seekCount: number;
		updateCount: number;
	};
}

interface PersistedMediaState {
	byteSize: number | null;
	duration: number | null;
	height: number | null;
	id: string;
	metadata: Record<string, unknown>;
	mimeType: string | null;
	name: string;
	type: string;
	width: number | null;
}

interface DecodedPreviewImageEvidence {
	complete: boolean;
	decoded: boolean;
	height: number;
	source: string;
	width: number;
}

interface RuntimeCanvasEvidence {
	frame: string | null;
	pixelHash: string;
	height: number;
	width: number;
}

interface RestrictedState {
	allMedia: PersistedMediaState[];
	media: PersistedMediaState[];
	mediaElements: HarnessTimelineElement[];
	projectId: string | null;
	runtimeResources: PersistedMediaState[];
	stickers: HarnessTimelineElement[];
}

function withoutTransientFileMime({
	media,
}: {
	media: PersistedMediaState[];
}): Omit<PersistedMediaState, "mimeType">[] {
	return media.map(({ mimeType: _mimeType, ...item }) => item);
}

async function launchIsolatedQCut({
	apiPort,
	profileDirectory,
	videosDirectory,
}: {
	apiPort?: number;
	profileDirectory: string;
	videosDirectory: string;
}): Promise<{ electronApp: ElectronApplication; page: Page }> {
	const electronApp = await electron.launch({
		args: [`--user-data-dir=${profileDirectory}`, "dist/electron/main.js"],
		cwd: process.cwd(),
		env: {
			...process.env,
			ELECTRON_DISABLE_GPU: "1",
			NODE_ENV: "test",
			...(apiPort ? { QCUT_API_PORT: String(apiPort) } : {}),
		},
	});
	try {
		await electronApp.evaluate(({ app }, testVideosDirectory) => {
			app.setPath("videos", testVideosDirectory);
		}, videosDirectory);
		const page = await electronApp.firstWindow();
		await page.waitForLoadState("domcontentloaded");
		await page.waitForFunction(
			() => Boolean(document.querySelector("#root")?.children.length),
			undefined,
			{ timeout: 30_000 }
		);
		await page.evaluate(() =>
			localStorage.setItem("hasSeenOnboarding", "true")
		);
		await navigateToProjects(page);
		return { electronApp, page };
	} catch (error) {
		if (electronApp.process().exitCode === null) {
			await forceTerminateElectronApp({ electronApp }).catch(() => undefined);
		}
		throw error;
	}
}

async function forceTerminateElectronApp({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<void> {
	if (electronApp.process().exitCode !== null) return;
	const closed = electronApp.waitForEvent("close", { timeout: 10_000 });
	// QCut's macOS utility processes can keep app.quit pending during E2E teardown.
	try {
		electronApp.process().kill("SIGKILL");
	} catch (error) {
		if (electronApp.process().exitCode === null) throw error;
	}
	await closed;
}

async function readDecodedPreviewImage({
	expectedHeight,
	expectedWidth,
	previewImage,
}: {
	expectedHeight: number;
	expectedWidth: number;
	previewImage: Locator;
}): Promise<DecodedPreviewImageEvidence> {
	await expect(previewImage).toBeVisible();
	await expect
		.poll(
			() =>
				previewImage.evaluate(async (element) => {
					const image = element as HTMLImageElement;
					let decoded = false;
					try {
						await image.decode();
						decoded = true;
					} catch {
						decoded = false;
					}
					return {
						complete: image.complete,
						decoded,
						height: image.naturalHeight,
						width: image.naturalWidth,
					};
				}),
			{ timeout: 30_000, intervals: [100, 250, 500] }
		)
		.toEqual({
			complete: true,
			decoded: true,
			height: expectedHeight,
			width: expectedWidth,
		});
	const source = await previewImage.evaluate(
		(element) => (element as HTMLImageElement).currentSrc
	);
	expect(source).toMatch(/^blob:/);
	return {
		complete: true,
		decoded: true,
		height: expectedHeight,
		source,
		width: expectedWidth,
	};
}

async function readRuntimeCanvasEvidence({
	canvas,
}: {
	canvas: Locator;
}): Promise<RuntimeCanvasEvidence> {
	return canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error("Sticker runtime output is not a canvas");
		}
		const context = element.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Sticker runtime canvas is unavailable");
		const pixels = context.getImageData(
			0,
			0,
			element.width,
			element.height
		).data;
		let hash = 2_166_136_261;
		for (const value of pixels) {
			hash ^= value;
			hash = Math.imul(hash, 16_777_619);
		}
		return {
			frame: element.getAttribute("data-sticker-runtime-frame"),
			height: element.height,
			pixelHash: (hash >>> 0).toString(16).padStart(8, "0"),
			width: element.width,
		};
	});
}

function buildVideoEvidenceArtifacts({
	prefix,
	reportContext,
	testInfo,
}: {
	prefix: string;
	reportContext: Record<string, unknown>;
	testInfo: TestInfo;
}): StickerVideoEvidenceArtifacts {
	const decodedFrames: DecodedStickerFrameArtifact[] = [
		["before-split", STICKER_VIDEO_EVIDENCE_TIMES.splitLeft],
		["after-split", STICKER_VIDEO_EVIDENCE_TIMES.splitRight],
		["beyond-split", STICKER_VIDEO_EVIDENCE_TIMES.postSplit],
		["near-end", STICKER_VIDEO_EVIDENCE_TIMES.nearEnd],
	].map(([label, timeSeconds]) => ({
		filePath: testInfo.outputPath(`${prefix}-decoded-${label}.png`),
		label: String(label),
		timeSeconds: Number(timeSeconds),
	}));
	return {
		decodedFrames,
		reportContext,
		reportPath: testInfo.outputPath(`${prefix}-video-evidence.json`),
	};
}

async function readRestrictedState({
	page,
}: {
	page: Page;
}): Promise<RestrictedState> {
	return page.evaluate(() => {
		const harness = window as StickerLabHarnessWindow;
		const persistedMedia = harness.__mediaStore
			.getState()
			.mediaItems.map((item) => ({
				byteSize: item.file?.size ?? null,
				duration: item.duration ?? null,
				height: item.height ?? null,
				id: item.id,
				metadata: item.metadata ?? {},
				mimeType: item.file?.type ?? null,
				name: item.name,
				type: item.type,
				width: item.width ?? null,
			}));
		const media = persistedMedia
			.filter((item) => item.metadata.source === "sticker-lab")
			.sort((left, right) => left.id.localeCompare(right.id));
		const runtimeResources = persistedMedia
			.filter((item) => item.metadata.source === "sticker-runtime-resource")
			.sort((left, right) =>
				String(left.metadata.stickerRuntimeResourceName).localeCompare(
					String(right.metadata.stickerRuntimeResourceName)
				)
			);
		const stickers = harness.__timelineStore
			.getState()
			.tracks.filter((track) => track.type === "sticker")
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "sticker")
			.sort((left, right) => left.startTime - right.startTime);
		const mediaElements = harness.__timelineStore
			.getState()
			.tracks.filter((track) => track.type === "media")
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "media")
			.sort((left, right) => left.startTime - right.startTime);
		return {
			allMedia: persistedMedia.sort((left, right) =>
				left.id.localeCompare(right.id)
			),
			media,
			mediaElements,
			projectId: harness.__projectStore.getState().activeProject?.id ?? null,
			runtimeResources,
			stickers,
		};
	});
}

async function saveCurrentProject({ page }: { page: Page }): Promise<void> {
	await page.evaluate(async () => {
		await (window as StickerLabHarnessWindow).__projectStore
			.getState()
			.saveCurrentProject();
	});
}

async function addBaseVideoToTimeline({
	filePath,
	page,
}: {
	filePath: string;
	page: Page;
}): Promise<void> {
	await uploadTestMedia(page, filePath);
	const mediaItem = page
		.locator('[data-testid="media-item"]')
		.filter({ hasText: path.basename(filePath) })
		.first();
	const mediaTrack = page
		.locator('[data-testid="timeline-track"][data-track-type="media"]')
		.first();
	await expect(mediaItem).toBeVisible();
	await expect(mediaTrack).toBeVisible();
	await mediaItem.dragTo(mediaTrack, {
		targetPosition: { x: 8, y: 12 },
	});
	await expect(
		mediaTrack.locator('[data-testid="timeline-element"]')
	).toHaveCount(1);
}

async function readRuntimeCanvasPixel({
	canvas,
	x = 4,
	y = 4,
}: {
	canvas: Locator;
	x?: number;
	y?: number;
}): Promise<number[]> {
	return canvas.evaluate(
		(element, sample) => {
			if (!(element instanceof HTMLCanvasElement)) {
				throw new Error("Sticker runtime output is not a canvas");
			}
			const context = element.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Sticker runtime canvas is unavailable");
			return Array.from(context.getImageData(sample.x, sample.y, 1, 1).data);
		},
		{ x, y }
	);
}

async function seekTimeline({
	page,
	time,
}: {
	page: Page;
	time: number;
}): Promise<void> {
	await page.evaluate((nextTime) => {
		(window as StickerLabHarnessWindow).__playbackStore
			.getState()
			.seek(nextTime);
	}, time);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as StickerLabHarnessWindow).__playbackStore.getState()
						.currentTime
			)
		)
		.toBeCloseTo(time, 3);
}

function isExpectedColor({
	color,
	pixel,
}: {
	color: "blue" | "red";
	pixel: number[];
}): boolean {
	const [red = 0, green = 0, blue = 0, alpha = 0] = pixel;
	if (alpha < 220) return false;
	if (color === "red") {
		return red > 150 && red > green * 1.45 && red > blue * 1.45;
	}
	return blue > 130 && blue > red * 1.45 && blue > green * 1.2;
}

async function expectRuntimeColor({
	canvas,
	color,
}: {
	canvas: Locator;
	color: "blue" | "red";
}): Promise<void> {
	await expect(canvas).toBeVisible();
	await expect
		.poll(async () =>
			isExpectedColor({
				color,
				pixel: await readRuntimeCanvasPixel({ canvas }),
			})
		)
		.toBe(true);
	expect(await canvas.getAttribute("data-sticker-runtime-error")).toBeNull();
}

async function expectAlphaVideoMask({
	canvas,
}: {
	canvas: Locator;
}): Promise<void> {
	await expect(canvas).toBeVisible();
	await expect
		.poll(async () => {
			const topPixel = await readRuntimeCanvasPixel({ canvas, x: 4, y: 4 });
			const bottomPixel = await readRuntimeCanvasPixel({ canvas, x: 4, y: 60 });
			return {
				bottomTransparent: (bottomPixel[3] ?? 255) < 35,
				topOpaque: (topPixel[3] ?? 0) > 220,
			};
		})
		.toEqual({ bottomTransparent: true, topOpaque: true });
}

async function expectRuntimeMaskIfNeeded({
	canvas,
	runtimeCase,
}: {
	canvas: Locator;
	runtimeCase: StickerLabRuntimeFixtureCase;
}): Promise<void> {
	if (runtimeCase.kind !== "alpha-video") return;
	await expectAlphaVideoMask({ canvas });
}

async function expectContinuousRuntimePlayback({
	canvas,
	page,
	runtimeCase,
}: {
	canvas: Locator;
	page: Page;
	runtimeCase: StickerLabRuntimeFixtureCase;
}): Promise<void> {
	const startTime = 0.1;
	await expectRuntimeFrameAt({
		canvas,
		color: "red",
		frameTimeSeconds: startTime,
		page,
		runtimeCase,
		timelineTimeSeconds: startTime,
	});
	await canvas.evaluate((element, kind) => {
		const harness = window as StickerLabHarnessWindow;
		harness.__stickerRuntimePlaybackProbe?.cleanup();
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error(`Sticker runtime canvas ${kind} is missing`);
		}
		const runtimeCanvas = element;
		let resolveDone: (sample: RuntimePlaybackSample | null) => void = () =>
			undefined;
		const done = new Promise<RuntimePlaybackSample | null>((resolve) => {
			resolveDone = resolve;
		});
		const timeout = window.setTimeout(() => resolveDone(null), 10_000);
		const probe = {
			animatedFrame: null as RuntimePlaybackSample | null,
			cleanup: () => undefined,
			done,
			firstUpdateTime: null as number | null,
			lastUpdateTime: null as number | null,
			seekCount: 0,
			updateCount: 0,
		};
		const handleUpdate = (event: Event) => {
			const time = (event as CustomEvent<{ time: number }>).detail.time;
			probe.firstUpdateTime ??= time;
			probe.lastUpdateTime = time;
			probe.updateCount += 1;
			if (probe.animatedFrame || time < 0.65 || time >= 2.5) return;
			const frame = runtimeCanvas.getAttribute("data-sticker-runtime-frame");
			const frameIsBlue =
				kind === "alpha-video" ? Number(frame) >= 0.5 : frame === "1";
			if (!frameIsBlue) return;
			const context = runtimeCanvas.getContext("2d", {
				willReadFrequently: true,
			});
			if (!context) return;
			const pixel = Array.from(context.getImageData(4, 4, 1, 1).data);
			const sample = { frame, pixel, time };
			probe.animatedFrame = sample;
			resolveDone(sample);
		};
		const handleSeek = () => {
			probe.seekCount += 1;
		};
		probe.cleanup = () => {
			window.clearTimeout(timeout);
			window.removeEventListener("playback-update", handleUpdate);
			window.removeEventListener("playback-seek", handleSeek);
		};
		window.addEventListener("playback-update", handleUpdate);
		window.addEventListener("playback-seek", handleSeek);
		harness.__stickerRuntimePlaybackProbe = probe;
	}, runtimeCase.kind);

	await page.getByTestId("preview-play-button").click();
	await expect(page.getByTestId("preview-pause-button")).toBeVisible();
	await expect(page.getByTestId("preview-capture-surface")).toHaveAttribute(
		"data-smooth-time-reason",
		"none"
	);
	const playbackProof = await page.evaluate(async () => {
		const harness = window as StickerLabHarnessWindow;
		const probe = harness.__stickerRuntimePlaybackProbe;
		if (!probe) throw new Error("Sticker runtime playback probe is missing");
		const animatedFrame = await probe.done;
		return {
			animatedFrame,
			isPlaying: harness.__playbackStore.getState().isPlaying,
			lastUpdateTime: probe.lastUpdateTime,
		};
	});
	if (!playbackProof.animatedFrame) {
		throw new Error(
			`Sticker runtime did not animate during playback: ${JSON.stringify(playbackProof)}`
		);
	}
	expect(playbackProof.isPlaying).toBe(true);
	expect(playbackProof.animatedFrame.time).toBeGreaterThanOrEqual(0.65);
	expect(playbackProof.animatedFrame.time).toBeLessThan(2.5);
	expect(
		isExpectedColor({
			color: "blue",
			pixel: playbackProof.animatedFrame.pixel,
		})
	).toBe(true);
	await expectRuntimeMaskIfNeeded({ canvas, runtimeCase });
	await page.getByTestId("preview-pause-button").click({ timeout: 2_000 });
	await expect(page.getByTestId("preview-play-button")).toBeVisible();

	const result = await page.evaluate(() => {
		const harness = window as StickerLabHarnessWindow;
		const probe = harness.__stickerRuntimePlaybackProbe;
		if (!probe) throw new Error("Sticker runtime playback probe is missing");
		probe.cleanup();
		const state = harness.__playbackStore.getState();
		const snapshot = {
			currentTime: state.currentTime,
			firstUpdateTime: probe.firstUpdateTime,
			isPlaying: state.isPlaying,
			lastUpdateTime: probe.lastUpdateTime,
			seekCount: probe.seekCount,
			updateCount: probe.updateCount,
		};
		harness.__stickerRuntimePlaybackProbe = undefined;
		return snapshot;
	});
	expect(result.isPlaying).toBe(false);
	expect(result.seekCount).toBe(0);
	expect(result.updateCount).toBeGreaterThan(2);
	expect(result.firstUpdateTime).not.toBeNull();
	expect(result.lastUpdateTime).not.toBeNull();
	expect(
		(result.lastUpdateTime ?? 0) - (result.firstUpdateTime ?? 0)
	).toBeGreaterThan(0.4);
	expect(result.currentTime).toBeGreaterThanOrEqual(0.65);
	expect(await canvas.getAttribute("data-sticker-runtime-error")).toBeNull();
}

function normalizedRuntimeDescriptor({
	runtimeCase,
}: {
	runtimeCase: StickerLabRuntimeFixtureCase;
}): StickerRuntimeDescriptor {
	const descriptor = runtimeCase.runtimeDescriptor;
	const persistedSource = ({
		resourceName,
	}: {
		resourceName: string;
	}): string => {
		const index = runtimeCase.resourceNames.indexOf(resourceName);
		if (index < 0) throw new Error(`Unknown fixture resource: ${resourceName}`);
		return `$resource:asset_${String(index + 1).padStart(4, "0")}`;
	};
	switch (descriptor.kind) {
		case "direct-gif":
			return descriptor;
		case "atlas-animation":
			return {
				...descriptor,
				atlasSource: descriptor.atlasSource
					? persistedSource({ resourceName: descriptor.atlasSource })
					: descriptor.atlasSource,
			};
		case "png-sequence":
			return {
				...descriptor,
				frames: descriptor.frames.map((frame) => ({
					...frame,
					source: persistedSource({ resourceName: frame.source }),
				})),
			};
		case "alpha-video":
			return {
				...descriptor,
				source: persistedSource({ resourceName: descriptor.source }),
				layout:
					descriptor.layout.kind === "separate-mask"
						? {
								...descriptor.layout,
								maskSource: persistedSource({
									resourceName: descriptor.layout.maskSource,
								}),
							}
						: descriptor.layout,
			};
		default: {
			const unsupported: never = descriptor;
			throw new Error(
				`Unsupported Sticker Lab fixture: ${String(unsupported)}`
			);
		}
	}
}

function expectedFrameLabel({
	kind,
	timeSeconds,
}: {
	kind: StickerLabRuntimeFixtureCase["kind"];
	timeSeconds: number;
}): string {
	if (kind === "alpha-video") return timeSeconds.toFixed(6);
	if (kind === "direct-gif") return timeSeconds < 0.2 ? "0" : "1";
	return timeSeconds < 0.5 ? "0" : "1";
}

async function expectRuntimeFrameAt({
	canvas,
	color,
	frameTimeSeconds,
	page,
	runtimeCase,
	timelineTimeSeconds,
}: {
	canvas: Locator;
	color: "blue" | "red";
	frameTimeSeconds: number;
	page: Page;
	runtimeCase: StickerLabRuntimeFixtureCase;
	timelineTimeSeconds: number;
}): Promise<void> {
	await seekTimeline({ page, time: timelineTimeSeconds });
	await expect(canvas).toBeVisible();
	await expect(canvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		expectedFrameLabel({
			kind: runtimeCase.kind,
			timeSeconds: frameTimeSeconds,
		})
	);
	await expectRuntimeColor({ canvas, color });
	await expectRuntimeMaskIfNeeded({ canvas, runtimeCase });
}

function assertRuntimeResources({
	batchId,
	runtimeCase,
	state,
}: {
	batchId: string;
	runtimeCase: StickerLabRuntimeFixtureCase;
	state: RestrictedState;
}): void {
	expect(state.runtimeResources).toHaveLength(runtimeCase.resourceNames.length);
	const primaryMetadata = state.media[0]?.metadata;
	const resourceMediaIds = primaryMetadata?.stickerRuntimeResources;
	if (
		typeof resourceMediaIds !== "object" ||
		resourceMediaIds === null ||
		Array.isArray(resourceMediaIds)
	) {
		if (runtimeCase.resourceNames.length === 0) return;
		throw new Error("Sticker runtime resource map is missing");
	}
	// asset_XXXX order is shared by descriptor normalization and persistence.
	for (const [index, resourceName] of runtimeCase.resourceNames.entries()) {
		const persistedName = `asset_${String(index + 1).padStart(4, "0")}`;
		const resource = state.runtimeResources[index];
		expect(resource?.metadata).toMatchObject({
			batchId,
			itemId: runtimeCase.stickerId,
			redistribution: "prohibited",
			referenceOnly: true,
			source: "sticker-runtime-resource",
			stickerRuntimeResourceName: persistedName,
			stickerRuntimeSourceUrl: resourceName,
			usage: "internal-reference-only",
		});
		expect(resource?.id).toBe(
			(resourceMediaIds as Record<string, unknown>)[persistedName]
		);
	}
}

async function selectStickerLabCard({
	page,
	runtimeCase,
}: {
	page: Page;
	runtimeCase: StickerLabRuntimeFixtureCase;
}): Promise<void> {
	const labEntry = page.getByTestId("sticker-reference-lab-entry");
	await expect(labEntry).toBeVisible();
	await labEntry.getByRole("button", { name: "贴纸实验室" }).click();
	const category = page.getByTestId(
		`sticker-lab-category-private-${runtimeCase.categoryId}`
	);
	await expect(category).toBeVisible();
	await category.click();
	await expect(page.getByTestId("sticker-lab-reference-policy")).toContainText(
		"禁止二次分发"
	);

	const referenceItem = page.locator(
		`[data-sticker-reference-id="${runtimeCase.stickerId}"]`
	);
	await expect(referenceItem).toBeEnabled({ timeout: 30_000 });
	await expect(referenceItem).toHaveAccessibleName(
		`添加${runtimeCase.displayName}到时间线`
	);
	const previewImage = referenceItem.getByRole("img", {
		name: runtimeCase.displayName,
		exact: true,
	});
	await readDecodedPreviewImage({
		expectedHeight: runtimeCase.previewHeight,
		expectedWidth: runtimeCase.previewWidth,
		previewImage,
	});
	await referenceItem.click();
}

async function runRestrictedStickerLifecycle({
	fixture,
	runtimeCase,
	testInfo,
}: {
	fixture: OriginalStickerLabFixture;
	runtimeCase: StickerLabRuntimeFixtureCase;
	testInfo: TestInfo;
}): Promise<void> {
	const testSlug = runtimeCase.kind.replaceAll("-", "_");
	const profileDirectory = path.join(
		fixture.cleanupRoot,
		`profile-${testSlug}`
	);
	const outputPath = path.join(
		fixture.cleanupRoot,
		`${testSlug}-local-sticker-export.mp4`
	);
	await mkdir(profileDirectory, { recursive: true });
	let activeApp: ElectronApplication | null = null;

	try {
		const firstRun = await launchIsolatedQCut({
			profileDirectory,
			videosDirectory: fixture.videosDirectory,
		});
		activeApp = firstRun.electronApp;
		const firstPage = firstRun.page;
		await createTestProject(
			firstPage,
			`Restricted Sticker Lab ${runtimeCase.kind} E2E`
		);
		await ensureStickersTabActive(firstPage);
		await selectStickerLabCard({ page: firstPage, runtimeCase });
		await expect
			.poll(async () => {
				const state = await readRestrictedState({ page: firstPage });
				return {
					mediaCount: state.media.length,
					resourceCount: state.runtimeResources.length,
					stickerCount: state.stickers.length,
				};
			})
			.toEqual({
				mediaCount: 1,
				resourceCount: runtimeCase.resourceNames.length,
				stickerCount: 1,
			});

		let state = await readRestrictedState({ page: firstPage });
		expect(state.media[0]?.name).toBe(runtimeCase.primaryFileName);
		expect(state.media[0]?.metadata).toMatchObject({
			animatedSticker: true,
			batchId: fixture.batchId,
			itemId: runtimeCase.stickerId,
			redistribution: "prohibited",
			referenceOnly: true,
			source: "sticker-lab",
			stickerRuntime: { kind: runtimeCase.kind, cycleDurationSeconds: 1 },
			usage: "internal-reference-only",
		});
		if (runtimeCase.kind === "direct-gif") {
			expect(state.media[0]?.metadata.stickerRuntime).toMatchObject({
				kind: "direct-gif",
				cycleDurationSeconds: 1,
				frames: [
					{ startSeconds: 0, durationSeconds: 0.2 },
					{ startSeconds: 0.2, durationSeconds: 0.8 },
				],
			});
		} else {
			expect(state.media[0]?.metadata.stickerRuntime).toEqual(
				normalizedRuntimeDescriptor({ runtimeCase })
			);
		}
		assertRuntimeResources({
			batchId: fixture.batchId,
			runtimeCase,
			state,
		});
		expect(state.stickers[0]?.mediaId).toBe(state.media[0]?.id);
		const originalStickerDuration = state.stickers[0]?.duration;
		if (
			originalStickerDuration === undefined ||
			originalStickerDuration <= SPLIT_TIME_SECONDS
		) {
			throw new Error("Sticker is too short for the split continuity check");
		}

		const timelineSticker = firstPage.locator(
			'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
		);
		await expect(timelineSticker).toHaveCount(1);
		const runtimeCanvas = firstPage.locator(
			`canvas[data-sticker-runtime-kind="${runtimeCase.kind}"]:visible`
		);
		await expectContinuousRuntimePlayback({
			canvas: runtimeCanvas,
			page: firstPage,
			runtimeCase,
		});
		await firstPage.screenshot({
			animations: "allow",
			path: testInfo.outputPath(`00-${testSlug}-continuous-playback-blue.png`),
		});
		const redSampleTime = runtimeCase.kind === "direct-gif" ? 0.1 : 0.25;
		const blueSampleTime = 0.75;
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "red",
			frameTimeSeconds: redSampleTime,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: redSampleTime,
		});
		if (runtimeCase.kind === "direct-gif") {
			await expectRuntimeFrameAt({
				canvas: runtimeCanvas,
				color: "red",
				frameTimeSeconds: 0.19,
				page: firstPage,
				runtimeCase,
				timelineTimeSeconds: 0.19,
			});
			await expectRuntimeFrameAt({
				canvas: runtimeCanvas,
				color: "blue",
				frameTimeSeconds: 0.21,
				page: firstPage,
				runtimeCase,
				timelineTimeSeconds: 0.21,
			});
		}
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "blue",
			frameTimeSeconds: blueSampleTime,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: blueSampleTime,
		});
		await firstPage.screenshot({
			animations: "allow",
			path: testInfo.outputPath(`01-${testSlug}-runtime-blue.png`),
		});

		await seekTimeline({ page: firstPage, time: SPLIT_TIME_SECONDS });
		await timelineSticker.first().click({ position: { x: 24, y: 12 } });
		await expect(firstPage.getByTestId("split-clip-button")).toBeEnabled();
		await firstPage.getByTestId("split-clip-button").click();
		await expect(timelineSticker).toHaveCount(2);
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "blue",
			frameTimeSeconds: SPLIT_LEFT_SAMPLE_SECONDS % 1,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: SPLIT_LEFT_SAMPLE_SECONDS,
		});
		await expectRuntimeFrameAt({
			canvas: runtimeCanvas,
			color: "blue",
			frameTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS % 1,
			page: firstPage,
			runtimeCase,
			timelineTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS,
		});
		state = await readRestrictedState({ page: firstPage });
		expect(state.stickers.map(({ startTime }) => startTime)).toEqual([
			0,
			SPLIT_TIME_SECONDS,
		]);
		expect(
			state.stickers.map(({ trimStart, trimEnd }) => [trimStart, trimEnd])
		).toEqual([
			[0, originalStickerDuration - SPLIT_TIME_SECONDS],
			[SPLIT_TIME_SECONDS, 0],
		]);
		const [leftSticker, rightSticker] = state.stickers;
		expect(
			(leftSticker?.duration ?? 0) -
				(leftSticker?.trimStart ?? 0) -
				(leftSticker?.trimEnd ?? 0)
		).toBeCloseTo(SPLIT_TIME_SECONDS, 6);
		expect(
			(rightSticker?.duration ?? 0) -
				(rightSticker?.trimStart ?? 0) -
				(rightSticker?.trimEnd ?? 0)
		).toBeCloseTo(originalStickerDuration - SPLIT_TIME_SECONDS, 6);
		expect(new Set(state.stickers.map(({ stickerId }) => stickerId)).size).toBe(
			2
		);
		await firstPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(`02-${testSlug}-split-timeline.png`),
		});

		await saveCurrentProject({ page: firstPage });
		await forceTerminateElectronApp({ electronApp: activeApp });
		activeApp = null;

		const reopened = await launchIsolatedQCut({
			profileDirectory,
			videosDirectory: fixture.videosDirectory,
		});
		activeApp = reopened.electronApp;
		const reopenedPage = reopened.page;
		if (!state.projectId) throw new Error("Sticker Lab project ID is missing");
		await reopenedPage.evaluate((projectId) => {
			window.location.hash = `#/editor/${projectId}`;
		}, state.projectId);
		await expect(
			reopenedPage.locator('[data-testid="timeline-track"]')
		).toBeVisible();
		const reopenedRuntimeCanvas = reopenedPage.locator(
			`canvas[data-sticker-runtime-kind="${runtimeCase.kind}"]:visible`
		);
		await expectRuntimeFrameAt({
			canvas: reopenedRuntimeCanvas,
			color: "blue",
			frameTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS % 1,
			page: reopenedPage,
			runtimeCase,
			timelineTimeSeconds: SPLIT_RIGHT_SAMPLE_SECONDS,
		});
		const reopenedState = await readRestrictedState({ page: reopenedPage });
		expect(withoutTransientFileMime({ media: reopenedState.media })).toEqual(
			withoutTransientFileMime({ media: state.media })
		);
		expect(
			withoutTransientFileMime({ media: reopenedState.runtimeResources })
		).toEqual(withoutTransientFileMime({ media: state.runtimeResources }));
		expect(reopenedState.stickers).toHaveLength(2);
		expect(
			reopenedState.stickers.map(({ startTime, trimEnd, trimStart }) => ({
				startTime,
				trimEnd,
				trimStart,
			}))
		).toEqual(
			state.stickers.map(({ startTime, trimEnd, trimStart }) => ({
				startTime,
				trimEnd,
				trimStart,
			}))
		);
		assertRuntimeResources({
			batchId: fixture.batchId,
			runtimeCase,
			state: reopenedState,
		});

		const videoEvidence = await exportAndVerifyLocalStickerVideo({
			artifacts: buildVideoEvidenceArtifacts({
				prefix: `${testSlug}-export`,
				reportContext: {
					reopenedStickerCount: reopenedState.stickers.length,
					runtimeKind: runtimeCase.kind,
					scenario: "synthetic-runtime",
					splitTimeSeconds: SPLIT_TIME_SECONDS,
				},
				testInfo,
			}),
			electronApp: activeApp,
			filePath: outputPath,
			page: reopenedPage,
		});
		expect(videoEvidence.sizeBytes).toBeGreaterThan(1_000);
		expect(
			await reopenedPage.evaluate(
				() => (window as StickerLabHarnessWindow).__exportStore.getState().error
			)
		).toBeNull();
		await reopenedPage.screenshot({
			animations: "disabled",
			path: testInfo.outputPath(`03-${testSlug}-editor-after-export.png`),
		});
	} finally {
		try {
			if (activeApp?.process().exitCode === null) {
				await forceTerminateElectronApp({ electronApp: activeApp });
			}
		} finally {
			await Promise.all([
				rm(outputPath, { force: true }),
				rm(profileDirectory, { recursive: true, force: true }),
			]);
		}
	}
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

async function runRealCachedStickerExport({
	cacheCase,
	testInfo,
}: {
	cacheCase: RealStickerCacheCase;
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
	let activeApp: ElectronApplication | null = null;

	try {
		await mkdir(profileDirectory, { recursive: true });
		await createStickerLabExportBaseVideo({ filePath: baseVideoPath });
		await verifyBlackStickerBaseVideo({ filePath: baseVideoPath });
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
		expect(firstState.mediaElements[0]?.duration).toBeCloseTo(5, 6);
		const originalStickerDuration = firstState.stickers[0]?.duration ?? 0;
		expect(originalStickerDuration).toBeGreaterThan(SPLIT_TIME_SECONDS);
		const timelineSticker = firstPage.locator(
			'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
		);
		await expect(timelineSticker).toHaveCount(1);
		await seekTimeline({ page: firstPage, time: SPLIT_TIME_SECONDS });
		await timelineSticker.first().click({ position: { x: 24, y: 12 } });
		await expect(firstPage.getByTestId("split-clip-button")).toBeEnabled();
		await firstPage.getByTestId("split-clip-button").click();
		await expect(timelineSticker).toHaveCount(2);
		if (cacheCase.runtime) {
			const splitRuntimeCanvas = firstPage
				.locator('canvas[data-sticker-runtime-kind="direct-gif"]:visible')
				.first();
			await seekTimeline({ page: firstPage, time: SPLIT_LEFT_SAMPLE_SECONDS });
			await expect(splitRuntimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				cacheCase.runtimeSeek.splitLeftFrame
			);
			await seekTimeline({ page: firstPage, time: SPLIT_RIGHT_SAMPLE_SECONDS });
			await expect(splitRuntimeCanvas).toHaveAttribute(
				"data-sticker-runtime-frame",
				cacheCase.runtimeSeek.splitRightFrame
			);
		}
		const savedState = await readRestrictedState({ page: firstPage });
		expect(savedState.stickers.map(({ startTime }) => startTime)).toEqual([
			0,
			SPLIT_TIME_SECONDS,
		]);
		expect(
			savedState.stickers.map(({ trimEnd, trimStart }) => [trimStart, trimEnd])
		).toEqual([
			[0, originalStickerDuration - SPLIT_TIME_SECONDS],
			[SPLIT_TIME_SECONDS, 0],
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
			splitTimeSeconds: SPLIT_TIME_SECONDS,
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
				}),
				filePath: outputPath,
			});
		} else {
			evidence = await exportAndVerifyRealCachedStickerVideo({
				animated: cacheCase.animated,
				artifacts: buildVideoEvidenceArtifacts({
					prefix: `real-cache-${cacheCase.itemId}-export`,
					reportContext,
					testInfo,
				}),
				electronApp: activeApp,
				filePath: outputPath,
				page: reopenedPage,
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

test.describe("Sticker Lab local video lifecycle", () => {
	let fixture: OriginalStickerLabFixture;

	test.beforeAll(async () => {
		fixture = await createOriginalStickerLabFixture();
	});

	test.afterAll(async () => {
		if (fixture) {
			await rm(fixture.cleanupRoot, { recursive: true, force: true });
		}
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Direct GIF previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.directGif,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Atlas previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.atlas,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("PNG sequence previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.pngSequence,
			testInfo,
		});
	});

	// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
	test("Alpha Video previews, adds, splits, reopens, and exports a local video", async ({}, testInfo) => {
		test.setTimeout(240_000);
		await runRestrictedStickerLifecycle({
			fixture,
			runtimeCase: fixture.cases.alphaVideo,
			testInfo,
		});
	});
});

test.describe("Sticker Lab real local cache export", () => {
	test.skip(
		!REAL_STICKER_CACHE_VIDEOS_DIRECTORY,
		"Set QCUT_REAL_STICKER_LAB_VIDEOS_DIRECTORY to run against local caches"
	);

	for (const cacheCase of REAL_STICKER_CACHE_CASES) {
		// biome-ignore lint/correctness/noEmptyPattern: each case launches its own isolated Electron process.
		test(`${cacheCase.displayName} loads from the real cache and exports`, async ({}, testInfo) => {
			test.setTimeout(360_000);
			await runRealCachedStickerExport({ cacheCase, testInfo });
		});
	}
});

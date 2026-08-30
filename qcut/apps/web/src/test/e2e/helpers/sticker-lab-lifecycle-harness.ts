import path from "node:path";
import { expect, _electron as electron, type TestInfo } from "@playwright/test";
import type { ElectronApplication, Locator, Page } from "playwright";
import { navigateToProjects, uploadTestMedia } from "./electron-helpers";
import {
	type DecodedStickerFrameArtifact,
	STICKER_VIDEO_EVIDENCE_TIMES,
	type StickerVideoEvidenceProfile,
	type StickerVideoEvidenceArtifacts,
} from "./exported-sticker-video-evidence";

export const SPLIT_TIME_SECONDS = 2.75;
export const SPLIT_LEFT_SAMPLE_SECONDS = SPLIT_TIME_SECONDS - 0.01;
export const SPLIT_RIGHT_SAMPLE_SECONDS = SPLIT_TIME_SECONDS + 0.01;

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
	height?: number;
	id: string;
	mediaId?: string;
	opacity?: number;
	rotation?: number;
	startTime: number;
	stickerAssetId?: string;
	stickerId?: string;
	stickerRuntime?: Record<string, unknown>;
	trimEnd: number;
	trimStart: number;
	type: string;
	width?: number;
	x?: number;
	y?: number;
}

interface HarnessTimelineTrack {
	elements: HarnessTimelineElement[];
	id: string;
	type: string;
}

export interface RuntimePlaybackSample {
	frame: string | null;
	pixel: number[];
	time: number;
}

export interface StickerLabHarnessWindow extends Window {
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

export interface DecodedPreviewImageEvidence {
	complete: boolean;
	decoded: boolean;
	height: number;
	source: string;
	width: number;
}

export interface RuntimeCanvasEvidence {
	frame: string | null;
	pixelHash: string;
	height: number;
	width: number;
}

export interface RestrictedState {
	allMedia: PersistedMediaState[];
	media: PersistedMediaState[];
	mediaElements: HarnessTimelineElement[];
	projectId: string | null;
	runtimeResources: PersistedMediaState[];
	stickers: HarnessTimelineElement[];
	trackTypes: string[];
}

async function findElectronBridgeWindow({
	deadline,
	electronApp,
}: {
	deadline: number;
	electronApp: ElectronApplication;
}): Promise<Page> {
	const windows = electronApp.windows();
	const bridgeStates = await Promise.all(
		windows.map(async (page) => ({
			page,
			ready: await page
				.evaluate(() => Boolean(window.electronAPI))
				.catch(() => false),
		}))
	);
	const bridgeWindow = bridgeStates.find(({ ready }) => ready)?.page;
	if (bridgeWindow) return bridgeWindow;
	if (Date.now() >= deadline) {
		throw new Error(
			`No QCut Electron bridge window appeared; observed ${windows.length} window(s)`
		);
	}
	await Promise.race([
		electronApp.waitForEvent("window", { timeout: 500 }).catch(() => undefined),
		new Promise<void>((resolve) => setTimeout(resolve, 100)),
	]);
	return findElectronBridgeWindow({ deadline, electronApp });
}

export function withoutTransientFileMime({
	media,
}: {
	media: PersistedMediaState[];
}): Omit<PersistedMediaState, "mimeType">[] {
	return media.map(({ mimeType: _mimeType, ...item }) => item);
}

export async function launchIsolatedQCut({
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
		const page = await findElectronBridgeWindow({
			deadline: Date.now() + 30_000,
			electronApp,
		});
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

export async function forceTerminateElectronApp({
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

export async function readDecodedPreviewImage({
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

export async function readRuntimeCanvasEvidence({
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

export function buildVideoEvidenceArtifacts({
	prefix,
	reportContext,
	testInfo,
	times = STICKER_VIDEO_EVIDENCE_TIMES,
}: {
	prefix: string;
	reportContext: Record<string, unknown>;
	testInfo: TestInfo;
	times?: StickerVideoEvidenceProfile["times"];
}): StickerVideoEvidenceArtifacts {
	const decodedFrames: DecodedStickerFrameArtifact[] = [
		["before-split", times.splitLeft],
		["after-split", times.splitRight],
		["beyond-split", times.postSplit],
		["near-end", times.nearEnd],
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

export async function readRestrictedState({
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
			trackTypes: harness.__timelineStore
				.getState()
				.tracks.map((track) => track.type),
		};
	});
}

export async function saveCurrentProject({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(async () => {
		await (window as StickerLabHarnessWindow).__projectStore
			.getState()
			.saveCurrentProject();
	});
}

export async function addBaseVideoToTimeline({
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

export async function readRuntimeCanvasPixel({
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

export async function seekTimeline({
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

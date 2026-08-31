import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	PlanarTrackingReference,
	PlanarTrackingSidecarV1,
	StickerPlanarTracking,
} from "@qcut/editor-core";
import type { Page, TestInfo } from "@playwright/test";
import {
	createTestProject,
	expect,
	startElectronApp,
	test as qcutTest,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	createPlanarTrackingWorkspace as createWorkspace,
	PLANAR_FIXTURE_DURATION_SECONDS as FIXTURE_DURATION_SECONDS,
	PLANAR_FIXTURE_HEIGHT as FIXTURE_HEIGHT,
	PLANAR_FIXTURE_WIDTH as FIXTURE_WIDTH,
	type PlanarTrackingWorkspace,
} from "./helpers/planar-tracking-video-fixture";
import {
	attachPlanarTrackingExportEvidence,
	exportAndInspectPlanarTrackingVideo,
} from "./helpers/planar-tracking-export-evidence";

const EVIDENCE_DIRECTORY = path.resolve("output/playwright/planar-tracking");

interface HarnessMediaItem {
	duration?: number;
	height?: number;
	id: string;
	name: string;
	type: string;
	width?: number;
}

interface HarnessTimelineElement {
	id: string;
	mediaId?: string;
	stickerId?: string;
	surfaceTrackings?: PlanarTrackingReference[];
	tracking?: StickerPlanarTracking;
	type: string;
}

interface HarnessTimelineTrack {
	elements: HarnessTimelineElement[];
	id: string;
	isMain?: boolean;
	type: string;
}

interface HarnessTimelineState {
	addElementToTrack: (
		trackId: string,
		element: Record<string, unknown>,
		options?: { pushHistory?: boolean; selectElement?: boolean }
	) => string | null;
	insertTrackAt: (type: string, index: number) => string;
	setSelectedElements: (
		selection: Array<{ elementId: string; trackId: string }>
	) => void;
	tracks: HarnessTimelineTrack[];
}

interface HarnessStickerState {
	addOverlaySticker: (
		mediaItemId: string,
		options: Record<string, unknown>
	) => string;
	selectSticker: (stickerId: string) => void;
}

interface PlanarTrackingHarnessWindow extends Window {
	__mediaStore: {
		getState: () => { mediaItems: HarnessMediaItem[] };
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
	__projectStore: {
		getState: () => { activeProject: { id: string } | null };
	};
	__timelineStore: {
		getState: () => HarnessTimelineState;
	};
	electronAPI?: {
		planarTrackingStorage?: {
			read: (request: {
				expectedSha256: string;
				projectId: string;
				resultUri: string;
			}) => Promise<{
				resultSha256: string;
				resultUri: string;
				sidecar: PlanarTrackingSidecarV1;
			}>;
		};
	};
	stickerTest: {
		getStores: () => {
			media: { mediaItems: HarnessMediaItem[] };
			stickers: HarnessStickerState;
			timeline: HarnessTimelineState;
		};
	};
	stickerTestReady: Promise<void>;
}

interface TimelineSetup {
	mediaElementId: string;
	projectId: string;
	stickerElementId: string;
	stickerId: string;
}

interface TrackingStateSnapshot {
	binding: StickerPlanarTracking;
	reference: PlanarTrackingReference;
}

async function setupTimeline({ page }: { page: Page }): Promise<TimelineSetup> {
	return page.evaluate(async () => {
		const harness = window as unknown as PlanarTrackingHarnessWindow;
		await harness.stickerTestReady;
		const stores = harness.stickerTest.getStores();
		const video = stores.media.mediaItems.find((item) => item.type === "video");
		const image = stores.media.mediaItems.find((item) => item.type === "image");
		const timeline = stores.timeline;
		const mediaTrack = timeline.tracks.find(
			(track) => track.isMain || track.type === "media"
		);
		const projectId = harness.__projectStore.getState().activeProject?.id;
		if (!video || !image || !mediaTrack || !projectId) {
			throw new Error("Planar tracking E2E media or project was not ready");
		}

		const mediaElementId = timeline.addElementToTrack(
			mediaTrack.id,
			{
				duration: video.duration ?? FIXTURE_DURATION_SECONDS,
				mediaId: video.id,
				name: video.name,
				startTime: 0,
				trimEnd: 0,
				trimStart: 0,
				type: "media",
			},
			{ pushHistory: false, selectElement: false }
		);
		if (!mediaElementId) throw new Error("Could not add planar source video");

		const stickerId = stores.stickers.addOverlaySticker(image.id, {
			maintainAspectRatio: true,
			opacity: 1,
			position: { x: 50, y: 50 },
			rotation: 0,
			size: { height: 18, width: 18 },
		});
		const stickerTrackId = timeline.insertTrackAt("sticker", 0);
		const stickerElementId = timeline.addElementToTrack(
			stickerTrackId,
			{
				duration: video.duration ?? FIXTURE_DURATION_SECONDS,
				height: 18,
				maintainAspectRatio: true,
				mediaId: image.id,
				name: "Planar tracking marker",
				opacity: 1,
				rotation: 0,
				startTime: 0,
				stickerId,
				trimEnd: 0,
				trimStart: 0,
				type: "sticker",
				width: 18,
				x: 50,
				y: 50,
				zIndex: 1,
			},
			{ pushHistory: false, selectElement: false }
		);
		if (!stickerElementId) {
			throw new Error("Could not add planar tracking sticker");
		}
		stores.stickers.selectSticker(stickerId);
		timeline.setSelectedElements([
			{ elementId: stickerElementId, trackId: stickerTrackId },
		]);
		harness.__playbackStore.getState().seek(1);
		return { mediaElementId, projectId, stickerElementId, stickerId };
	});
}

async function readTrackingState({
	page,
	setup,
}: {
	page: Page;
	setup: TimelineSetup;
}): Promise<TrackingStateSnapshot> {
	return page.evaluate(({ mediaElementId, stickerElementId }) => {
		const timeline = (
			window as unknown as PlanarTrackingHarnessWindow
		).__timelineStore.getState();
		const elements = timeline.tracks.flatMap((track) => track.elements);
		const media = elements.find((element) => element.id === mediaElementId);
		const sticker = elements.find((element) => element.id === stickerElementId);
		const binding = sticker?.tracking;
		const reference = media?.surfaceTrackings?.find(
			(candidate) => candidate.id === binding?.surfaceTrackingId
		);
		if (!binding || !reference) {
			throw new Error("Tracking binding or reference was not committed");
		}
		return { binding, reference };
	}, setup);
}

async function readPersistedSidecar({
	page,
	projectId,
	reference,
}: {
	page: Page;
	projectId: string;
	reference: PlanarTrackingReference;
}) {
	return page.evaluate(
		async ({ expectedSha256, projectId: selectedProjectId, resultUri }) => {
			const storage = (window as unknown as PlanarTrackingHarnessWindow)
				.electronAPI?.planarTrackingStorage;
			if (!storage) throw new Error("Electron planar storage is unavailable");
			return storage.read({
				expectedSha256,
				projectId: selectedProjectId,
				resultUri,
			});
		},
		{
			expectedSha256: reference.resultSha256 ?? "",
			projectId,
			resultUri: reference.resultUri ?? "",
		}
	);
}

async function stickerBoxAt({
	page,
	stickerId,
	time,
}: {
	page: Page;
	stickerId: string;
	time: number;
}) {
	await page.evaluate(
		({ seekTime }) => {
			(window as unknown as PlanarTrackingHarnessWindow).__playbackStore
				.getState()
				.seek(seekTime);
		},
		{ seekTime: time }
	);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	const sticker = page.locator(
		`[data-sticker-id="${stickerId}"][data-sticker-render-mode="visual"]`
	);
	await expect(sticker).toBeVisible();
	const box = await sticker.boundingBox();
	if (!box) throw new Error("Tracked sticker did not have preview geometry");
	return box;
}

async function captureEvidence({
	fileName,
	page,
	testInfo,
}: {
	fileName: string;
	page: Page;
	testInfo: TestInfo;
}): Promise<string> {
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	const screenshot = await page.screenshot({ animations: "disabled" });
	const evidencePath = path.join(EVIDENCE_DIRECTORY, fileName);
	await writeFile(evidencePath, screenshot);
	await testInfo.attach(fileName, {
		body: screenshot,
		contentType: "image/png",
	});
	return evidencePath;
}

const test = qcutTest.extend<{ planarWorkspace: PlanarTrackingWorkspace }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	planarWorkspace: async ({}, use) => {
		const workspace = await createWorkspace();
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
test.setTimeout(180_000);

test.describe("Real planar tracking", () => {
	test("tracks a translated plane, persists it, and moves the preview sticker", async ({
		electronApp,
		page,
		planarWorkspace,
	}, testInfo) => {
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000);
		});
		await createTestProject(page, "Planar Tracking Real E2E");
		await uploadTestMedia(page, planarWorkspace.videoPath);
		await uploadTestMedia(
			page,
			path.resolve("apps/web/src/test/e2e/fixtures/media/sample-image.png")
		);
		const setup = await setupTimeline({ page });

		const stickerProperties = page.getByTestId("sticker-properties");
		await expect(stickerProperties).toBeVisible();
		await stickerProperties.getByRole("tab").nth(3).click();
		const planarProperties = page.getByTestId(
			"sticker-planar-tracking-properties"
		);
		await expect(planarProperties).toBeVisible();
		await planarProperties
			.getByRole("button", { name: /编辑跟踪平面|Edit tracking plane/ })
			.click();

		const selection = page.getByTestId("planar-tracking-selection-overlay");
		await expect(selection).toBeVisible();
		await expect(selection.getByRole("button")).toHaveCount(4);
		const topLeftHandle = selection.getByRole("button", {
			name: "Top left tracking corner",
		});
		const topLeftBefore = await topLeftHandle.getAttribute("style");
		await topLeftHandle.focus();
		await page.keyboard.press("Shift+ArrowLeft");
		await page.keyboard.press("Shift+ArrowUp");
		await expect(topLeftHandle).not.toHaveAttribute(
			"style",
			topLeftBefore ?? ""
		);
		const selectionScreenshot = await captureEvidence({
			fileName: "01-plane-selection.png",
			page,
			testInfo,
		});
		const untrackedBox = await stickerBoxAt({
			page,
			stickerId: setup.stickerId,
			time: 1,
		});

		await planarProperties
			.getByRole("button", { name: /开始跟踪|Start tracking/ })
			.click();
		const jobStatus = page.getByTestId("planar-tracking-job-status");
		await expect(jobStatus).toBeVisible({ timeout: 120_000 });
		await expect(jobStatus).toHaveText(/^(跟踪完成|Tracking complete)$/);

		const trackingState = await readTrackingState({ page, setup });
		expect(trackingState.reference.status).toBe("ready");
		expect(trackingState.reference.resultSha256).toMatch(/^[a-f\d]{64}$/);
		expect(trackingState.reference.sampleCount).toBeGreaterThanOrEqual(20);
		expect(trackingState.binding.sourceElementId).toBe(setup.mediaElementId);

		const persisted = await readPersistedSidecar({
			page,
			projectId: setup.projectId,
			reference: trackingState.reference,
		});
		expect(persisted.resultSha256).toBe(trackingState.reference.resultSha256);
		expect(persisted.sidecar.source.displayWidth).toBe(FIXTURE_WIDTH);
		expect(persisted.sidecar.source.displayHeight).toBe(FIXTURE_HEIGHT);
		expect(persisted.sidecar.samples).toHaveLength(
			trackingState.reference.sampleCount ?? 0
		);
		expect(
			persisted.sidecar.samples.filter((sample) => sample.status === "lost")
		).toHaveLength(0);

		const firstSample = persisted.sidecar.samples[0];
		const lastSample = persisted.sidecar.samples.at(-1);
		if (!firstSample || !lastSample) {
			throw new Error("Persisted planar sidecar had no samples");
		}
		const normalizedDelta = {
			x: lastSample.quad.topLeft.x - firstSample.quad.topLeft.x,
			y: lastSample.quad.topLeft.y - firstSample.quad.topLeft.y,
		};
		expect(normalizedDelta.x).toBeLessThan(-0.08);
		expect(normalizedDelta.y).toBeLessThan(-0.045);
		expect(lastSample.ptsUs - firstSample.ptsUs).toBeGreaterThan(1_700_000);

		const earlyBox = await stickerBoxAt({
			page,
			stickerId: setup.stickerId,
			time: 0.2,
		});
		const lateBox = await stickerBoxAt({
			page,
			stickerId: setup.stickerId,
			time: 1.8,
		});
		const previewDelta = {
			x: lateBox.x - earlyBox.x,
			y: lateBox.y - earlyBox.y,
		};
		expect(previewDelta.x).toBeLessThan(-10);
		expect(previewDelta.y).toBeLessThan(-5);
		expect(Math.abs(earlyBox.width - untrackedBox.width)).toBeLessThan(5);
		expect(Math.abs(earlyBox.height - untrackedBox.height)).toBeLessThan(5);
		expect(Math.abs(lateBox.width - untrackedBox.width)).toBeLessThan(5);
		expect(Math.abs(lateBox.height - untrackedBox.height)).toBeLessThan(5);

		const resultScreenshot = await captureEvidence({
			fileName: "02-tracking-complete.png",
			page,
			testInfo,
		});
		const exportEvidence = await exportAndInspectPlanarTrackingVideo({
			electronApp,
			outputDirectory: EVIDENCE_DIRECTORY,
			page,
		});
		const exportDelta = {
			x: exportEvidence.lateBox.x - exportEvidence.earlyBox.x,
			y: exportEvidence.lateBox.y - exportEvidence.earlyBox.y,
		};
		expect(exportEvidence.earlyBox.pixelCount).toBeGreaterThan(1_000);
		expect(exportEvidence.lateBox.pixelCount).toBeGreaterThan(1_000);
		expect(exportDelta.x).toBeLessThan(-35);
		expect(exportDelta.y).toBeLessThan(-15);
		expect(
			Math.abs(exportEvidence.earlyBox.width - exportEvidence.lateBox.width)
		).toBeLessThan(5);
		expect(
			Math.abs(exportEvidence.earlyBox.height - exportEvidence.lateBox.height)
		).toBeLessThan(5);
		await attachPlanarTrackingExportEvidence({
			evidence: exportEvidence,
			testInfo,
		});
		const metrics = {
			export: {
				...exportEvidence,
				delta: exportDelta,
			},
			fixture: {
				durationSeconds: FIXTURE_DURATION_SECONDS,
				height: FIXTURE_HEIGHT,
				width: FIXTURE_WIDTH,
			},
			previewBoxes: { early: earlyBox, late: lateBox, untracked: untrackedBox },
			normalizedDelta,
			previewDelta,
			provider: persisted.sidecar.provider,
			resultSha256: persisted.resultSha256,
			sampleCount: persisted.sidecar.samples.length,
			screenshots: [selectionScreenshot, resultScreenshot],
			status: trackingState.reference.status,
		};
		const metricsBody = Buffer.from(JSON.stringify(metrics, null, 2));
		await writeFile(path.join(EVIDENCE_DIRECTORY, "metrics.json"), metricsBody);
		await testInfo.attach("planar-tracking-metrics", {
			body: metricsBody,
			contentType: "application/json",
		});
	});
});

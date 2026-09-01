/**
 * Scenario setup and invariant capture for the planar sticker render benchmark.
 *
 * Builds three comparable timelines on one project — no sticker, a plain
 * untracked sticker, and a real planar-tracked sticker — and captures the
 * geometry a caching change must not alter.
 */

import { expect, type Page } from "@playwright/test";

export const PLANAR_BENCH = {
	durationSeconds: 2,
	fixtureHeight: 240,
	fixtureWidth: 320,
	stickerSize: 18,
} as const;

export interface PlanarBenchSetup {
	mediaElementId: string;
	projectId: string;
	stickerElementId: string;
	stickerId: string;
	stickerTrackId: string;
}

/**
 * Geometry of the rendered sticker at one fixed time, expressed as fractions
 * of the preview surface so it is independent of preview zoom.
 */
export interface StickerQuadSample {
	time: number;
	visible: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	transform: string;
}

interface BenchHarnessWindow {
	__playbackStore: {
		getState: () => {
			seek: (time: number) => void;
			play: () => void;
			pause: () => void;
		};
	};
	__projectStore: { getState: () => { activeProject?: { id: string } } };
	__timelineStore: { getState: () => Record<string, any> };
	stickerTest: {
		getStores: () => {
			media: { mediaItems: Array<Record<string, any>> };
			stickers: Record<string, any>;
			timeline: Record<string, any>;
		};
	};
	stickerTestReady: Promise<void>;
}

/**
 * Adds only the source video, giving a no-sticker control timeline.
 */
export async function addPlanarSourceVideo({
	page,
}: {
	page: Page;
}): Promise<{ mediaElementId: string; projectId: string }> {
	return await page.evaluate(async (bench) => {
		const harness = window as unknown as BenchHarnessWindow;
		await harness.stickerTestReady;
		const stores = harness.stickerTest.getStores();
		const video = stores.media.mediaItems.find(
			(item: { type: string }) => item.type === "video"
		);
		const timeline = stores.timeline;
		const mediaTrack = timeline.tracks.find(
			(track: { isMain?: boolean; type: string }) =>
				track.isMain || track.type === "media"
		);
		const projectId = harness.__projectStore.getState().activeProject?.id;
		if (!video || !mediaTrack || !projectId) {
			throw new Error("Planar benchmark media or project was not ready");
		}
		const mediaElementId = timeline.addElementToTrack(
			mediaTrack.id,
			{
				duration: video.duration ?? bench.durationSeconds,
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
		harness.__playbackStore.getState().seek(0);
		return { mediaElementId, projectId };
	}, PLANAR_BENCH);
}

/**
 * Adds an overlay sticker over the source video. The sticker starts untracked;
 * `runRealTracking` promotes it to a planar-tracked sticker.
 */
export async function addBenchSticker({ page }: { page: Page }): Promise<{
	stickerElementId: string;
	stickerId: string;
	stickerTrackId: string;
}> {
	return await page.evaluate(async (bench) => {
		const harness = window as unknown as BenchHarnessWindow;
		await harness.stickerTestReady;
		const stores = harness.stickerTest.getStores();
		const video = stores.media.mediaItems.find(
			(item: { type: string }) => item.type === "video"
		);
		const image = stores.media.mediaItems.find(
			(item: { type: string }) => item.type === "image"
		);
		const timeline = stores.timeline;
		if (!video || !image) {
			throw new Error("Planar benchmark sticker media was not ready");
		}

		const stickerId = stores.stickers.addOverlaySticker(image.id, {
			maintainAspectRatio: true,
			opacity: 1,
			position: { x: 50, y: 50 },
			rotation: 0,
			size: { height: bench.stickerSize, width: bench.stickerSize },
		});
		const stickerTrackId = timeline.insertTrackAt("sticker", 0);
		const stickerElementId = timeline.addElementToTrack(
			stickerTrackId,
			{
				duration: video.duration ?? bench.durationSeconds,
				height: bench.stickerSize,
				maintainAspectRatio: true,
				mediaId: image.id,
				name: "Planar benchmark marker",
				opacity: 1,
				rotation: 0,
				startTime: 0,
				stickerId,
				trimEnd: 0,
				trimStart: 0,
				type: "sticker",
				width: bench.stickerSize,
				x: 50,
				y: 50,
				zIndex: 1,
			},
			{ pushHistory: false, selectElement: false }
		);
		if (!stickerElementId) {
			throw new Error("Could not add planar benchmark sticker");
		}
		stores.stickers.selectSticker(stickerId);
		timeline.setSelectedElements([
			{ elementId: stickerElementId, trackId: stickerTrackId },
		]);
		harness.__playbackStore.getState().seek(0);
		return { stickerElementId, stickerId, stickerTrackId };
	}, PLANAR_BENCH);
}

/**
 * Dismisses the export panel and re-selects the sticker so the properties
 * panel is showing again. Exporting leaves its own panel open, which hides the
 * sticker properties the tracking flow needs.
 */
export async function focusStickerForTracking({
	page,
	stickerElementId,
	stickerId,
	stickerTrackId,
}: {
	page: Page;
	stickerElementId: string;
	stickerId: string;
	stickerTrackId: string;
}): Promise<void> {
	await page.keyboard.press("Escape");
	await page.evaluate(
		(target) => {
			const harness = window as unknown as BenchHarnessWindow;
			const stores = harness.stickerTest.getStores();
			stores.stickers.selectSticker(target.stickerId);
			harness.__timelineStore.getState().setSelectedElements([
				{
					elementId: target.stickerElementId,
					trackId: target.stickerTrackId,
				},
			]);
		},
		{ stickerElementId, stickerId, stickerTrackId }
	);
	await expect(page.getByTestId("sticker-properties")).toBeVisible({
		timeout: 30_000,
	});
}

/**
 * Drives the real tracking job through the properties panel, producing a
 * genuine sidecar on disk. Returns once the job reports completion.
 */
export async function runRealTracking({ page }: { page: Page }): Promise<void> {
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
	await expect(
		page.getByTestId("planar-tracking-selection-overlay")
	).toBeVisible();
	await planarProperties
		.getByRole("button", { name: /开始跟踪|Start tracking/ })
		.click();
	const jobStatus = page.getByTestId("planar-tracking-job-status");
	await expect(jobStatus).toBeVisible({ timeout: 180_000 });
	await expect(jobStatus).toHaveText(/^(跟踪完成|Tracking complete)$/, {
		timeout: 180_000,
	});
}

/**
 * Reads the committed tracking binding and reference. Used to prove the
 * sticker really is planar-tracked before any tracked-scenario measurement.
 */
export async function readTrackingBinding({
	page,
	stickerElementId,
	mediaElementId,
}: {
	page: Page;
	stickerElementId: string;
	mediaElementId: string;
}): Promise<{
	mode: string | undefined;
	referenceStatus: string | undefined;
	resultSha256: string | undefined;
	resultUri: string | undefined;
	sampleCount: number | undefined;
	sourceElementId: string | undefined;
}> {
	return await page.evaluate(
		(target) => {
			const timeline = (
				window as unknown as BenchHarnessWindow
			).__timelineStore.getState();
			const elements = timeline.tracks.flatMap(
				(track: { elements: unknown[] }) => track.elements
			);
			const sticker = elements.find(
				(element: { id: string }) => element.id === target.stickerElementId
			);
			const media = elements.find(
				(element: { id: string }) => element.id === target.mediaElementId
			);
			const binding = sticker?.tracking;
			const reference = media?.surfaceTrackings?.find(
				(candidate: { id: string }) =>
					candidate.id === binding?.surfaceTrackingId
			);
			return {
				mode: binding?.mode,
				referenceStatus: reference?.status,
				resultSha256: reference?.resultSha256,
				resultUri: reference?.resultUri,
				sampleCount: reference?.sampleCount,
				sourceElementId: binding?.sourceElementId,
			};
		},
		{ mediaElementId, stickerElementId }
	);
}

/**
 * Reads the persisted sidecar through the app's own storage bridge and returns
 * the tracked quad centre at each requested time (nearest sample).
 *
 * This is the run-independent anchor for the geometry gate: the rendered
 * sticker must follow these centres regardless of preview zoom, which varies
 * between runs.
 */
export async function readSidecarQuadCentres({
	page,
	projectId,
	resultUri,
	expectedSha256,
	times,
}: {
	page: Page;
	projectId: string;
	resultUri: string;
	expectedSha256: string;
	times: readonly number[];
}): Promise<Array<{ time: number; x: number; y: number }>> {
	return await page.evaluate(
		async (input) => {
			const storage = (
				window as unknown as {
					electronAPI?: {
						planarTrackingStorage?: {
							read: (request: {
								expectedSha256: string;
								projectId: string;
								resultUri: string;
							}) => Promise<{ sidecar: { samples: unknown[] } }>;
						};
					};
				}
			).electronAPI?.planarTrackingStorage;
			if (!storage) throw new Error("Planar storage bridge unavailable");
			const { sidecar } = await storage.read({
				expectedSha256: input.expectedSha256,
				projectId: input.projectId,
				resultUri: input.resultUri,
			});
			const samples = sidecar.samples as Array<{
				ptsUs: number;
				quad?: {
					topLeft: { x: number; y: number };
					topRight: { x: number; y: number };
					bottomRight: { x: number; y: number };
					bottomLeft: { x: number; y: number };
				};
			}>;
			return input.times.map((time) => {
				const targetUs = time * 1_000_000;
				let nearest = samples[0];
				for (const sample of samples) {
					if (
						Math.abs(sample.ptsUs - targetUs) <
						Math.abs(nearest.ptsUs - targetUs)
					) {
						nearest = sample;
					}
				}
				const quad = nearest?.quad;
				if (!quad) return { time, x: Number.NaN, y: Number.NaN };
				return {
					time,
					x:
						(quad.topLeft.x +
							quad.topRight.x +
							quad.bottomRight.x +
							quad.bottomLeft.x) /
						4,
					y:
						(quad.topLeft.y +
							quad.topRight.y +
							quad.bottomRight.y +
							quad.bottomLeft.y) /
						4,
				};
			});
		},
		{ expectedSha256, projectId, resultUri, times: [...times] }
	);
}

/**
 * Measures how the cost of one sidecar read scales with sample count.
 *
 * The benchmark fixture is a 2 second clip, so its sidecar is tiny and the
 * per-frame reads it eliminates look cheap. Real tracking runs are far longer,
 * and each read hashes and parses the whole file, so this writes synthetic
 * sidecars of increasing size and times a real read of each.
 */
export async function measureReadCostBySize({
	page,
	projectId,
	sampleCounts,
}: {
	page: Page;
	projectId: string;
	sampleCounts: readonly number[];
}): Promise<Array<{ samples: number; bytes: number; readMs: number }>> {
	return await page.evaluate(
		async (input) => {
			const storage = (
				window as unknown as {
					electronAPI?: {
						planarTrackingStorage?: {
							write: (request: unknown) => Promise<{
								resultSha256: string;
								resultUri: string;
							}>;
							read: (request: unknown) => Promise<unknown>;
						};
					};
				}
			).electronAPI?.planarTrackingStorage;
			if (!storage) throw new Error("Planar storage bridge unavailable");

			const results: Array<{
				samples: number;
				bytes: number;
				readMs: number;
			}> = [];
			for (const sampleCount of input.sampleCounts) {
				const quad = {
					bottomLeft: { x: 0.2, y: 0.8 },
					bottomRight: { x: 0.8, y: 0.8 },
					topLeft: { x: 0.2, y: 0.2 },
					topRight: { x: 0.8, y: 0.2 },
				};
				const sidecar = {
					coordinateSpace: "source-display-normalized",
					direction: "both",
					provider: {
						id: "opencv-wasm",
						parametersHash: "a".repeat(64),
						version: "bench",
					},
					samples: Array.from({ length: sampleCount }, (_unused, index) => ({
						confidence: 0.9,
						ptsUs: index * 33_333,
						quad,
						status: "tracked",
					})),
					schemaVersion: 1,
					seed: { ptsUs: 0, quad },
					source: {
						contentSha256: "b".repeat(64),
						displayHeight: 240,
						displayWidth: 320,
						mediaId: "bench-media",
					},
					timebase: "microseconds",
				};
				const written = await storage.write({
					projectId: input.projectId,
					sidecar,
					trackingId: `bench-size-${sampleCount}`,
				});
				const startedAt = performance.now();
				await storage.read({
					expectedSha256: written.resultSha256,
					projectId: input.projectId,
					resultUri: written.resultUri,
				});
				results.push({
					bytes: JSON.stringify(sidecar).length,
					readMs: performance.now() - startedAt,
					samples: sampleCount,
				});
			}
			return results;
		},
		{ projectId, sampleCounts: [...sampleCounts] }
	);
}

/** Rounds to 6 decimals so float noise does not defeat equality checks. */
function round6(value: number): number {
	return Number(value.toFixed(6));
}

/** Waits two animation frames so a seek is reflected in the DOM. */
async function settleFrames({ page }: { page: Page }): Promise<void> {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			})
	);
}

/**
 * Captures the rendered sticker geometry at fixed times. These samples are the
 * invariant fixture: a caching change must reproduce them exactly.
 */
export async function captureQuadSamples({
	page,
	stickerId,
	times,
}: {
	page: Page;
	stickerId: string;
	times: readonly number[];
}): Promise<StickerQuadSample[]> {
	const samples: StickerQuadSample[] = [];
	for (const time of times) {
		await page.evaluate((seekTime) => {
			(window as unknown as BenchHarnessWindow).__playbackStore
				.getState()
				.seek(seekTime);
		}, time);
		await settleFrames({ page });

		const locator = page.locator(
			`[data-sticker-id="${stickerId}"][data-sticker-render-mode="visual"]`
		);
		const count = await locator.count();
		if (count === 0) {
			samples.push({
				height: 0,
				time,
				transform: "",
				visible: false,
				width: 0,
				x: 0,
				y: 0,
			});
			continue;
		}
		const box = await locator.boundingBox();
		const transform = await locator.evaluate(
			(node) => getComputedStyle(node as HTMLElement).transform
		);
		// Normalize against the preview surface. Raw screen pixels depend on the
		// preview's zoom, which varies between runs and would make the fixture
		// look like a geometry change when only the layout differed.
		const surface = await locator.evaluate((node) => {
			const panel = (node as HTMLElement).closest(
				'[data-testid="preview-panel"]'
			);
			const host = (panel ??
				(node as HTMLElement).offsetParent) as HTMLElement | null;
			if (!host) return null;
			const rect = host.getBoundingClientRect();
			return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
		});
		const denomWidth = surface?.width || 1;
		const denomHeight = surface?.height || 1;
		samples.push({
			height: round6((box?.height ?? 0) / denomHeight),
			time,
			transform,
			visible: Boolean(box),
			width: round6((box?.width ?? 0) / denomWidth),
			x: round6(((box?.x ?? 0) - (surface?.x ?? 0)) / denomWidth),
			y: round6(((box?.y ?? 0) - (surface?.y ?? 0)) / denomHeight),
		});
	}
	return samples;
}

/** Plays the timeline for a fixed wall-clock window. */
export async function playForSeconds({
	page,
	seconds,
}: {
	page: Page;
	seconds: number;
}): Promise<void> {
	await page.evaluate((duration) => {
		const playback = (
			window as unknown as BenchHarnessWindow
		).__playbackStore.getState();
		playback.seek(0);
		playback.play();
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				(window as unknown as BenchHarnessWindow).__playbackStore
					.getState()
					.pause();
				resolve();
			}, duration * 1000);
		});
	}, seconds);
}

/** Seeks to each time in turn, settling frames between. */
export async function seekThrough({
	page,
	times,
}: {
	page: Page;
	times: readonly number[];
}): Promise<void> {
	for (const time of times) {
		await page.evaluate((seekTime) => {
			(window as unknown as BenchHarnessWindow).__playbackStore
				.getState()
				.seek(seekTime);
		}, time);
		await settleFrames({ page });
	}
}

/** Removes the sticker element, leaving a no-sticker control timeline. */
export async function removeStickerElement({
	page,
	setup,
}: {
	page: Page;
	setup: PlanarBenchSetup;
}): Promise<void> {
	await page.evaluate((target) => {
		const timeline = (
			window as unknown as BenchHarnessWindow
		).__timelineStore.getState();
		timeline.removeElementFromTrack(
			target.stickerTrackId,
			target.stickerElementId
		);
	}, setup);
}

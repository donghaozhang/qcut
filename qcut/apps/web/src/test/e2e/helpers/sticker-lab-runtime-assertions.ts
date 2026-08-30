import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import { expect } from "@playwright/test";
import type { Locator, Page } from "playwright";
import type { StickerLabRuntimeFixtureCase } from "./sticker-lab-desktop-fixture";
import {
	readDecodedPreviewImage,
	readRuntimeCanvasPixel,
	type RestrictedState,
	type RuntimePlaybackSample,
	seekTimeline,
	type StickerLabHarnessWindow,
} from "./sticker-lab-lifecycle-harness";

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

export async function expectContinuousRuntimePlayback({
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

export function normalizedRuntimeDescriptor({
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

export async function expectRuntimeFrameAt({
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

export function assertRuntimeResources({
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

export async function selectStickerLabCard({
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

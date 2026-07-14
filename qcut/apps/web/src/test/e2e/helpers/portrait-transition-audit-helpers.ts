import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
	getClipTransitionPresetConfig,
	type TransitionPreset,
} from "../../../components/editor/media-panel/views/transitions/transition-presets";

interface TransitionAuditElement {
	id: string;
	mediaId: string;
	name: string;
	startTime: number;
}

interface TransitionAuditState {
	id: string;
	fromElementId: string;
	toElementId: string;
	presetId: string;
	type: string;
	direction?: string;
	duration: number;
	easing: string;
	tuning?: { intensity?: number; frequency?: number; tint?: string };
}

interface TransitionAuditWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{ id: string; name: string; duration?: number }>;
		};
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				type: string;
				isMain?: boolean;
				elements: TransitionAuditElement[];
				transitions?: TransitionAuditState[];
			}>;
			addElementToTrack: (
				trackId: string,
				element: {
					type: "media";
					mediaId: string;
					name: string;
					duration: number;
					startTime: number;
					trimStart: number;
					trimEnd: number;
				}
			) => string | null;
			setSelectedElements: (
				selection: Array<{ trackId: string; elementId: string }>
			) => void;
		};
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
}

export interface SeamReference {
	trackId: string;
	fromElementId: string;
	toElementId: string;
	cutTime: number;
}

interface VideoFrameMetrics {
	sourceId: string;
	width: number;
	height: number;
	readyState: number;
	opaqueSamples: number;
	lumaRange: number;
}

interface TransitionLayerMetrics {
	backgroundColor: string;
	clipPath: string;
	contentOpacity: number;
	filter: string;
	left: string;
	opacity: number;
	top: string;
	transform: string;
}

export interface TransitionPresetResult {
	presetId: string;
	type: string;
	direction?: string;
	duration: number;
	videoFrames: VideoFrameMetrics[];
	layers: TransitionLayerMetrics[];
}

export interface TransitionSeamInput {
	fromFileName: string;
	toFileName: string;
	clipDuration: number;
	expectedDimensions: Array<{ width: number; height: number }>;
}

export async function createTransitionSeam({
	page,
	input,
}: {
	page: Page;
	input: TransitionSeamInput;
}): Promise<SeamReference> {
	return page.evaluate(
		({ fromFileName, toFileName, duration }) => {
			const editorWindow = window as TransitionAuditWindow;
			const mediaItems = editorWindow.__mediaStore.getState().mediaItems;
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			const fromMedia = mediaItems.find((item) => item.name === fromFileName);
			const toMedia = mediaItems.find((item) => item.name === toFileName);
			if (!track || !fromMedia || !toMedia) {
				throw new Error("Missing real transition seam inputs");
			}
			const fromElementId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: fromMedia.id,
				name: fromMedia.name,
				duration,
				startTime: 0,
				trimStart: 0,
				trimEnd: 0,
			});
			const toElementId = timeline.addElementToTrack(track.id, {
				type: "media",
				mediaId: toMedia.id,
				name: toMedia.name,
				duration,
				startTime: duration,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!fromElementId || !toElementId) {
				throw new Error("Failed to create real transition seam");
			}
			return {
				trackId: track.id,
				fromElementId,
				toElementId,
				cutTime: duration,
			};
		},
		{
			fromFileName: input.fromFileName,
			toFileName: input.toFileName,
			duration: input.clipDuration,
		}
	);
}

export async function selectTransitionSeam({
	page,
	seam,
}: {
	page: Page;
	seam: SeamReference;
}) {
	await page.evaluate(({ trackId, fromElementId, toElementId }) => {
		(window as TransitionAuditWindow).__timelineStore
			.getState()
			.setSelectedElements([
				{ trackId, elementId: fromElementId },
				{ trackId, elementId: toElementId },
			]);
	}, seam);
}

async function seekToTransitionSeam({
	page,
	seam,
}: {
	page: Page;
	seam: SeamReference;
}) {
	await page.evaluate(({ cutTime }) => {
		(window as TransitionAuditWindow).__playbackStore.getState().seek(cutTime);
	}, seam);
}

async function readActiveTransition({
	page,
	seam,
}: {
	page: Page;
	seam: SeamReference;
}): Promise<TransitionAuditState | undefined> {
	return page.evaluate(({ trackId, fromElementId, toElementId }) => {
		const timeline = (
			window as TransitionAuditWindow
		).__timelineStore.getState();
		const track = timeline.tracks.find((candidate) => candidate.id === trackId);
		return track?.transitions?.find(
			(transition) =>
				transition.fromElementId === fromElementId &&
				transition.toElementId === toElementId
		);
	}, seam);
}

async function readTransitionSeamMetrics({ page }: { page: Page }): Promise<{
	videoFrames: VideoFrameMetrics[];
	layers: TransitionLayerMetrics[];
}> {
	const videos = page.getByTestId("preview-panel").locator("video");
	await expect(videos).toHaveCount(2);
	await expect
		.poll(() =>
			videos.evaluateAll((elements) =>
				elements.every(
					(element) =>
						(element as HTMLVideoElement).readyState >= 2 &&
						(element as HTMLVideoElement).videoWidth > 0 &&
						(element as HTMLVideoElement).videoHeight > 0
				)
			)
		)
		.toBe(true);

	return videos.evaluateAll((elements) => {
		const videoFrames: VideoFrameMetrics[] = [];
		const layers: TransitionLayerMetrics[] = [];
		for (const element of elements) {
			const video = element as HTMLVideoElement;
			const canvas = document.createElement("canvas");
			canvas.width = 64;
			canvas.height = 64;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Unable to sample transition video frame");
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const pixels = context.getImageData(
				0,
				0,
				canvas.width,
				canvas.height
			).data;
			let opaqueSamples = 0;
			let minimumLuma = 255;
			let maximumLuma = 0;
			for (let index = 0; index < pixels.length; index += 64) {
				if (pixels[index + 3] === 0) continue;
				const luma = Math.round(
					pixels[index] * 0.2126 +
						pixels[index + 1] * 0.7152 +
						pixels[index + 2] * 0.0722
				);
				minimumLuma = Math.min(minimumLuma, luma);
				maximumLuma = Math.max(maximumLuma, luma);
				opaqueSamples += 1;
			}
			videoFrames.push({
				sourceId: video.dataset.videoId ?? "",
				width: video.videoWidth,
				height: video.videoHeight,
				readyState: video.readyState,
				opaqueSamples,
				lumaRange: maximumLuma - minimumLuma,
			});

			const wrapper = video.closest(
				'[role="button"][aria-label^="Video:"]'
			) as HTMLElement | null;
			if (!wrapper) throw new Error("Missing transition presentation layer");
			const wrapperStyle = getComputedStyle(wrapper);
			const contentStyle = getComputedStyle(
				wrapper.firstElementChild as HTMLElement
			);
			layers.push({
				backgroundColor: wrapperStyle.backgroundColor,
				clipPath: wrapperStyle.clipPath,
				contentOpacity: Number.parseFloat(contentStyle.opacity),
				filter: wrapperStyle.filter,
				left: wrapperStyle.left,
				opacity: Number.parseFloat(wrapperStyle.opacity),
				top: wrapperStyle.top,
				transform: wrapperStyle.transform,
			});
		}
		return { videoFrames, layers };
	});
}

function hasVisibleTransition({
	layers,
}: {
	layers: TransitionLayerMetrics[];
}): boolean {
	const hasLayerEffect = layers.some(
		(layer) =>
			layer.opacity < 0.99 ||
			layer.contentOpacity < 0.99 ||
			layer.filter !== "none" ||
			layer.clipPath !== "none" ||
			!["rgba(0, 0, 0, 0)", "transparent"].includes(layer.backgroundColor)
	);
	const layerPositions = layers.map(
		(layer) => `${layer.left}:${layer.top}:${layer.transform}`
	);
	return hasLayerEffect || new Set(layerPositions).size > 1;
}

export async function verifyTransitionCardPreview({ card }: { card: Locator }) {
	await card.hover();
	const progress = card.getByTestId("transition-preview-progress");
	await expect
		.poll(() =>
			progress.evaluate((element) =>
				Number.parseFloat((element as HTMLElement).style.width)
			)
		)
		.toBeGreaterThan(0);
}

export async function applyTransitionPreset({
	page,
	seam,
	preset,
	card,
	expectedDimensions,
}: {
	page: Page;
	seam: SeamReference;
	preset: TransitionPreset;
	card: Locator;
	expectedDimensions: Array<{ width: number; height: number }>;
}): Promise<TransitionPresetResult> {
	const config = getClipTransitionPresetConfig({ preset });
	if (!config) throw new Error(`Missing production mapping for ${preset.id}`);
	await selectTransitionSeam({ page, seam });
	await card.dblclick();
	await expect
		.poll(() => readActiveTransition({ page, seam }))
		.toMatchObject({
			presetId: preset.id,
			type: config.type,
			duration: preset.defaultDuration,
			easing: "easeInOut",
			...(config.direction ? { direction: config.direction } : {}),
			...(config.tuning ? { tuning: config.tuning } : {}),
		});
	await seekToTransitionSeam({ page, seam });
	const metrics = await readTransitionSeamMetrics({ page });
	const actualDimensions = metrics.videoFrames
		.map(({ width, height }) => ({ width, height }))
		.sort((left, right) => left.width - right.width);
	const sortedExpectedDimensions = [...expectedDimensions].sort(
		(left, right) => left.width - right.width
	);
	expect(actualDimensions, preset.id).toEqual(sortedExpectedDimensions);
	for (const frame of metrics.videoFrames) {
		expect(frame.opaqueSamples, preset.id).toBeGreaterThan(100);
		expect(frame.lumaRange, preset.id).toBeGreaterThan(5);
	}
	expect(hasVisibleTransition({ layers: metrics.layers }), preset.id).toBe(
		true
	);
	return {
		presetId: preset.id,
		type: config.type,
		direction: config.direction,
		duration: preset.defaultDuration,
		...metrics,
	};
}

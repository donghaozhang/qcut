import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "../jianying-draft/index.js";
import { collectLossyMediaFeatureIssues } from "../jianying-draft/unsupported-features.js";
import type {
	QCutDraftExportImageMedia,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";
import type {
	MediaColorSettings,
	MediaElement,
	TimelineTrack,
} from "../types/timeline.js";

function createImageMedia({ id }: { id: string }): QCutDraftExportImageMedia {
	return {
		height: 1080,
		id,
		name: `${id}.png`,
		sourcePath: `/source/${id}.png`,
		type: "image",
		width: 1920,
	};
}

function createMediaElement({
	hidden = false,
	id,
	mediaId,
}: {
	hidden?: boolean;
	id: string;
	mediaId: string;
}): MediaElement {
	return {
		duration: 2,
		hidden,
		id,
		mediaId,
		name: `${mediaId}.png`,
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createDisabledConfiguredColor(): MediaColorSettings {
	const neutralRange = { hue: 0, luminance: 0, saturation: 0 };
	const secondaryCurve = { points: [], samples: [] };
	const neutralWheel = { luminance: 0, x: 0, y: 0 };
	return {
		basic: {
			blacks: 0,
			brightness: 20,
			contrast: 0,
			enabled: false,
			exposure: 0,
			fade: 0,
			grain: 0,
			highlights: 0,
			saturation: 0,
			shadows: 0,
			sharpness: 0,
			temperature: 0,
			tint: 0,
			vibrance: 0,
			vignette: 0,
			whites: 0,
		},
		curves: {
			blue: [],
			enabled: false,
			green: [],
			master: [],
			mix: 100,
			red: [],
		},
		enabled: false,
		filter: { intensity: 0, presetId: "none", presetVersion: 1 },
		hsl: {
			enabled: false,
			ranges: {
				blue: neutralRange,
				cyan: neutralRange,
				green: neutralRange,
				magenta: neutralRange,
				orange: neutralRange,
				purple: neutralRange,
				red: neutralRange,
				yellow: neutralRange,
			},
		},
		lut: {
			enabled: false,
			intensity: 100,
			name: "None",
			presetId: "none",
			skinProtection: 0,
		},
		management: {
			enabled: false,
			inputSpace: "auto",
			outputSpace: "rec709",
			peakNits: 100,
			toneMapping: "aces",
			workingSpace: "rec709-linear",
		},
		mask: { enabled: false, invert: false, maskIds: [] },
		secondaryCurves: {
			enabled: false,
			hueVsHue: secondaryCurve,
			hueVsLuminance: secondaryCurve,
			hueVsSaturation: secondaryCurve,
			luminanceVsSaturation: secondaryCurve,
			mix: 100,
			saturationVsSaturation: secondaryCurve,
		},
		smart: {
			autoTone: true,
			autoWhiteBalance: true,
			enabled: false,
			intensity: 100,
			status: "idle",
		},
		wheels: {
			balance: 0,
			enabled: false,
			highlights: neutralWheel,
			midtones: neutralWheel,
			mode: "tonal",
			offset: neutralWheel,
			shadows: neutralWheel,
			strength: 100,
		},
	};
}

function createSnapshot({
	media,
	timelineDurationByElementId,
	tracks,
}: {
	media: QCutDraftExportImageMedia[];
	timelineDurationByElementId: Record<string, number>;
	tracks: TimelineTrack[];
}): QCutDraftExportSnapshotV1 {
	return {
		media,
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "silent-loss-project",
			name: "Silent loss policy",
			sceneId: "silent-loss-scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId,
		tracks,
	};
}

describe("JianYing draft silent-loss policy", () => {
	it("blocks hidden tracks and hidden elements with precise locations", () => {
		const media = createImageMedia({ id: "used-image" });
		const hiddenTrackElement = createMediaElement({
			id: "element-on-hidden-track",
			mediaId: media.id,
		});
		const hiddenElement = createMediaElement({
			hidden: true,
			id: "hidden-element",
			mediaId: media.id,
		});
		const snapshot = createSnapshot({
			media: [media],
			timelineDurationByElementId: {
				[hiddenElement.id]: 2,
				[hiddenTrackElement.id]: 2,
			},
			tracks: [
				{
					elements: [hiddenTrackElement],
					hidden: true,
					id: "hidden-track",
					name: "Hidden track",
					type: "media",
				},
				{
					elements: [hiddenElement],
					hidden: false,
					id: "visible-track",
					name: "Visible track",
					type: "media",
				},
			],
		});

		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/hidden-content",
			snapshot,
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.tracks).toEqual([]);
		expect(result.issues).toEqual([
			{
				code: "UNSUPPORTED_HIDDEN_TRACK",
				message:
					"Track hidden-track is hidden in QCut and cannot be preserved as a disabled track in the target draft.",
				severity: "error",
				trackId: "hidden-track",
			},
			{
				code: "UNSUPPORTED_HIDDEN_ELEMENT",
				elementId: "hidden-element",
				message:
					"Element hidden-element on track visible-track is hidden in QCut and cannot be preserved as a disabled element in the target draft.",
				severity: "error",
				trackId: "visible-track",
			},
		]);
	});

	it("warns deterministically for media-bin assets that are not on the timeline", () => {
		const usedMedia = createImageMedia({ id: "used-image" });
		const unusedMediaA = createImageMedia({ id: "unused-a" });
		const unusedMediaB = createImageMedia({ id: "unused-b" });
		const element = createMediaElement({
			id: "visible-element",
			mediaId: usedMedia.id,
		});
		const track: TimelineTrack = {
			elements: [element],
			id: "visible-track",
			name: "Visible track",
			type: "media",
		};
		const firstSnapshot = createSnapshot({
			media: [unusedMediaB, usedMedia, unusedMediaA],
			timelineDurationByElementId: { [element.id]: 2 },
			tracks: [track],
		});
		const secondSnapshot = createSnapshot({
			media: [unusedMediaA, unusedMediaB, usedMedia],
			timelineDurationByElementId: { [element.id]: 2 },
			tracks: [track],
		});

		const firstResult = buildJianyingDraft({
			draftOutputDirectory: "/exports/unused-media-first",
			snapshot: firstSnapshot,
			targetPlatform: "macos",
		});
		const secondResult = buildJianyingDraft({
			draftOutputDirectory: "/exports/unused-media-second",
			snapshot: secondSnapshot,
			targetPlatform: "macos",
		});
		const expectedIssues = [
			{
				code: "UNEXPORTED_MEDIA_BIN_ASSET",
				mediaId: "unused-a",
				message:
					"Media unused-a is not referenced by a timeline media or sticker element, so its media-bin asset will not be copied into the target draft.",
				severity: "warning",
			},
			{
				code: "UNEXPORTED_MEDIA_BIN_ASSET",
				mediaId: "unused-b",
				message:
					"Media unused-b is not referenced by a timeline media or sticker element, so its media-bin asset will not be copied into the target draft.",
				severity: "warning",
			},
		];

		expect(firstResult.canWrite).toBe(true);
		expect(firstResult.assets.map(({ mediaId }) => mediaId)).toEqual([
			usedMedia.id,
		]);
		expect(firstResult.issues).toEqual(expectedIssues);
		expect(secondResult.issues).toEqual(expectedIssues);
	});

	it("blocks disabled media controls that retain editable visual state", () => {
		const base = createMediaElement({
			id: "configured-media",
			mediaId: "used-image",
		});
		const configuredLut = createDisabledConfiguredColor();
		configuredLut.basic.brightness = 0;
		configuredLut.lut.cube = {
			domainMax: [1, 1, 1],
			domainMin: [0, 0, 0],
			size: 2,
			values: Array.from({ length: 24 }, (_, index) => index / 23),
		};
		const configuredFilter = createDisabledConfiguredColor();
		configuredFilter.basic.brightness = 0;
		configuredFilter.filter = {
			intensity: 0,
			presetId: "vivid",
			presetVersion: 1,
		};
		const cases: MediaElement[] = [
			{ ...base, color: createDisabledConfiguredColor() },
			{ ...base, color: configuredLut },
			{ ...base, color: configuredFilter },
			{
				...base,
				mask: {
					centerX: 0.5,
					centerY: 0.5,
					enabled: false,
					feather: 0,
					height: 0.8,
					invert: false,
					rotation: 0,
					type: "rectangle",
					width: 0.8,
				},
			},
			{
				...base,
				chromaKey: {
					blend: 0.1,
					cleanup: 0.6,
					color: "#00ff00",
					enabled: false,
					shadow: 0,
					similarity: 0.2,
					spill: 0,
				},
			},
			{
				...base,
				customCutout: {
					applyStrokes: true,
					enabled: false,
					status: "ready",
					strokes: [],
				},
			},
			{
				...base,
				animationInDuration: 1.25,
				animationInType: "none",
			},
		];

		for (const element of cases) {
			expect(collectLossyMediaFeatureIssues({ element })).toContainEqual(
				expect.objectContaining({
					code: "UNSUPPORTED_MEDIA_FEATURE",
					severity: "error",
				})
			);
		}
	});

	it("does not treat the neutral no-filter intensity as an edit", () => {
		const color = createDisabledConfiguredColor();
		color.basic.brightness = 0;
		color.filter.intensity = 100;
		const element = {
			...createMediaElement({
				id: "neutral-color",
				mediaId: "used-image",
			}),
			color,
		};

		expect(collectLossyMediaFeatureIssues({ element })).toEqual([]);
	});

	it("warns deterministically when visible empty tracks disappear", () => {
		const snapshot = createSnapshot({
			media: [],
			timelineDurationByElementId: {},
			tracks: [
				{
					elements: [],
					id: "z-empty-effect",
					locked: true,
					muted: true,
					name: "Effects staging",
					type: "effect",
				},
				{
					elements: [],
					id: "a-empty-media",
					name: "B-roll staging",
					type: "media",
				},
			],
		});

		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/empty-tracks",
			snapshot,
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks).toEqual([]);
		expect(result.issues).toEqual([
			{
				code: "UNEXPORTED_EMPTY_TRACK",
				message:
					"Empty track a-empty-media and its name, media role, lock, and mute state are not represented in the target draft.",
				severity: "warning",
				trackId: "a-empty-media",
			},
			{
				code: "UNEXPORTED_EMPTY_TRACK",
				message:
					"Empty track z-empty-effect and its name, effect role, lock, and mute state are not represented in the target draft.",
				severity: "warning",
				trackId: "z-empty-effect",
			},
		]);
	});
});

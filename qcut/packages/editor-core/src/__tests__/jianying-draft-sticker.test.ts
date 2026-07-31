import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "../jianying-draft/index.js";
import type {
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";
import type { StickerElement, TimelineTrack } from "../types/timeline.js";

const imageMedia: QCutDraftExportMedia = {
	height: 200,
	id: "sticker-image",
	name: "sticker.png",
	sourcePath: "/source/sticker.png",
	type: "image",
	width: 400,
};

function createSticker({
	id = "sticker-element",
	overrides = {},
}: {
	id?: string;
	overrides?: Partial<StickerElement>;
} = {}): StickerElement {
	return {
		duration: 4,
		height: 20,
		id,
		maintainAspectRatio: false,
		mediaId: imageMedia.id,
		name: imageMedia.name,
		opacity: 0.7,
		rotation: 15,
		startTime: 1.5,
		stickerId: `instance-${id}`,
		trimEnd: 0.5,
		trimStart: 0.5,
		type: "sticker",
		width: 20,
		x: 75,
		y: 25,
		...overrides,
	};
}

function createStickerTrack({
	element,
	id = "sticker-track",
	order = 0,
}: {
	element: StickerElement;
	id?: string;
	order?: number;
}): TimelineTrack {
	return {
		elements: [element],
		id,
		name: id,
		order,
		type: "sticker",
	};
}

function createSnapshot({
	canvasHeight = 1080,
	canvasWidth = 1920,
	media = [imageMedia],
	tracks,
}: {
	canvasHeight?: number;
	canvasWidth?: number;
	media?: QCutDraftExportMedia[];
	tracks: TimelineTrack[];
}): QCutDraftExportSnapshotV1 {
	return {
		media,
		project: {
			backgroundColor: "#00000000",
			backgroundType: "color",
			fps: 30,
			height: canvasHeight,
			id: "sticker-project",
			name: "Sticker Export",
			sceneId: "sticker-scene",
			width: canvasWidth,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks,
	};
}

function buildStickerDraft({
	element,
	media,
	canvasHeight,
	canvasWidth,
}: {
	element: StickerElement;
	media?: QCutDraftExportMedia[];
	canvasHeight?: number;
	canvasWidth?: number;
}) {
	return buildJianyingDraft({
		draftOutputDirectory: "/exports/stickers",
		snapshot: createSnapshot({
			canvasHeight,
			canvasWidth,
			media,
			tracks: [createStickerTrack({ element })],
		}),
		targetPlatform: "macos",
	});
}

describe("JianYing static local sticker mapping", () => {
	it("maps landscape short-side geometry to a stretched photo overlay", () => {
		const result = buildStickerDraft({ element: createSticker() });

		expect(result.canWrite).toBe(true);
		expect(result.issues).toEqual([
			expect.objectContaining({
				code: "STICKER_EXPORTED_AS_IMAGE_OVERLAY",
				severity: "warning",
			}),
		]);
		expect(result.assets).toEqual([
			expect.objectContaining({
				mediaId: imageMedia.id,
				type: "image",
			}),
		]);
		expect(result.content.materials.videos).toEqual([
			expect.objectContaining({
				height: 200,
				type: "photo",
				width: 400,
			}),
		]);
		expect(result.content.tracks[0]?.type).toBe("video");
		expect(result.content.tracks[0]?.segments[0]).toMatchObject({
			clip: {
				alpha: 0.7,
				rotation: 15,
				scale: { x: 0.1125, y: 0.225 },
				transform: { x: 0.5, y: 0.5 },
			},
			source_timerange: { duration: 3_000_000, start: 0 },
			target_timerange: { duration: 3_000_000, start: 1_500_000 },
			uniform_scale: { on: false, value: 1 },
		});
	});

	it("maps portrait contain geometry with a uniform source-derived scale", () => {
		const element = createSticker({
			overrides: {
				height: 40,
				maintainAspectRatio: true,
				width: 30,
				x: 20,
				y: 75,
			},
		});
		const result = buildStickerDraft({
			canvasHeight: 1920,
			canvasWidth: 1080,
			element,
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks[0]?.segments[0]?.clip).toMatchObject({
			scale: { x: 0.3, y: 0.3 },
			transform: { x: -0.6, y: -0.5 },
		});
		expect(result.content.tracks[0]?.segments[0]?.uniform_scale).toEqual({
			on: true,
			value: 1,
		});
	});

	it("shares repeated image materials and assets while preserving layer order", () => {
		const top = createSticker({
			id: "top-sticker",
			overrides: { startTime: 0, trimEnd: 0, trimStart: 0 },
		});
		const bottom = createSticker({
			id: "bottom-sticker",
			overrides: { startTime: 0, trimEnd: 0, trimStart: 0 },
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/stickers",
			snapshot: createSnapshot({
				tracks: [
					createStickerTrack({ element: top, id: "top-track", order: 0 }),
					createStickerTrack({
						element: bottom,
						id: "bottom-track",
						order: 1,
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks.map(({ name }) => name)).toEqual([
			"bottom-track",
			"top-track",
		]);
		expect(result.content.materials.videos).toHaveLength(1);
		expect(result.assets).toHaveLength(1);
		expect(result.content.materials.speeds).toHaveLength(2);
		expect(
			new Set(
				result.content.tracks.map(({ segments }) => segments[0]?.material_id)
			).size
		).toBe(1);
		expect(
			result.issues.filter(
				({ code }) => code === "STICKER_EXPORTED_AS_IMAGE_OVERLAY"
			)
		).toHaveLength(2);
	});

	it("blocks missing, non-image, and malformed sticker media", () => {
		const missing = buildStickerDraft({
			element: createSticker({ overrides: { mediaId: "missing" } }),
			media: [],
		});
		const videoMedia: QCutDraftExportMedia = {
			duration: 4,
			height: 200,
			id: "video-sticker",
			name: "animated.mp4",
			sourcePath: "/source/animated.mp4",
			type: "video",
			width: 400,
		};
		const nonImage = buildStickerDraft({
			element: createSticker({ overrides: { mediaId: videoMedia.id } }),
			media: [videoMedia],
		});
		const malformedMedia: QCutDraftExportMedia = {
			...imageMedia,
			sourcePath: "",
			width: 0,
		};
		const malformed = buildStickerDraft({
			element: createSticker(),
			media: [malformedMedia],
		});

		expect(missing.canWrite).toBe(false);
		expect(missing.issues.map(({ code }) => code)).toEqual([
			"MISSING_STICKER_MEDIA",
		]);
		expect(nonImage.canWrite).toBe(false);
		expect(nonImage.issues.map(({ code }) => code)).toEqual([
			"UNSUPPORTED_STICKER_MEDIA_TYPE",
		]);
		expect(malformed.canWrite).toBe(false);
		expect(malformed.issues.map(({ code }) => code)).toEqual([
			"INVALID_STICKER_MEDIA_METADATA",
		]);
		for (const result of [missing, nonImage, malformed]) {
			expect(result.assets).toEqual([]);
			expect(result.content.tracks).toEqual([]);
		}
	});

	it.each([
		{
			code: "INVALID_STICKER_VALUE",
			name: "invalid geometry",
			overrides: { width: 0 },
		},
		{
			code: "UNSUPPORTED_STICKER_PERSPECTIVE",
			name: "perspective",
			overrides: {
				perspective: {
					bottomLeftX: 0,
					bottomLeftY: 1,
					bottomRightX: 1,
					bottomRightY: 1,
					topLeftX: 0.1,
					topLeftY: 0,
					topRightX: 1,
					topRightY: 0,
				},
			},
		},
		{
			code: "UNSUPPORTED_STICKER_ANIMATION",
			name: "entrance animation",
			overrides: { animationInType: "fade" },
		},
		{
			code: "UNSUPPORTED_STICKER_ANIMATION",
			name: "exit animation",
			overrides: { animationOutType: "zoom-out" },
		},
		{
			code: "UNSUPPORTED_STICKER_ANIMATION",
			name: "loop animation",
			overrides: { animationLoopType: "pulse" },
		},
		{
			code: "UNSUPPORTED_STICKER_ANIMATION",
			name: "disabled entrance animation with retained duration",
			overrides: { animationInDuration: 1.25, animationInType: "none" },
		},
		{
			code: "UNSUPPORTED_STICKER_ANIMATION",
			name: "disabled exit animation with retained duration",
			overrides: { animationOutDuration: 1.25, animationOutType: "none" },
		},
		{
			code: "UNSUPPORTED_STICKER_ANIMATION",
			name: "disabled loop animation with retained intensity",
			overrides: {
				animationLoopIntensity: 0.9,
				animationLoopType: "none",
			},
		},
		{
			code: "UNSUPPORTED_STICKER_KEYFRAMES",
			name: "keyframes",
			overrides: {
				keyframes: {
					opacity: [{ easing: "linear", frame: 0, id: "key-1", value: 0 }],
				},
			},
		},
		{
			code: "UNSUPPORTED_STICKER_TRACKING",
			name: "tracking",
			overrides: {
				tracking: {
					anchor: { centerX: 50, centerY: 50, height: 20, width: 20 },
					followScale: true,
					mode: "motion",
					targetElementId: "subject",
					targetMaskId: "mask",
				},
			},
		},
		{
			code: "UNSUPPORTED_STICKER_VISUAL_STATE",
			name: "effects",
			overrides: { effectIds: ["effect-1"] },
		},
	] as Array<{
		code: string;
		name: string;
		overrides: Partial<StickerElement>;
	}>)("blocks $name instead of silently dropping it", ({ code, overrides }) => {
		const result = buildStickerDraft({
			element: createSticker({ overrides }),
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code, severity: "error" })
		);
		expect(result.issues).not.toContainEqual(
			expect.objectContaining({
				code: "STICKER_EXPORTED_AS_IMAGE_OVERLAY",
			})
		);
		expect(result.assets).toEqual([]);
		expect(result.content.tracks).toEqual([]);
	});

	it("reports sticker organization metadata and blocks legacy z-index", () => {
		const result = buildStickerDraft({
			element: createSticker({
				overrides: {
					colorLabel: "violet",
					groupId: "group-1",
					name: "Callout",
					templateBinding: {
						instanceId: "instance-1",
						slotId: "sticker",
						templateId: "template-1",
						templateVersion: "1.0.0",
					},
					zIndex: 7,
				},
			}),
		});

		expect(result.canWrite).toBe(false);
		expect(
			result.issues.map(({ code, message, severity }) => ({
				code,
				message,
				severity,
			}))
		).toEqual([
			{
				code: "UNSUPPORTED_STICKER_METADATA",
				message: "Sticker grouping metadata is not represented in the draft.",
				severity: "warning",
			},
			{
				code: "UNSUPPORTED_STICKER_METADATA",
				message:
					"Sticker template binding metadata is not represented in the draft.",
				severity: "warning",
			},
			{
				code: "UNSUPPORTED_STICKER_METADATA",
				message: "Sticker color labels are not represented in the draft.",
				severity: "warning",
			},
			{
				code: "UNSUPPORTED_STICKER_METADATA",
				message:
					"Custom sticker names are not represented separately from media names.",
				severity: "warning",
			},
			{
				code: "UNSUPPORTED_STICKER_Z_INDEX",
				message:
					"Legacy sticker z-index can change compositing order and is not mapped.",
				severity: "error",
			},
		]);
		expect(result.assets).toEqual([]);
		expect(result.content.tracks).toEqual([]);
	});
});

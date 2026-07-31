import { describe, expect, it } from "vitest";
import {
	buildCapCut81Draft,
	createDeterministicJianyingId,
} from "../jianying-draft/index.js";
import type { ColorCubeLut, MediaColorSettings } from "../types/color.js";
import type {
	MediaElement,
	MediaMask,
	TimelineTrack,
} from "../types/timeline.js";
import type { QCutDraftExportSnapshotV1 } from "../jianying-draft/types.js";

const PLACEHOLDER_ID = "11111111-2222-4333-8444-555555555555";
const TIMELINE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function createIdentityCube(): ColorCubeLut {
	return {
		domainMax: [1, 1, 1],
		domainMin: [0, 0, 0],
		size: 2,
		values: [
			0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
		],
	};
}

function createPureLutColor(): MediaColorSettings {
	const range = { hue: 0, luminance: 0, saturation: 0 };
	const curve = { points: [], samples: [] };
	const wheel = { luminance: 0, x: 0, y: 0 };
	return {
		basic: {
			blacks: 0,
			brightness: 0,
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
		enabled: true,
		filter: { intensity: 0, presetId: "none", presetVersion: 1 },
		hsl: {
			enabled: false,
			ranges: {
				blue: range,
				cyan: range,
				green: range,
				magenta: range,
				orange: range,
				purple: range,
				red: range,
				yellow: range,
			},
		},
		keyframes: {},
		lut: {
			cube: createIdentityCube(),
			enabled: true,
			intensity: 80,
			name: "QCut Vivid",
			presetId: "qcut-vivid",
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
			hueVsHue: curve,
			hueVsLuminance: curve,
			hueVsSaturation: curve,
			luminanceVsSaturation: curve,
			mix: 100,
			saturationVsSaturation: curve,
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
			highlights: wheel,
			midtones: wheel,
			mode: "tonal",
			offset: wheel,
			shadows: wheel,
			strength: 100,
		},
	};
}

function createMask(): MediaMask {
	return {
		blendMode: "add",
		centerX: 0.625,
		centerY: 0.75,
		enabled: true,
		expansion: 0,
		feather: 0,
		height: 0.4,
		id: "mask-1",
		invert: false,
		opacity: 1,
		rotation: 30,
		roundness: 0,
		stroke: {
			color: "#ffffff",
			glow: 0,
			offsetX: 0,
			offsetY: 0,
			opacity: 1,
			style: "none",
			width: 0,
		},
		type: "ellipse",
		width: 0.3,
	};
}

function createMediaElement({
	color = createPureLutColor(),
	id = "clip-1",
	mask = createMask(),
	startTime = 1,
}: {
	color?: MediaColorSettings;
	id?: string;
	mask?: MediaMask;
	startTime?: number;
} = {}): MediaElement {
	return {
		color,
		duration: 8,
		id,
		mask,
		mediaId: "media-1",
		name: "clip.mov",
		playbackRate: 2,
		startTime,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createSnapshot({
	element = createMediaElement(),
	extraTrack,
}: {
	element?: MediaElement;
	extraTrack?: TimelineTrack;
} = {}): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				duration: 8,
				height: 720,
				id: "media-1",
				name: "clip.mov",
				sourcePath: "/private/clip.mov",
				type: "video",
				width: 1280,
			},
		],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 720,
			id: "project-1",
			name: "CapCut exact features",
			sceneId: "scene-1",
			width: 1280,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {
			[element.id]: 4,
			...(extraTrack
				? Object.fromEntries(
						extraTrack.elements.map((candidate) => [
							candidate.id,
							candidate.duration,
						])
					)
				: {}),
		},
		tracks: [
			{
				elements: [element],
				id: "track-1",
				name: "Video",
				order: 0,
				type: "media",
			},
			...(extraTrack ? [extraTrack] : []),
		],
	};
}

function build({ snapshot }: { snapshot: QCutDraftExportSnapshotV1 }) {
	return buildCapCut81Draft({
		createdAtUnixSeconds: 123,
		draftOutputDirectory: "/portable/export",
		placeholderId: PLACEHOLDER_ID,
		snapshot,
		targetPlatform: "macos",
		timelineId: TIMELINE_ID,
	});
}

describe("CapCut 8.1 exact feature build", () => {
	it("integrates a static mask and a playback-aware custom LUT track", () => {
		const snapshot = createSnapshot();
		const before = structuredClone(snapshot);
		const result = build({ snapshot });

		expect(result.canWrite).toBe(true);
		expect(result.content).not.toBeNull();
		expect(result.issues).toEqual([]);
		expect(snapshot).toEqual(before);
		expect(result.generatedAssets).toHaveLength(1);
		expect(result.generatedAssets[0]).toMatchObject({
			kind: "generated-lut",
			relativePath: expect.stringMatching(/^assets\/lut\/.+\.cube$/),
		});

		const content = result.content!;
		expect(content.materials.common_mask).toHaveLength(1);
		expect(content.materials.effects).toContainEqual(
			expect.objectContaining({ type: "lut", value: 0.8 })
		);
		expect(content.materials.placeholders).toContainEqual(
			expect.objectContaining({ name: "Adjust1", type: "adjust" })
		);
		const adjustTrack = content.tracks.find(({ type }) => type === "adjust");
		expect(adjustTrack?.segments[0]).toMatchObject({
			source_timerange: null,
			target_timerange: { duration: 4_000_000, start: 1_000_000 },
			track_render_index: 1,
		});

		const mediaSegmentId = createDeterministicJianyingId({
			namespace: "segment",
			sourceId: "clip-1",
		});
		const mediaSegment = content.tracks
			.flatMap(({ segments }) => segments)
			.find(({ id }) => id === mediaSegmentId);
		const mask = content.materials.common_mask[0] as {
			config: { centerX: number; centerY: number };
			id: string;
		};
		expect(mediaSegment?.extra_material_refs).toContain(mask.id);
		expect(mask.config).toMatchObject({ centerX: 0.25, centerY: 0.5 });
	});

	it("requires explicit acceptance when a custom mask name is downgraded", () => {
		const mask = createMask();
		mask.name = "Subject window";
		const element = createMediaElement({ color: undefined, mask });
		const result = build({ snapshot: createSnapshot({ element }) });

		expect(result.canWrite).toBe(true);
		expect(result.issues).toContainEqual({
			code: "UNEXPORTED_MASK_NAME",
			elementId: element.id,
			mediaId: element.mediaId,
			message:
				"CapCut 8.1 uses the built-in Rectangle or Circle material name, so the custom QCut mask name is not preserved.",
			severity: "warning",
			trackId: "track-1",
		});
	});

	it("blocks a clip LUT when another visual layer overlaps", () => {
		const overlay: MediaElement = {
			duration: 2,
			id: "overlay",
			mediaId: "media-1",
			name: "overlay",
			startTime: 2,
			trimEnd: 0,
			trimStart: 0,
			type: "media",
		};
		const result = build({
			snapshot: createSnapshot({
				extraTrack: {
					elements: [overlay],
					id: "overlay-track",
					name: "Overlay",
					order: 1,
					type: "media",
				},
			}),
		});

		expect(result.canWrite).toBe(false);
		expect(result.content).toBeNull();
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_LUT_OVERLAP",
				elementId: "clip-1",
			})
		);
	});

	it("blocks non-LUT color changes instead of dropping them", () => {
		const color = createPureLutColor();
		color.basic.sharpness = 8;
		const result = build({
			snapshot: createSnapshot({
				element: createMediaElement({ color }),
			}),
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_COLOR",
				severity: "error",
			})
		);
	});

	it("blocks latent state on an inactive mask", () => {
		const result = build({
			snapshot: createSnapshot({
				element: createMediaElement({
					color: undefined,
					mask: { ...createMask(), feather: 0.2, type: "none" },
				}),
			}),
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_INACTIVE_MASK_STATE",
			})
		);
	});
});

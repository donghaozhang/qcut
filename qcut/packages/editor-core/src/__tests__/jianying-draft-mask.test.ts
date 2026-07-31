import { describe, expect, it } from "vitest";
import {
	CAPCUT_8_1_MASK_RESOURCE_RESOLUTION_NOTE,
	CAPCUT_8_1_STATIC_MASK_METADATA,
	mapMediaElementStaticMaskToCapCut81,
	mapStaticMediaMaskToCapCut81,
} from "../jianying-draft/mask-mapping.js";
import {
	resolveConfiguredMediaMasks,
	validateCapCut81MediaMaskElement,
	validateCapCut81StaticMediaMask,
} from "../jianying-draft/mask-validation.js";
import type {
	MediaElement,
	MediaMask,
	TimelineTrack,
} from "../types/timeline.js";

function createMask({ ...overrides }: Partial<MediaMask> = {}): MediaMask {
	return {
		blendMode: "add",
		centerX: 0.5,
		centerY: 0.5,
		enabled: true,
		expansion: 0,
		feather: 0,
		height: 0.5,
		id: "mask-1",
		invert: false,
		opacity: 1,
		rotation: 0,
		roundness: 0,
		type: "rectangle",
		width: 0.28,
		...overrides,
	};
}

function createElement({
	mask,
	masks,
}: {
	mask?: MediaMask;
	masks?: MediaMask[];
} = {}): MediaElement {
	return {
		duration: 3,
		id: "element-1",
		mask,
		masks,
		mediaId: "media-1",
		name: "clip.mov",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createTrack({ element }: { element: MediaElement }): TimelineTrack {
	return {
		elements: [element],
		id: "track-1",
		name: "Main",
		type: "media",
	};
}

describe("CapCut 8.1 static mask mapping", () => {
	it("reproduces the verified rectangle common_mask schema with a portable path", () => {
		const material = mapStaticMediaMaskToCapCut81({
			elementId: "element-1",
			mask: createMask(),
		});

		expect(material).toEqual({
			id: "684b6884-1843-8b70-88eb-6c767585aa94",
			type: "mask",
			category: "video",
			category_name: "",
			category_id: "",
			panel: "",
			is_old_version: false,
			resource_id: "7374021450748924432",
			constant_material_id: "81aa682d-d5d2-ad81-a326-9ff73fc7569d",
			name: "Rectangle",
			resource_type: "rectangle",
			path: "",
			position_info: "",
			config: {
				width: 0.28,
				height: 0.5,
				centerX: 0,
				centerY: 0,
				rotation: 0,
				feather: 0,
				expansion: 0,
				roundCorner: 0,
				invert: false,
				aspectRatio: 1,
			},
			text_config: {
				content: "",
				font_name: "",
				font_path: "",
				font_resource_id: "",
				font_size: 15,
				bold_width: 0,
				italic_degree: 0,
				has_underline: false,
				line_gap: 0,
				char_spacing: 0,
				align_type: 15,
				scale: 1,
			},
			platform: "all",
			loader_work_space: "",
			track_segment: "",
			contour_path: null,
			source_platform: 0,
		});
		expect(CAPCUT_8_1_STATIC_MASK_METADATA.rectangle.resourceId).toBe(
			"7374021450748924432"
		);
		expect(CAPCUT_8_1_MASK_RESOURCE_RESOLUTION_NOTE).toContain(
			"reopen the draft in CapCut 8.1"
		);
	});

	it("maps QCut ellipse geometry to the verified Circle resource", () => {
		const material = mapStaticMediaMaskToCapCut81({
			elementId: "element-2",
			mask: createMask({
				centerX: 0.578125,
				centerY: 0.5694444444444444,
				height: 0.4166666666666667,
				id: "mask-circle",
				rotation: 30,
				type: "ellipse",
				width: 0.3125,
			}),
		});

		expect(material).toMatchObject({
			name: "Circle",
			resource_id: "7374021188315517456",
			resource_type: "circle",
			config: {
				centerX: 0.15625,
				centerY: 0.13888888888888884,
				height: 0.4166666666666667,
				rotation: 30,
				width: 0.3125,
			},
		});
	});

	it("accepts arbitrary finite static geometry without quantization", () => {
		const mask = createMask({
			centerX: -0.25,
			centerY: 2.25,
			height: 1.75,
			rotation: -721.125,
			width: 2.5,
		});

		expect(
			mapStaticMediaMaskToCapCut81({
				elementId: "arbitrary-geometry",
				mask,
			}).config
		).toMatchObject({
			centerX: -1.5,
			centerY: 3.5,
			height: 1.75,
			rotation: -721.125,
			width: 2.5,
		});
	});

	it("uses stable, namespace-separated material ids", () => {
		const options = {
			elementId: "stable-element",
			mask: createMask({ id: "stable-mask" }),
		};
		const first = mapStaticMediaMaskToCapCut81(options);
		const second = mapStaticMediaMaskToCapCut81(options);
		const other = mapStaticMediaMaskToCapCut81({
			...options,
			elementId: "other-element",
		});

		expect(first).toEqual(second);
		expect(first.id).not.toBe(first.constant_material_id);
		expect(other.id).not.toBe(first.id);
		expect(first.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
		);
		expect(first.constant_material_id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
		);
	});

	it("returns the exact common_mask id that the segment must reference", () => {
		const element = createElement({ masks: [createMask()] });
		const mapped = mapMediaElementStaticMaskToCapCut81({
			element,
			track: createTrack({ element }),
		});
		if (!mapped) throw new Error("Missing mapped mask");

		const segment = { extra_material_refs: [mapped.extraMaterialRef] };
		expect(segment.extra_material_refs).toEqual([mapped.material.id]);
		expect(mapped.material.type).toBe("mask");
	});
});

describe("CapCut 8.1 static mask validation", () => {
	it("accepts one enabled add-blend rectangle or ellipse", () => {
		for (const type of ["rectangle", "ellipse"] as const) {
			const element = createElement({ masks: [createMask({ type })] });
			expect(
				validateCapCut81MediaMaskElement({
					element,
					track: createTrack({ element }),
				})
			).toEqual([]);
		}
	});

	it("uses the canonical mask stack when present and otherwise the legacy mask", () => {
		const legacy = createMask({ id: "legacy" });
		const canonical = createMask({ id: "canonical", type: "ellipse" });

		expect(
			resolveConfiguredMediaMasks({ element: createElement({ mask: legacy }) })
		).toEqual([legacy]);
		expect(
			resolveConfiguredMediaMasks({
				element: createElement({ mask: legacy, masks: [canonical] }),
			})
		).toEqual([canonical]);
		expect(
			resolveConfiguredMediaMasks({
				element: createElement({
					mask: legacy,
					masks: [{ ...canonical, type: "none" }],
				}),
			})
		).toEqual([]);
	});

	it("allows a neutral inactive mask but blocks retained inactive state", () => {
		const neutral = createElement({
			mask: createMask({
				height: 0.8,
				type: "none",
				width: 0.8,
			}),
		});
		expect(
			validateCapCut81MediaMaskElement({
				element: neutral,
				track: createTrack({ element: neutral }),
			})
		).toEqual([]);

		for (const mask of [
			createMask({
				enabled: false,
				height: 0.8,
				type: "none",
				width: 0.8,
			}),
			createMask({
				feather: 0.2,
				height: 0.8,
				type: "none",
				width: 0.8,
			}),
			createMask({
				height: 0.8,
				keyframes: {
					centerX: [
						{ easing: "linear", frame: 0, id: "inactive-kf", value: 0.5 },
					],
				},
				type: "none",
				width: 0.8,
			}),
		]) {
			const element = createElement({ mask });
			expect(
				validateCapCut81MediaMaskElement({
					element,
					track: createTrack({ element }),
				})
			).toContainEqual(
				expect.objectContaining({
					code: "UNSUPPORTED_CAPCUT_8_1_INACTIVE_MASK_STATE",
					severity: "error",
				})
			);
		}
	});

	it("does not let a neutral inactive entry hide a canonical active mask", () => {
		const element = createElement({
			masks: [
				createMask({
					height: 0.8,
					type: "none",
					width: 0.8,
				}),
				createMask({ id: "active-mask", type: "ellipse" }),
			],
		});

		expect(
			validateCapCut81MediaMaskElement({
				element,
				track: createTrack({ element }),
			})
		).toEqual([]);
		expect(
			mapMediaElementStaticMaskToCapCut81({
				element,
				track: createTrack({ element }),
			})?.material.resource_type
		).toBe("circle");
	});

	it("rejects multiple configured masks even when one is disabled", () => {
		const element = createElement({
			masks: [
				createMask(),
				createMask({ enabled: false, id: "mask-2", type: "ellipse" }),
			],
		});

		expect(
			validateCapCut81MediaMaskElement({
				element,
				track: createTrack({ element }),
			})
		).toEqual([
			{
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_COUNT",
				elementId: "element-1",
				mediaId: "media-1",
				message:
					"CapCut 8.1 export supports exactly one configured mask per media element.",
				severity: "error",
				trackId: "track-1",
			},
		]);
	});

	it.each([
		["disabled mask", { enabled: false }],
		["subtract blend", { blendMode: "subtract" as const }],
		["intersect blend", { blendMode: "intersect" as const }],
	])("rejects %s", (_label, overrides) => {
		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask: createMask(overrides),
			})
		).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_STATE",
				severity: "error",
			})
		);
	});

	it.each([
		"none",
		"linear",
		"mirror",
		"pen",
		"text",
		"star",
		"heart",
		"person",
		"object",
	] as const)("rejects unverified %s masks", (type) => {
		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask: createMask({ type }),
			})
		).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_TYPE",
				severity: "error",
			})
		);
	});

	it.each([
		["centerX NaN", { centerX: Number.NaN }],
		["centerY infinite", { centerY: Number.POSITIVE_INFINITY }],
		["width zero", { width: 0 }],
		["width negative", { width: -0.1 }],
		["height zero", { height: 0 }],
		["height negative", { height: -0.1 }],
		["rotation NaN", { rotation: Number.NaN }],
	])("rejects invalid geometry: %s", (_label, overrides) => {
		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask: createMask(overrides),
			})
		).toContainEqual(
			expect.objectContaining({
				code: "INVALID_CAPCUT_8_1_MASK_GEOMETRY",
				severity: "error",
			})
		);
	});

	it.each([
		["feather", { feather: 0.1 }],
		["roundness", { roundness: 0.1 }],
		["expansion", { expansion: 0.1 }],
		["opacity", { opacity: 0.9 }],
		["inversion", { invert: true }],
		[
			"keyframes",
			{
				keyframes: {
					centerX: [
						{ easing: "linear" as const, frame: 0, id: "kf-1", value: 0.5 },
					],
				},
			},
		],
		[
			"tracking",
			{ tracking: { direction: "forward" as const, status: "idle" as const } },
		],
		["generated mask media", { sourceMediaId: "alpha-1" }],
		["points", { points: [{ x: 0, y: 0 }] }],
		["text", { text: "Mask" }],
		["font metadata", { fontFamily: "Inter" }],
		[
			"visible stroke",
			{
				stroke: {
					color: "#ffffff",
					glow: 0,
					offsetX: 0,
					offsetY: 0,
					opacity: 1,
					style: "solid" as const,
					width: 1,
				},
			},
		],
	])("rejects unsupported static state: %s", (_label, overrides) => {
		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask: createMask(overrides),
			})
		).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_FEATURE",
				severity: "error",
			})
		);
	});

	it("accepts the normalized neutral stroke and ignores its inactive color", () => {
		const mask = createMask({
			stroke: {
				color: "#ff00ff",
				glow: 0,
				offsetX: 0,
				offsetY: 0,
				opacity: 1,
				style: "none",
				width: 0,
			},
		});

		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask,
			})
		).toEqual([]);
	});

	it.each([
		["width", { width: 0.01 }],
		["opacity", { opacity: 0.99 }],
		["glow", { glow: 0.01 }],
		["horizontal offset", { offsetX: 0.01 }],
		["vertical offset", { offsetY: 0.01 }],
	] as const)("rejects non-neutral stroke %s", (_label, strokeOverride) => {
		const mask = createMask({
			stroke: {
				color: "#ffffff",
				glow: 0,
				offsetX: 0,
				offsetY: 0,
				opacity: 1,
				style: "none",
				width: 0,
				...strokeOverride,
			},
		});

		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask,
			})
		).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_CAPCUT_8_1_MASK_FEATURE",
			})
		);
	});

	it("allows empty latent collections and strings", () => {
		const mask = createMask({
			keyframes: { centerX: [] },
			points: [],
			sourceMediaId: "",
			text: "",
		});

		expect(
			validateCapCut81StaticMediaMask({
				elementId: "element-1",
				mask,
			})
		).toEqual([]);
	});

	it("makes the mapper fail closed when validation is skipped", () => {
		expect(() =>
			mapStaticMediaMaskToCapCut81({
				elementId: "element-1",
				mask: createMask({ invert: true }),
			})
		).toThrow(/UNSUPPORTED_CAPCUT_8_1_MASK_FEATURE/);
	});
});

import { describe, expect, it } from "vitest";
import {
	CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER,
	mapMediaElementLutToCapCut81,
} from "../jianying-draft/capcut-8-1-lut.js";
import {
	serializeColorCubeLut,
	validateColorCubeLut,
} from "../jianying-draft/color-cube-lut.js";
import type { ColorCubeLut, MediaColorSettings } from "../types/color.js";
import type { MediaElement } from "../types/timeline.js";

const PLACEHOLDER_ID = "11111111-2222-4333-8444-555555555555";

function createIdentityCube(): ColorCubeLut {
	return {
		size: 2,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values: [
			0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
		],
	};
}

function createColor({
	cube = createIdentityCube(),
	intensity = 80,
}: {
	cube?: ColorCubeLut;
	intensity?: number;
} = {}): MediaColorSettings {
	const neutralRange = { hue: 0, luminance: 0, saturation: 0 };
	const secondaryCurve = { points: [], samples: [] };
	const neutralWheel = { luminance: 0, x: 0, y: 0 };
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
		keyframes: {},
		lut: {
			cube,
			enabled: true,
			intensity,
			name: "Vivid / 旅行?.cube",
			presetId: "vivid",
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

function createMediaElement({
	color = createColor(),
	duration = 2.5,
	startTime = 1.25,
}: {
	color?: MediaColorSettings;
	duration?: number;
	startTime?: number;
} = {}): MediaElement {
	return {
		color,
		duration,
		id: "clip-lut-1",
		mediaId: "video-1",
		name: "clip.mov",
		startTime,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

describe("ColorCubeLut serializer", () => {
	it("serializes a deterministic, newline-terminated .cube", () => {
		const cube = createIdentityCube();
		cube.values[0] = -0;

		const first = serializeColorCubeLut({
			cube,
			title: 'QCut "Vivid"\\Travel',
		});
		const second = serializeColorCubeLut({
			cube: structuredClone(cube),
			title: 'QCut "Vivid"\\Travel',
		});

		expect(first).toBe(second);
		expect(first).toBe(
			[
				'TITLE "QCut \\"Vivid\\"\\\\Travel"',
				"LUT_3D_SIZE 2",
				"DOMAIN_MIN 0 0 0",
				"DOMAIN_MAX 1 1 1",
				"0 0 0",
				"1 0 0",
				"0 1 0",
				"1 1 0",
				"0 0 1",
				"1 0 1",
				"0 1 1",
				"1 1 1",
				"",
			].join("\n")
		);
	});

	it("keeps title control characters on one directive line", () => {
		const serialized = serializeColorCubeLut({
			cube: createIdentityCube(),
			title: "  QCut\nInjected\tTitle  ",
		});

		expect(serialized.split("\n")[0]).toBe('TITLE "QCut Injected Title"');
		expect(serialized.match(/LUT_3D_SIZE/g)).toHaveLength(1);
	});

	it.each([
		{
			label: "a one-dimensional cube",
			mutate: (cube: ColorCubeLut) => {
				cube.size = 1;
			},
		},
		{
			label: "a fractional size",
			mutate: (cube: ColorCubeLut) => {
				cube.size = 2.5;
			},
		},
		{
			label: "the wrong channel count",
			mutate: (cube: ColorCubeLut) => {
				cube.values.pop();
			},
		},
		{
			label: "a non-finite channel",
			mutate: (cube: ColorCubeLut) => {
				cube.values[4] = Number.NaN;
			},
		},
		{
			label: "a non-finite domain",
			mutate: (cube: ColorCubeLut) => {
				cube.domainMax[1] = Number.POSITIVE_INFINITY;
			},
		},
		{
			label: "a reversed domain",
			mutate: (cube: ColorCubeLut) => {
				cube.domainMin[2] = 1;
			},
		},
	])("rejects $label", ({ mutate }) => {
		const cube = createIdentityCube();
		mutate(cube);

		expect(() => validateColorCubeLut({ cube })).toThrow();
	});

	it("rejects an empty title", () => {
		expect(() =>
			serializeColorCubeLut({ cube: createIdentityCube(), title: " \n " })
		).toThrow("title must not be empty");
	});
});

describe("verified CapCut 8.1 custom LUT mapping", () => {
	it("matches the real custom-LUT adjust-track schema and 80 percent oracle", () => {
		const mapping = mapMediaElementLutToCapCut81({
			adjustIndex: 1,
			element: createMediaElement(),
			placeholderId: PLACEHOLDER_ID,
			trackRenderIndex: 6,
		});

		expect(mapping.effect).toEqual({
			id: mapping.asset.effectMaterialId,
			effect_id: "",
			resource_id: "",
			third_resource_id: "",
			name: mapping.effect.name,
			report_name: "",
			type: "lut",
			sub_type: "none",
			path: `${mapping.asset.placeholderPath};${CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER}`,
			value: 0.8,
			visible: true,
			item_effect_type: 0,
			category_id: "",
			category_name: "",
			category_key: "",
			sub_category_id: "",
			sub_category_name: "",
			platform: "all",
			apply_target_type: 0,
			source_platform: 0,
			version: "",
			adjust_params: [],
			time_range: null,
			formula_id: "",
			enable_skin_tone_correction: false,
			algorithm_artifact_path: "",
			intensity_key: "",
			face_adjust_params: [],
			exclusion_group: [],
			panel_id: "",
			bloom_params: null,
			request_id: "",
			color_match_info: {
				target_feature_path: "",
				source_feature_path: "",
				target_image_path: "",
			},
			multi_language_current: "",
			lumi_hub_path: `${mapping.effect.path}/lumi_hub_path`,
			covering_relation_change: 0,
			beauty_face_auto_preset_id: "",
			beauty_body_auto_preset_id: "",
			beauty_face_auto_retouch_info: {
				face_id: [],
				beauty_face_auto_retouch_id: "",
			},
			smart_color_mode: 0,
		});
		expect(mapping.placeholder).toEqual({
			id: mapping.track.segments[0]?.material_id,
			material_resource_id: "",
			name: "Adjust1",
			type: "adjust",
		});
		expect(mapping.track).toMatchObject({
			attribute: 0,
			flag: 0,
			is_default_name: true,
			name: "",
			type: "adjust",
			segments: [
				{
					clip: null,
					enable_adjust: true,
					enable_adjust_mask: true,
					enable_lut: true,
					extra_material_refs: [mapping.effect.id],
					material_id: mapping.placeholder.id,
					source_timerange: null,
					target_timerange: {
						duration: 2_500_000,
						start: 1_250_000,
					},
					track_render_index: 6,
				},
			],
		});
		expect(mapping.configPatch).toEqual({ adjust_max_index: 2 });
	});

	it("emits deterministic portable output without a host path", () => {
		const options = {
			adjustIndex: 3,
			element: createMediaElement(),
			placeholderId: PLACEHOLDER_ID,
			trackRenderIndex: 2,
		};

		const first = mapMediaElementLutToCapCut81(options);
		const second = mapMediaElementLutToCapCut81({
			...options,
			element: structuredClone(options.element),
		});

		expect(first).toEqual(second);
		expect(first.asset).toMatchObject({
			kind: "generated-lut",
			relativePath: expect.stringMatching(
				/^assets\/lut\/[^/\\]+-[0-9a-f-]{36}\.cube$/
			),
		});
		expect(first.asset.placeholderPath).toBe(
			`##_draftpath_placeholder_${PLACEHOLDER_ID}_##/${first.asset.relativePath}`
		);
		expect(first.effect.name).toBe(
			first.asset.relativePath.slice("assets/lut/".length)
		);
		expect(JSON.stringify(first)).not.toMatch(
			/(?:\/Users\/|\/Applications\/|[A-Za-z]:\\)/
		);
		expect(first.asset.content).toContain('TITLE "QCut Vivid / 旅行?.cube"');
	});

	it.each([
		0, 25, 100,
	])("converts QCut intensity %s to CapCut's normalized value", (intensity) => {
		const mapping = mapMediaElementLutToCapCut81({
			adjustIndex: 1,
			element: createMediaElement({ color: createColor({ intensity }) }),
			placeholderId: PLACEHOLDER_ID,
			trackRenderIndex: 0,
		});

		expect(mapping.effect.value).toBe(intensity / 100);
	});

	it.each([
		{
			label: "missing color",
			update: (element: MediaElement) => {
				element.color = undefined;
			},
		},
		{
			label: "disabled color",
			update: (element: MediaElement) => {
				if (element.color) element.color.enabled = false;
			},
		},
		{
			label: "disabled LUT",
			update: (element: MediaElement) => {
				if (element.color) element.color.lut.enabled = false;
			},
		},
		{
			label: "unresolved cube",
			update: (element: MediaElement) => {
				if (element.color) element.color.lut.cube = undefined;
			},
		},
		{
			label: "negative intensity",
			update: (element: MediaElement) => {
				if (element.color) element.color.lut.intensity = -1;
			},
		},
		{
			label: "excessive intensity",
			update: (element: MediaElement) => {
				if (element.color) element.color.lut.intensity = 101;
			},
		},
		{
			label: "skin protection",
			update: (element: MediaElement) => {
				if (element.color) element.color.lut.skinProtection = 1;
			},
		},
		{
			label: "LUT keyframes",
			update: (element: MediaElement) => {
				if (element.color) {
					element.color.keyframes = {
						"lut.intensity": [
							{
								easing: "linear",
								frame: 1,
								id: "keyframe-1",
								value: 60,
							},
						],
					};
				}
			},
		},
		{
			label: "legacy color adjustments",
			update: (element: MediaElement) => {
				element.adjustments = {
					brightness: 1,
					contrast: 0,
					fade: 0,
					saturation: 0,
					sharpness: 0,
					temperature: 0,
					tint: 0,
					vignette: 0,
				};
			},
		},
		{
			label: "basic color adjustments",
			update: (element: MediaElement) => {
				if (element.color) element.color.basic.sharpness = 10;
			},
		},
		{
			label: "HSL adjustments",
			update: (element: MediaElement) => {
				if (element.color) element.color.hsl.ranges.red.hue = 5;
			},
		},
		{
			label: "color curves",
			update: (element: MediaElement) => {
				if (element.color) element.color.curves.enabled = true;
			},
		},
		{
			label: "grade masks",
			update: (element: MediaElement) => {
				if (element.color) element.color.mask.maskIds = ["mask-1"];
			},
		},
		{
			label: "non-LUT color keyframes",
			update: (element: MediaElement) => {
				if (element.color) {
					element.color.keyframes = {
						"basic.exposure": [
							{
								easing: "linear",
								frame: 1,
								id: "keyframe-1",
								value: 1,
							},
						],
					};
				}
			},
		},
		{
			label: "mismatched filter provenance",
			update: (element: MediaElement) => {
				if (element.color) {
					element.color.filter = {
						intensity: 40,
						presetId: "vivid",
						presetVersion: 1,
					};
				}
			},
		},
	])("fails closed for $label", ({ update }) => {
		const element = createMediaElement();
		update(element);

		expect(() =>
			mapMediaElementLutToCapCut81({
				adjustIndex: 1,
				element,
				placeholderId: PLACEHOLDER_ID,
				trackRenderIndex: 0,
			})
		).toThrow();
	});

	it.each([
		{
			label: "zero duration",
			options: { element: createMediaElement({ duration: 0 }) },
		},
		{
			label: "negative start",
			options: { element: createMediaElement({ startTime: -1 }) },
		},
		{
			label: "invalid placeholder id",
			options: {
				element: createMediaElement(),
				placeholderId: "../draft",
			},
		},
		{
			label: "invalid track index",
			options: {
				element: createMediaElement(),
				trackRenderIndex: -1,
			},
		},
		{
			label: "invalid adjust index",
			options: {
				adjustIndex: 0,
				element: createMediaElement(),
			},
		},
	])("rejects $label", ({ options }) => {
		expect(() =>
			mapMediaElementLutToCapCut81({
				adjustIndex: 1,
				element: createMediaElement(),
				placeholderId: PLACEHOLDER_ID,
				trackRenderIndex: 0,
				...options,
			})
		).toThrow();
	});
});

import type { CapCutGuiCaseId } from "../capcut-e2e/gui-regression-contract.js";

export const FULL_DURATION = 6_000_000;
export const CLIP_DURATION = 3_000_000;
export const INVERT_LUT = `TITLE "QCut QCut 2x2 Invert"
LUT_3D_SIZE 2
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
1 1 1
0 1 1
1 0 1
0 0 1
1 1 0
0 1 0
1 0 0
0 0 0
`;

function mediaRange({
	duration,
	sourceStart,
	targetStart,
}: {
	duration: number;
	sourceStart: number;
	targetStart: number;
}) {
	return {
		source_timerange: { duration, start: sourceStart },
		target_timerange: { duration, start: targetStart },
	};
}

function textPayload({ text }: { text: string }): string {
	return JSON.stringify({ styles: [{ bold: false }], text });
}

export function nativeContent() {
	return {
		duration: FULL_DURATION,
		materials: {
			audios: [{ id: "audio-material", name: "source-audio.wav" }],
			fonts: [],
			texts: [
				{
					content: textPayload({ text: "原生字幕验证 ABC123" }),
					id: "caption-material",
				},
				{
					content: textPayload({ text: "剪映真实导入测试 ABC123" }),
					id: "title-material",
				},
			],
			videos: [
				{
					height: 512,
					id: "photo-material",
					material_name: "icon.png",
					type: "photo",
					width: 512,
				},
				{
					id: "video-material",
					material_name: "source-video.mp4",
					type: "video",
				},
			],
		},
		tracks: [
			{
				segments: [
					{
						extra_material_refs: [],
						material_id: "photo-material",
						...mediaRange({
							duration: FULL_DURATION,
							sourceStart: 0,
							targetStart: 0,
						}),
					},
				],
				type: "video",
			},
			{
				segments: [
					{
						extra_material_refs: [],
						material_id: "audio-material",
						...mediaRange({
							duration: FULL_DURATION,
							sourceStart: 0,
							targetStart: 0,
						}),
					},
				],
				type: "audio",
			},
			{
				segments: [
					{
						material_id: "caption-material",
						source_timerange: null,
						target_timerange: { duration: FULL_DURATION, start: 0 },
					},
				],
				type: "text",
			},
			{
				segments: [
					{
						material_id: "title-material",
						source_timerange: null,
						target_timerange: { duration: FULL_DURATION, start: 0 },
					},
				],
				type: "text",
			},
		],
	};
}

export function dissolveContent() {
	return {
		duration: FULL_DURATION,
		materials: {
			transitions: [
				{
					duration: 466_666,
					id: "transition-material",
					name: "Dissolve",
					type: "transition",
				},
			],
			videos: [{ id: "video-material" }],
		},
		tracks: [
			{
				segments: [
					{
						extra_material_refs: ["speed-a", "transition-material"],
						material_id: "video-material",
						...mediaRange({
							duration: CLIP_DURATION,
							sourceStart: 0,
							targetStart: 0,
						}),
					},
					{
						extra_material_refs: ["speed-b"],
						material_id: "video-material",
						...mediaRange({
							duration: CLIP_DURATION,
							sourceStart: CLIP_DURATION,
							targetStart: CLIP_DURATION,
						}),
					},
				],
				type: "video",
			},
		],
	};
}

export function lutMaskContent() {
	return {
		duration: FULL_DURATION,
		materials: {
			common_mask: [
				{
					config: { feather: 0, height: 0.65, invert: false, width: 0.65 },
					id: "mask-material",
					name: "Circle",
					resource_type: "circle",
					type: "mask",
				},
			],
			effects: [{ id: "lut-effect", type: "lut", value: 1 }],
			videos: [{ id: "video-material" }],
		},
		tracks: [
			{
				segments: [
					{
						extra_material_refs: ["speed-a"],
						material_id: "video-material",
						...mediaRange({
							duration: CLIP_DURATION,
							sourceStart: 0,
							targetStart: 0,
						}),
					},
					{
						extra_material_refs: ["speed-b", "mask-material"],
						material_id: "video-material",
						...mediaRange({
							duration: CLIP_DURATION,
							sourceStart: 0,
							targetStart: CLIP_DURATION,
						}),
					},
				],
				type: "video",
			},
			{
				segments: [
					{
						extra_material_refs: ["lut-effect"],
						target_timerange: {
							duration: CLIP_DURATION,
							start: CLIP_DURATION,
						},
					},
				],
				type: "adjust",
			},
		],
	};
}

export function createBundleSemanticFixture({
	caseId,
}: {
	caseId: CapCutGuiCaseId;
}) {
	if (caseId === "native-text-sticker") return nativeContent();
	if (caseId === "dissolve") return dissolveContent();
	return lutMaskContent();
}

import { describe, expect, it } from "vitest";
import { verifyBundleCaseSemantics } from "../capcut-e2e/bundle-semantic-evidence.js";

const FULL_DURATION = 6_000_000;
const CLIP_DURATION = 3_000_000;
const INVERT_LUT = `TITLE "QCut QCut 2x2 Invert"
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

function nativeContent() {
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

function dissolveContent() {
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

function lutMaskContent() {
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

describe("CapCut bundle semantic verification", () => {
	it("proves native CJK text tracks, system fallback, audio, and photo overlay", () => {
		const content = nativeContent();
		expect(
			verifyBundleCaseSemantics({
				caseId: "native-text-sticker",
				contentText: JSON.stringify(content),
			})
		).toMatchObject({
			caseId: "native-text-sticker",
			systemFontFallback: true,
			textPayloads: ["原生字幕验证 ABC123", "剪映真实导入测试 ABC123"],
		});

		const missingPhotoIdContent = nativeContent();
		Reflect.deleteProperty(missingPhotoIdContent.materials.videos[0], "id");
		expect(() =>
			verifyBundleCaseSemantics({
				caseId: "native-text-sticker",
				contentText: JSON.stringify(missingPhotoIdContent),
			})
		).toThrow("Native photo material ID must be a string");

		const payload = JSON.parse(content.materials.texts[0].content) as {
			styles: Array<Record<string, unknown>>;
		};
		const firstStyle = payload.styles.at(0);
		if (!firstStyle) {
			throw new Error("Native text fixture must contain a style.");
		}
		firstStyle.font = "missing-cjk-font";
		content.materials.texts[0].content = JSON.stringify(payload);
		expect(() =>
			verifyBundleCaseSemantics({
				caseId: "native-text-sticker",
				contentText: JSON.stringify(content),
			})
		).toThrow("must not bind a custom font");
	});

	it("proves native dissolve timing and both source ranges", () => {
		const content = dissolveContent();
		expect(
			verifyBundleCaseSemantics({
				caseId: "dissolve",
				contentText: JSON.stringify(content),
			})
		).toMatchObject({
			caseId: "dissolve",
			transition: { durationMicroseconds: 466_666, name: "Dissolve" },
		});
		content.materials.transitions[0].duration = 500_000;
		expect(() =>
			verifyBundleCaseSemantics({
				caseId: "dissolve",
				contentText: JSON.stringify(content),
			})
		).toThrow("Native dissolve material changed");
	});

	it("proves the repeated source, mask ref, adjust ref, and full invert cube", () => {
		expect(
			verifyBundleCaseSemantics({
				caseId: "lut-mask",
				contentText: JSON.stringify(lutMaskContent()),
				generatedLutText: INVERT_LUT,
			})
		).toMatchObject({
			adjustRange: {
				durationMicroseconds: CLIP_DURATION,
				targetStartMicroseconds: CLIP_DURATION,
			},
			caseId: "lut-mask",
			lut: { cubeSize: 2, fullInvertValueCount: 24, type: "lut" },
			mask: { name: "Circle", resourceType: "circle" },
		});
		expect(() =>
			verifyBundleCaseSemantics({
				caseId: "lut-mask",
				contentText: JSON.stringify(lutMaskContent()),
				generatedLutText: INVERT_LUT.replace(/0 0 0\n$/, "0 0 0.1\n"),
			})
		).toThrow("Generated 2x2 invert LUT body changed");
	});
});

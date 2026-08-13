import { describe, expect, it } from "vitest";
import {
	JIANYING_11_3_BETA4_PROFILE_ID,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	createJianying113CompoundSource,
	createJianying113CompoundWrapper,
	encodeJianyingCompoundContent,
} from "./support/jianying-11-3-compound-fixture.js";

const TEXT_CONTENT = "QCut Plain 123 ";
const TEXT_DURATION_US = 3_000_000;

interface CompoundFixture {
	materials: {
		drafts: Array<{ draft: Record<string, unknown> }>;
	};
}

function createTextMaterial(): Record<string, unknown> {
	return {
		id: "plain-text",
		type: "text",
		alignment: 1,
		background_style: 0,
		content: JSON.stringify({
			styles: [
				{
					fill: {
						content: {
							render_type: "solid",
							solid: { color: [1, 1, 1] },
						},
					},
					font: {
						id: "",
						path: "/Applications/VideoFusion-macOS.app/Contents/Resources/Font/SystemFont/zh-hans.ttf",
					},
					range: [0, TEXT_CONTENT.length],
					size: 15,
				},
			],
			text: TEXT_CONTENT,
		}),
		font_name: "",
		font_path:
			"/Applications/VideoFusion-macOS.app/Contents/Resources/Font/SystemFont/zh-hans.ttf",
		font_size: 15,
		font_title: "none",
		global_alpha: 1,
		letter_spacing: 0,
		line_max_width: 0.82,
		text_color: "#FFFFFF",
	};
}

function createBeta4TextWrapper({
	animationEntries = [],
	includeDecorativeEffect = false,
}: {
	animationEntries?: unknown[];
	includeDecorativeEffect?: boolean;
} = {}): Record<string, unknown> {
	const content = createJianying113CompoundWrapper() as CompoundFixture &
		Record<string, unknown>;
	const inner = content.materials.drafts[0]?.draft;
	if (inner === undefined)
		throw new Error("compound fixture has no inner draft");
	inner.id = "plain-text-inner";
	inner.name = "Plain text compound";
	inner.canvas_config = { width: 1920, height: 1080 };
	inner.duration = TEXT_DURATION_US;
	inner.fps = 30;
	inner.materials = {
		effects: includeDecorativeEffect
			? [{ id: "decorative-effect", type: "text_effect" }]
			: [],
		material_animations: [
			{
				animations: animationEntries,
				id: "text-animation",
				type: "sticker_animation",
			},
		],
		texts: [createTextMaterial()],
	};
	inner.tracks = [
		{
			flag: 0,
			id: "plain-text-track",
			segments: [
				{
					clip: {
						alpha: 1,
						flip: { horizontal: false, vertical: false },
						rotation: 0,
						scale: { x: 1, y: 1 },
						transform: { x: 0, y: 0 },
					},
					common_keyframes: [],
					extra_material_refs: [
						"text-animation",
						...(includeDecorativeEffect ? ["decorative-effect"] : []),
					],
					id: "plain-text-segment",
					keyframe_refs: [],
					material_id: "plain-text",
					target_timerange: { duration: TEXT_DURATION_US, start: 0 },
					visible: true,
				},
			],
			type: "mixed",
		},
	];
	return content;
}

function normalizeBeta4Text({
	animationEntries,
	includeDecorativeEffect,
	styleFont,
}: {
	animationEntries?: unknown[];
	includeDecorativeEffect?: boolean;
	styleFont?: unknown;
} = {}) {
	const content = createBeta4TextWrapper({
		...(animationEntries === undefined ? {} : { animationEntries }),
		...(includeDecorativeEffect === undefined
			? {}
			: { includeDecorativeEffect }),
	}) as CompoundFixture & Record<string, unknown>;
	if (styleFont !== undefined) {
		const inner = content.materials.drafts[0]?.draft as {
			materials?: { texts?: Array<Record<string, unknown>> };
		};
		const textMaterial = inner.materials?.texts?.[0];
		if (textMaterial === undefined) {
			throw new Error("fixture has no text material");
		}
		const parsedContent = JSON.parse(textMaterial.content as string) as {
			styles: Array<Record<string, unknown>>;
		};
		const style = parsedContent.styles[0];
		if (style === undefined) throw new Error("fixture has no text style");
		style.font = styleFont;
		textMaterial.content = JSON.stringify(parsedContent);
	}
	const bytes = encodeJianyingCompoundContent({ content });
	return normalizeRawDraft({
		content,
		source: {
			...createJianying113CompoundSource({ bytes }),
			appVersion: "11.3.0-beta4",
			profileId: JIANYING_11_3_BETA4_PROFILE_ID,
		},
		contentFileName: "draft_content.json",
	});
}

describe("Jianying 11.3 beta4 static text import", () => {
	it("maps the verified single-style creation-time subdraft subset", () => {
		const result = normalizeBeta4Text();
		const track = result.document.timelines[0]?.tracks[0];
		const segment = track?.segments[0];

		expect(track).toMatchObject({
			kind: "text",
			capability: "downgrade",
		});
		expect(segment).toMatchObject({
			kind: "text",
			capability: "downgrade",
			targetRange: { durationUs: TEXT_DURATION_US, startUs: 0 },
			text: {
				color: "#ffffff",
				content: TEXT_CONTENT,
				fontFamily: "Arial",
				fontSizePx: 120,
				textAlign: "center",
			},
		});
		expect(segment?.text).not.toHaveProperty("background");
		expect(segment?.text).not.toHaveProperty("shadow");
		expect(segment?.text).not.toHaveProperty("stroke");
		expect(
			result.document.issues.some(
				({ code, message, severity }) =>
					code === "FEATURE_DOWNGRADED" &&
					severity === "warning" &&
					message.includes("creation-time subdraft")
			)
		).toBe(true);
		expect(
			result.document.issues.some(({ message }) =>
				message.includes('track type "mixed" is not mapped')
			)
		).toBe(false);

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.resourceIds).toEqual([]);
		expect(plan.skipped).toEqual([]);
		expect(plan.tracks).toMatchObject([
			{
				type: "text",
				elements: [
					{
						content: TEXT_CONTENT,
						duration: 3,
						fontSize: 120,
						startTime: 0,
						type: "text",
					},
				],
			},
		]);
	});

	it('falls back to Arial for a direct "none" style font string', () => {
		const result = normalizeBeta4Text({ styleFont: " None " });
		const segment = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(segment?.text).toMatchObject({ fontFamily: "Arial" });
	});

	it("trims a padded direct style font string", () => {
		const result = normalizeBeta4Text({ styleFont: " Custom Font " });
		const segment = result.document.timelines[0]?.tracks[0]?.segments[0];
		expect(segment?.text).toMatchObject({ fontFamily: "Custom Font" });
	});

	it("keeps real animation payloads opaque", () => {
		const result = normalizeBeta4Text({
			animationEntries: [{ duration: 500_000, type: "in" }],
		});
		const segment = result.document.timelines[0]?.tracks[0]?.segments[0];

		expect(segment).toMatchObject({ capability: "opaque", kind: "text" });
		expect(segment?.text).toBeUndefined();
		expect(
			mapInteropDocumentToQCutPlan({ document: result.document }).tracks
		).toEqual([]);
	});

	it("keeps decorative text effects opaque", () => {
		const result = normalizeBeta4Text({ includeDecorativeEffect: true });
		const segment = result.document.timelines[0]?.tracks[0]?.segments[0];

		expect(segment).toMatchObject({ capability: "opaque", kind: "text" });
		expect(segment?.text).toBeUndefined();
		expect(
			result.document.issues.some(
				({ code, message, severity }) =>
					code === "FEATURE_OPAQUE" &&
					severity === "warning" &&
					message.includes("decorated text")
			)
		).toBe(true);
	});
});

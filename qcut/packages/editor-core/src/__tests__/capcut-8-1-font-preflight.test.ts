import { describe, expect, it } from "vitest";
import {
	buildCapCut81Draft,
	buildJianyingDraft,
} from "../jianying-draft/index.js";
import type {
	JianyingDraftTargetPlatform,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";
import type {
	CaptionElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";

const PLACEHOLDER_ID = "11111111-2222-4333-8444-555555555555";
const TIMELINE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function createTextElement({
	content = "剪映真实导入 ABC123",
	fontFamily = "Arial",
}: {
	content?: string;
	fontFamily?: string;
} = {}): TextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content,
		duration: 3,
		fontFamily,
		fontSize: 64,
		fontStyle: "normal",
		fontWeight: "normal",
		id: "text-1",
		name: "text-1",
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		x: 0,
		y: 0,
	};
}

function createCaptionElement(): CaptionElement {
	return {
		duration: 3,
		id: "caption-1",
		language: "zh-CN",
		name: "caption-1",
		source: "manual",
		startTime: 0,
		text: "中文字幕 ABC123",
		trimEnd: 0,
		trimStart: 0,
		type: "captions",
	};
}

function createSnapshot({
	element,
	trackType,
}: {
	element: CaptionElement | TextElement;
	trackType: "captions" | "text";
}): QCutDraftExportSnapshotV1 {
	const track: TimelineTrack = {
		elements: [element],
		id: `${trackType}-track`,
		name: `${trackType}-track`,
		order: 0,
		type: trackType,
	};
	return {
		media: [],
		project: {
			backgroundColor: "#00000000",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "capcut-font-preflight",
			name: "CapCut font preflight",
			sceneId: "capcut-font-preflight-scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [track],
	};
}

function buildCapCutFontSnapshot({
	element,
	targetPlatform = "macos",
	trackType = "text",
}: {
	element: CaptionElement | TextElement;
	targetPlatform?: JianyingDraftTargetPlatform;
	trackType?: "captions" | "text";
}) {
	return buildCapCut81Draft({
		draftOutputDirectory: "/exports/capcut-font-preflight",
		placeholderId: PLACEHOLDER_ID,
		snapshot: createSnapshot({ element, trackType }),
		targetPlatform,
		timelineId: TIMELINE_ID,
	});
}

describe("CapCut 8.1 font preflight", () => {
	it("allows Arial text with an explicit substitution warning", () => {
		const element = createTextElement();
		const before = structuredClone(element);
		const result = buildCapCutFontSnapshot({ element });
		const repeatedResult = buildCapCutFontSnapshot({ element });
		const stagedBaseResult = buildJianyingDraft({
			draftOutputDirectory: "/exports/capcut-font-staging",
			snapshot: result.projectedSnapshot,
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content).not.toBeNull();
		if (!result.content) return;
		expect(element).toEqual(before);
		expect(result.issues).toEqual([
			{
				code: "CAPCUT_FONT_FAMILY_SUBSTITUTED",
				elementId: "text-1",
				message:
					"Arial is not preserved by the verified CapCut 8.1 export path; CapCut substitutes its system-default font stack.",
				severity: "warning",
				trackId: "text-track",
			},
		]);
		expect(repeatedResult.issues).toEqual(result.issues);
		expect(result.baseBuildResult.issues).toEqual([]);
		expect(stagedBaseResult.issues).toEqual(result.baseBuildResult.issues);
		expect(result.projectedSnapshot.tracks[0]?.elements[0]).toMatchObject({
			fontFamily: "Arial",
		});
		expect(result.content.materials).not.toHaveProperty("fonts");
		const material = result.content.materials.texts[0] as {
			content: string;
			[key: string]: unknown;
		};
		expect(material).not.toHaveProperty("font_name");
		expect(material).not.toHaveProperty("font_path");
		const serializedContent = JSON.stringify(result.content);
		expect(serializedContent).not.toContain('"font_name"');
		expect(serializedContent).not.toContain('"font_path"');
		const serializedText = JSON.parse(material.content) as {
			styles: Array<Record<string, unknown>>;
		};
		for (const style of serializedText.styles) {
			expect(style).not.toHaveProperty("font");
		}
	});

	it("normalizes system only inside the legacy serializer projection", () => {
		const element = createTextElement({ fontFamily: "system" });
		const before = structuredClone(element);
		const result = buildCapCutFontSnapshot({ element });
		const stagedBaseResult = buildJianyingDraft({
			draftOutputDirectory: "/exports/capcut-system-font-staging",
			snapshot: result.projectedSnapshot,
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.issues).toEqual([]);
		expect(element).toEqual(before);
		expect(element.fontFamily).toBe("system");
		expect(result.projectedSnapshot.tracks[0]?.elements[0]).toMatchObject({
			fontFamily: "Arial",
		});
		expect(stagedBaseResult.issues).toEqual(result.baseBuildResult.issues);
	});

	it("applies the same Arial preflight to captions", () => {
		const result = buildCapCutFontSnapshot({
			element: createCaptionElement(),
			trackType: "captions",
		});

		expect(result.canWrite).toBe(true);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "CAPCUT_FONT_FAMILY_SUBSTITUTED",
				elementId: "caption-1",
				severity: "warning",
				trackId: "captions-track",
			})
		);
	});

	it("blocks an unknown family once without the legacy duplicate", () => {
		const element = createTextElement({ fontFamily: "Inter" });
		const result = buildCapCutFontSnapshot({
			element,
		});

		expect(result.canWrite).toBe(false);
		expect(result.content).toBeNull();
		expect(result.issues).toEqual([
			{
				code: "UNVERIFIED_CAPCUT_EXPLICIT_FONT",
				elementId: "text-1",
				message: "Font family Inter has no verified CapCut 8.1 mapping.",
				severity: "error",
				trackId: "text-track",
			},
		]);
		expect(result.issues).not.toContainEqual(
			expect.objectContaining({ code: "UNSUPPORTED_TEXT_FONT" })
		);
		expect(element.fontFamily).toBe("Inter");
		expect(result.baseBuildResult.issues).toEqual([]);
		expect(result.projectedSnapshot.tracks[0]?.elements[0]).toMatchObject({
			fontFamily: "Arial",
		});
	});

	it("blocks emoji fallback before draft composition", () => {
		const result = buildCapCutFontSnapshot({
			element: createTextElement({ content: "剪映测试 😀" }),
		});

		expect(result.canWrite).toBe(false);
		expect(result.content).toBeNull();
		expect(result.issues).toContainEqual({
			code: "UNVERIFIED_CAPCUT_EMOJI_FONT",
			elementId: "text-1",
			message: "Emoji fallback has no verified CapCut 8.1 reference draft.",
			severity: "error",
			trackId: "text-track",
		});
	});

	it("blocks scripts outside the conservative system-fallback range", () => {
		const result = buildCapCutFontSnapshot({
			element: createTextElement({ content: "Привет" }),
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNVERIFIED_CAPCUT_TEXT_SCRIPT",
				elementId: "text-1",
				severity: "error",
				trackId: "text-track",
			})
		);
	});

	it("blocks non-BMP Han outside the verified CapCut font coverage", () => {
		const result = buildCapCutFontSnapshot({
			element: createTextElement({ content: "𠀀" }),
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNVERIFIED_CAPCUT_TEXT_SCRIPT",
				elementId: "text-1",
				severity: "error",
				trackId: "text-track",
			})
		);
	});

	it("blocks CapCut text preflight on Windows", () => {
		const result = buildCapCutFontSnapshot({
			element: createTextElement(),
			targetPlatform: "windows",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content).toBeNull();
		expect(result.issues).toContainEqual({
			code: "UNSUPPORTED_CAPCUT_FONT_PLATFORM",
			elementId: "text-1",
			message:
				"CapCut 8.1 system-default font behavior is verified only on macOS.",
			severity: "error",
			trackId: "text-track",
		});
	});

	it("does not run font preflight for a hidden text element", () => {
		const element: TextElement = {
			...createTextElement({ content: "😀", fontFamily: "system" }),
			hidden: true,
		};
		const result = buildCapCutFontSnapshot({ element });

		expect(result.canWrite).toBe(false);
		expect(
			result.issues.filter(
				({ code }) =>
					code.startsWith("UNVERIFIED_CAPCUT_") ||
					code === "CAPCUT_FONT_FAMILY_SUBSTITUTED"
			)
		).toEqual([]);
		expect(result.projectedSnapshot.tracks[0]?.elements[0]).toMatchObject({
			fontFamily: "system",
			hidden: true,
		});
	});

	it("keeps standalone Jianying builds on the legacy font policy", () => {
		const element = createTextElement({
			content: "Standalone emoji 😀",
			fontFamily: "Inter",
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/standalone-font-preflight",
			snapshot: createSnapshot({ element, trackType: "text" }),
			targetPlatform: "windows",
		});

		expect(result.issues).toEqual([
			{
				code: "UNSUPPORTED_TEXT_FONT",
				elementId: "text-1",
				message: "Font family Inter is not embedded in the draft.",
				severity: "error",
				trackId: "text-track",
			},
		]);
	});
});

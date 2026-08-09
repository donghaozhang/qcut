import { describe, expect, it } from "vitest";
import { parseDraftInteropDocumentV1 } from "../draft-interop/document.js";
import {
	buildCapCut81Draft,
	CAPCUT_8_1_PROFILE_ID,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import type { QCutDraftExportSnapshotV1 } from "../jianying-draft/types.js";
import type { TextElement } from "../types/timeline.js";

function createTextElement(): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "text-1",
		content: "Static text 剪辑",
		duration: 4,
		startTime: 1,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 54,
		fontFamily: "Arial",
		color: "#33aa77",
		backgroundColor: "#112233",
		backgroundOpacity: 0.6,
		backgroundPadding: 10,
		backgroundRadius: 5,
		textAlign: "right",
		fontWeight: "bold",
		fontStyle: "italic",
		textDecoration: "underline",
		x: 120,
		y: -50,
		width: 800,
		rotation: 15,
		opacity: 0.8,
		letterSpacing: 3,
		strokeColor: "#445566",
		strokeWidth: 2,
		strokeOpacity: 0.7,
		shadowColor: "#778899",
		shadowOpacity: 0.5,
		shadowOffsetX: 6,
		shadowOffsetY: -8,
		shadowBlur: 9,
	};
}

function createSnapshot(): QCutDraftExportSnapshotV1 {
	const text = createTextElement();
	return {
		schemaVersion: 1,
		media: [],
		project: {
			id: "project-1",
			name: "Text Import Fixture",
			sceneId: "scene-1",
			width: 1920,
			height: 1080,
			fps: 30,
			backgroundColor: "transparent",
			backgroundType: "color",
		},
		timelineDurationByElementId: { [text.id]: 4 },
		tracks: [
			{
				id: "text-track",
				name: "Text",
				type: "text",
				order: 0,
				elements: [text],
			},
		],
	};
}

function buildContent() {
	const result = buildCapCut81Draft({
		createdAtUnixSeconds: 100,
		draftOutputDirectory: "/private/text-import",
		placeholderId: "00000000-0000-4000-8000-000000000001",
		snapshot: createSnapshot(),
		targetPlatform: "macos",
		timelineId: "00000000-0000-4000-8000-000000000002",
	});
	expect(result.content).not.toBeNull();
	if (result.content === null) throw new Error("text fixture build failed");
	return JSON.parse(JSON.stringify(result.content)) as Record<string, unknown>;
}

function normalize(content = buildContent()) {
	return normalizeRawDraft({
		content,
		source: {
			product: "capcut",
			profileId: CAPCUT_8_1_PROFILE_ID,
			appVersion: "8.1.1",
			platform: "macos",
			files: [],
		},
		contentFileName: "draft_info.json",
	});
}

describe("CapCut 8.1 static text import", () => {
	it("maps the bounded single-style subset with an explicit downgrade", () => {
		const result = normalize();
		const segment = result.document.timelines[0].tracks[0].segments[0];
		expect(segment.capability).toBe("downgrade");
		expect(segment.text).toMatchObject({
			content: "Static text 剪辑",
			fontSizePx: 54,
			fontFamily: "Arial",
			color: "#33aa77",
			textAlign: "right",
			fontWeight: "bold",
			fontStyle: "italic",
			textDecoration: "underline",
			xPx: 120,
			yPx: -50,
			widthPx: 800,
			rotationDegrees: 15,
			opacity: 0.8,
			letterSpacingPx: 3,
			stroke: {
				color: "#445566",
				widthPx: 2,
				opacity: 0.7,
			},
			background: {
				color: "#112233",
				opacity: 0.6,
				radiusPx: 5,
				paddingPx: 10,
			},
			shadow: {
				color: "#778899",
				opacity: 0.5,
				offsetXPx: 6,
				offsetYPx: -8,
				blurPx: 9,
			},
		});
		expect(
			result.document.issues.some(
				({ code, severity, subjectId }) =>
					code === "FEATURE_DOWNGRADED" &&
					severity === "warning" &&
					subjectId === segment.id
			)
		).toBe(true);
		expect(
			result.bindings.some(
				({ foreignRef, semanticId }) =>
					foreignRef === segment.text?.foreignRef && semanticId === segment.id
			)
		).toBe(true);
		expect(
			parseDraftInteropDocumentV1(JSON.parse(JSON.stringify(result.document)))
				.ok
		).toBe(true);

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.resourceIds).toEqual([]);
		expect(plan.tracks).toHaveLength(1);
		expect(plan.tracks[0]).toMatchObject({ type: "text", name: "Text" });
		expect(plan.tracks[0].elements[0]).toMatchObject({
			type: "text",
			content: "Static text 剪辑",
			startTime: 1,
			duration: 4,
			backgroundColor: "#112233",
			strokeWidth: 2,
			shadowBlur: 9,
		});
	});

	it("blocks multi-run rich text instead of flattening it", () => {
		const content = buildContent();
		const materials = content.materials as {
			texts: Array<{ content: string }>;
		};
		const payload = JSON.parse(materials.texts[0].content) as {
			styles: Array<Record<string, unknown>>;
		};
		payload.styles.push({ ...payload.styles[0] });
		materials.texts[0].content = JSON.stringify(payload);
		const result = normalize(content);
		const segment = result.document.timelines[0].tracks[0].segments[0];
		expect(segment.capability).toBe("blocked");
		expect(segment.text).toBeUndefined();
		expect(
			result.document.issues.some(
				({ severity, message }) =>
					severity === "error" && message.includes("multi-run")
			)
		).toBe(true);
		expect(
			mapInteropDocumentToQCutPlan({ document: result.document }).tracks
		).toEqual([]);
	});
});

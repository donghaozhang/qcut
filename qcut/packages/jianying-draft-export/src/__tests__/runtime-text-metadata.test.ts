import type { TextElement } from "@qcut/editor-core";
import {
	buildJianyingDraft,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-json.js";
import { validateSnapshot } from "../snapshot-runtime-validation.js";

const TEXT_METADATA = {
	textTemplateId: "social-hook",
	stylePresetId: "yellow-pop",
	language: "zh-CN",
} satisfies Partial<TextElement>;

function createTextSnapshot({
	metadata = {},
}: {
	metadata?: Partial<typeof TEXT_METADATA>;
} = {}): QCutDraftExportSnapshotV1 {
	return {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name: "Text metadata",
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: { text: 2 },
		tracks: [
			{
				id: "text-track",
				name: "Text",
				type: "text",
				elements: [
					{
						backgroundColor: "transparent",
						color: "#ffffff",
						content: "QCut 剪辑",
						duration: 2,
						fontFamily: "Arial",
						fontSize: 64,
						fontStyle: "normal",
						fontWeight: "normal",
						id: "text",
						name: "Title",
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
						...metadata,
					},
				],
			},
		],
	};
}

function validateTextSnapshot({
	snapshot,
}: {
	snapshot: QCutDraftExportSnapshotV1;
}): QCutDraftExportSnapshotV1 {
	return validateSnapshot({
		path: "$.snapshot",
		value: snapshot as unknown as JsonValue,
	});
}

describe("snapshot text metadata", () => {
	it.each([
		{ name: "absent", metadata: {} },
		{ name: "populated", metadata: TEXT_METADATA },
		{
			name: "empty strings",
			metadata: { textTemplateId: "", stylePresetId: "", language: "" },
		},
	])("preserves $name metadata without changing draft text", ({ metadata }) => {
		const snapshot = createTextSnapshot({ metadata });
		const validated = validateTextSnapshot({ snapshot });
		expect(validated).toEqual(snapshot);
		expect(validated.tracks[0]?.elements[0]).toMatchObject(metadata);
		const options = {
			draftOutputDirectory: "/exports/text-metadata",
			targetPlatform: "macos" as const,
		};
		const baseline = buildJianyingDraft({
			...options,
			snapshot: createTextSnapshot(),
		});
		const result = buildJianyingDraft({ ...options, snapshot: validated });
		expect(baseline.canWrite).toBe(true);
		expect(baseline.content.materials.texts).toHaveLength(1);
		expect(result).toEqual(baseline);
	});

	describe.each(Object.keys(TEXT_METADATA))("%s", (key) => {
		it.each([
			{ name: "null", value: null },
			{ name: "number", value: 7 },
			{ name: "boolean", value: false },
			{ name: "object", value: { id: "preset" } },
			{ name: "array", value: ["preset"] },
		])("rejects $name with a field-specific type error", ({ value }) => {
			const snapshot = createTextSnapshot();
			Object.assign(snapshot.tracks[0]?.elements[0], { [key]: value });
			expect(() => validateTextSnapshot({ snapshot })).toThrow(
				`$.snapshot.tracks[0].elements[0].${key}: Expected a string.`
			);
		});

		it("rejects NUL characters", () => {
			const snapshot = createTextSnapshot();
			Object.assign(snapshot.tracks[0]?.elements[0], { [key]: "bad\0value" });
			expect(() => validateTextSnapshot({ snapshot })).toThrow(
				`$.snapshot.tracks[0].elements[0].${key}: NUL characters are not allowed.`
			);
		});
	});

	it("still rejects unknown text properties", () => {
		const snapshot = createTextSnapshot({ metadata: TEXT_METADATA });
		Object.assign(snapshot.tracks[0]?.elements[0], { textTemplatId: "typo" });
		expect(() => validateTextSnapshot({ snapshot })).toThrow("textTemplatId");
	});
});

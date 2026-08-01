import {
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	analyzeCapCut81FontReferencePair,
	inspectCapCut81FontReferenceDraft,
	writeCapCut81FontReference,
} from "../capcut-e2e/font-reference.js";
import { parseCapCut81FontReferenceCliOptions } from "../capcut-e2e/font-reference-cli.js";

const TARGET_TEXT = "剪映真实导入测试 ABC123";
const temporaryDirectories: string[] = [];

interface FontFixtureOptions {
	duplicateTarget?: boolean;
	fontFields?: Readonly<Record<string, unknown>>;
	materialFonts?: unknown;
	nonFontSize?: number;
	styleFont?: unknown;
	timelineFontFields?: Readonly<Record<string, unknown>>;
	topLevelFontMaterials?: unknown;
}

function createDraftInfo({
	duplicateTarget = false,
	fontFields = {
		font_name: "",
		font_path:
			"/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf",
		font_resource_id: "",
	},
	materialFonts = [],
	nonFontSize = 12,
	styleFont,
	topLevelFontMaterials,
}: FontFixtureOptions): Record<string, unknown> {
	const style = {
		bold: false,
		range: [0, TARGET_TEXT.length],
		size: nonFontSize,
		...(styleFont === undefined ? {} : { font: styleFont }),
	};
	const textMaterial = {
		...fontFields,
		content: JSON.stringify({ styles: [style], text: TARGET_TEXT }),
		fonts: materialFonts,
		id: "font-reference-text-material",
		text_color: "#ffffff",
		type: "text",
	};
	return {
		duration: 6_000_000,
		materials: {
			...(topLevelFontMaterials === undefined
				? {}
				: { fonts: topLevelFontMaterials }),
			texts: [
				textMaterial,
				...(duplicateTarget
					? [{ ...textMaterial, id: "duplicate-font-reference-text" }]
					: []),
			],
		},
	};
}

async function createFontReferenceDraft({
	name,
	options = {},
}: {
	name: string;
	options?: FontFixtureOptions;
}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "qcut-font-reference-"));
	temporaryDirectories.push(root);
	const draftDirectory = join(root, name);
	const timelineDirectory = join(draftDirectory, "Timelines", "timeline-1");
	await mkdir(timelineDirectory, { recursive: true });
	const rootDraftInfo = createDraftInfo(options);
	const timelineDraftInfo = createDraftInfo({
		...options,
		fontFields: options.timelineFontFields ?? options.fontFields,
	});
	await Promise.all([
		writeFile(
			join(draftDirectory, "draft_info.json"),
			`${JSON.stringify(rootDraftInfo)}\n`,
			"utf8"
		),
		writeFile(
			join(timelineDirectory, "draft_info.json"),
			`${JSON.stringify(timelineDraftInfo)}\n`,
			"utf8"
		),
	]);
	return realpath(draftDirectory);
}

afterEach(async () => {
	const directories = temporaryDirectories.splice(0);
	await Promise.all(
		directories.map((directory) =>
			rm(directory, { force: true, recursive: true })
		)
	);
});

describe("CapCut 8.1 native font reference analysis", () => {
	it("requires one exact value for every capture CLI option", () => {
		const options = parseCapCut81FontReferenceCliOptions({
			args: [
				"--before",
				"./before",
				"--after",
				"./after",
				"--text",
				TARGET_TEXT,
				"--font-label",
				"Reference Font",
				"--output",
				"./reference.json",
			],
		});

		expect(options).toMatchObject({
			fontLabel: "Reference Font",
			targetText: TARGET_TEXT,
		});
		expect(options.beforeDraftDirectory).toMatch(/\/before$/u);
		expect(options.afterDraftDirectory).toMatch(/\/after$/u);
		expect(options.outputPath).toMatch(/\/reference\.json$/u);
		expect(() =>
			parseCapCut81FontReferenceCliOptions({
				args: ["--before", "a", "--before", "b"],
			})
		).toThrow("Duplicate option --before");
	});

	it("captures root and timeline font bindings without copying the draft", async () => {
		const draftDirectory = await createFontReferenceDraft({ name: "default" });

		const evidence = await inspectCapCut81FontReferenceDraft({
			draftDirectory,
			targetText: TARGET_TEXT,
		});

		expect(evidence).toMatchObject({
			binding: {
				materialFields: {
					font_name: "",
					font_path:
						"/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf",
					font_resource_id: "",
				},
				materialFonts: { present: true, value: [] },
				styleFonts: [{ present: false, styleIndex: 0, value: null }],
				text: TARGET_TEXT,
				topLevelFontMaterials: { present: false, value: null },
			},
			canonicalDraftDirectory: draftDirectory,
			targetMaterialId: "font-reference-text-material",
			timelineId: "timeline-1",
		});
		expect(evidence.rootDraftInfo.sha256).toMatch(/^[a-f0-9]{64}$/u);
		expect(evidence.timelineDraftInfo.sha256).toBe(
			evidence.rootDraftInfo.sha256
		);
	});

	it("reports only isolated native font-field changes", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const resource = { id: "font-resource-1", name: "Source Han Sans CN" };
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_id: "font-resource-1",
					font_name: "Source Han Sans CN",
					font_path: "/font-cache/source-han-sans-cn.otf",
					font_resource_id: "font-resource-1",
				},
				materialFonts: [resource],
				styleFont: "font-resource-1",
				topLevelFontMaterials: [resource],
			},
		});

		const reference = await analyzeCapCut81FontReferencePair({
			afterDraftDirectory,
			beforeDraftDirectory,
			fontLabel: " Source Han Sans CN ",
			targetText: TARGET_TEXT,
		});

		expect(reference.changedPaths).toEqual([
			"material.font_id",
			"material.font_name",
			"material.font_path",
			"material.font_resource_id",
			"material.fonts",
			"materials.fonts",
			"content.styles[0].font",
		]);
		expect(reference).toMatchObject({
			fontLabel: "Source Han Sans CN",
			schema: "qcut.capcut-8-1.font-reference",
			schemaVersion: 1,
			targetText: TARGET_TEXT,
		});
	});

	it("rejects a pair with no font-field change", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "unchanged",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("contains no font-field change");
	});

	it("rejects a capture that changed non-font text semantics", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
				nonFontSize: 18,
			},
		});

		await expect(
			analyzeCapCut81FontReferencePair({
				afterDraftDirectory,
				beforeDraftDirectory,
				fontLabel: "Reference Font",
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("changed non-font target semantics");
	});

	it("rejects disagreement between root and timeline copies", async () => {
		const draftDirectory = await createFontReferenceDraft({
			name: "mismatch",
			options: {
				timelineFontFields: {
					font_name: "Different Font",
					font_path: "/fonts/different.otf",
					font_resource_id: "different-font",
				},
			},
		});

		await expect(
			inspectCapCut81FontReferenceDraft({
				draftDirectory,
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("disagree on the target text material");
	});

	it("rejects ambiguous target text and symlinked timeline entries", async () => {
		const duplicateDraft = await createFontReferenceDraft({
			name: "duplicate",
			options: { duplicateTarget: true },
		});

		await expect(
			inspectCapCut81FontReferenceDraft({
				draftDirectory: duplicateDraft,
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("found 2");

		const symlinkDraft = await createFontReferenceDraft({ name: "symlink" });
		await symlink(
			join(symlinkDraft, "Timelines", "timeline-1"),
			join(symlinkDraft, "Timelines", "timeline-alias"),
			"dir"
		);
		await expect(
			inspectCapCut81FontReferenceDraft({
				draftDirectory: symlinkDraft,
				targetText: TARGET_TEXT,
			})
		).rejects.toThrow("must not contain symlinks");
	});

	it("writes a new hash-bound reference manifest without overwriting", async () => {
		const beforeDraftDirectory = await createFontReferenceDraft({
			name: "before",
		});
		const afterDraftDirectory = await createFontReferenceDraft({
			name: "after",
			options: {
				fontFields: {
					font_name: "Reference Font",
					font_path: "/fonts/reference.otf",
					font_resource_id: "reference-font",
				},
			},
		});
		const reference = await analyzeCapCut81FontReferencePair({
			afterDraftDirectory,
			beforeDraftDirectory,
			fontLabel: "Reference Font",
			targetText: TARGET_TEXT,
		});
		const outputRoot = await realpath(
			await mkdtemp(join(tmpdir(), "qcut-font-output-"))
		);
		temporaryDirectories.push(outputRoot);
		const outputPath = join(outputRoot, "reference.json");

		await writeCapCut81FontReference({ outputPath, reference });

		expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(reference);
		await expect(
			writeCapCut81FontReference({ outputPath, reference })
		).rejects.toMatchObject({ code: "EEXIST" });
	});
});

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
	analyzeSource,
	loadStyleInstructions,
	parseArgs,
	parseNumberList,
	renderShotArtifacts,
	slugify,
	validateBreakdown,
} from "./lib";
import type { SceneBreakdown } from "./types";

describe("qcut-shot helpers", () => {
	test("parseNumberList deduplicates and sorts", () => {
		expect(parseNumberList({ value: "5,2,5,8" })).toEqual([2, 5, 8]);
	});

	test("slugify keeps stable ASCII output", () => {
		expect(slugify({ value: "Detective Night Scene" })).toBe("detective-night-scene");
	});

	test("parseArgs supports custom shot dimensions", () => {
		const options = parseArgs({
			argv: [
				"bun",
				"main.ts",
				"story.md",
				"--style",
				"custom",
				"--medium",
				"animation",
				"--format",
				"short-film",
				"--framing",
				"macro",
				"--movement",
				"slider",
				"--lighting",
				"bright",
				"--mood",
				"polished",
			],
		});

		expect(options.style).toBe("custom");
		expect(options.medium).toBe("animation");
		expect(options.format).toBe("short-film");
		expect(options.framing).toBe("macro");
		expect(options.movement).toBe("slider");
		expect(options.lighting).toBe("bright");
		expect(options.mood).toBe("polished");
	});

	test("loadStyleInstructions composes custom shot dimensions", () => {
		const instructions = loadStyleInstructions({
			style: "custom:macro+slider+bright+polished",
			framing: "macro",
			movement: "slider",
			lighting: "bright",
			mood: "polished",
		});

		expect(instructions).toContain("Custom shot style composed from dimensions.");
		expect(instructions).toContain("Framing: macro");
		expect(instructions).toContain("### slider");
	});

	test("analyzeSource extracts metadata without visual anchors", () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-shot-test-"));
		const source = join(dir, "story.md");
		writeFileSync(
			source,
			"# Love Story\n\nA beautiful supermodel and a quiet photographer fall in love during a late-night fashion shoot.\n",
		);

		const analysis = analyzeSource({
			options: {
				input: source,
				medium: "live-action",
				format: "film",
				promptsOnly: false,
				imagesOnly: false,
				dryRun: true,
			},
		});

		expect(analysis.title).toBe("Love Story");
		expect(analysis.medium).toBe("live-action");
		expect(analysis.format).toBe("film");
		expect(analysis.sourceContent).toContain("supermodel");
		expect(analysis.genreRules.join(" ")).toContain("Do not introduce tactical gear");
	});

	test("analyzeSource supports medium and format inference", () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-shot-test-"));
		const source = join(dir, "doc.md");
		writeFileSync(
			source,
			"# Arena Doc\n\nAn animated documentary short follows one survivor through the arena with observational interviews and archive footage cues.\n",
		);

		const analysis = analyzeSource({
			options: {
				input: source,
				promptsOnly: false,
				imagesOnly: false,
				dryRun: true,
			},
		});

		expect(analysis.medium).toBe("animation");
		expect(analysis.format).toBe("documentary");
		expect(analysis.productionRules.join(" ")).toContain("observational credibility");
	});

	test("validateBreakdown normalizes scene data", () => {
		const raw: SceneBreakdown = {
			characters: [
				{ id: "valentina", role: "lead", description: "Elegant supermodel" },
				{ id: "painter", role: "love interest", description: "Street painter" },
			],
			continuityNotes: ["Keep Valentina's dress consistent"],
			scenes: [
				{
					index: 1,
					title: "Golden Hour on the Seine",
					fileStem: "",
					camera: { lens: "35mm", framing: "wide establishing", movement: "slow dolly", angle: "eye level" },
					lighting: "golden hour backlight",
					location: "Pont des Arts, Paris",
					action: "Valentina walks across the bridge",
					characterIds: ["valentina"],
					mood: "lonely elegance",
					props: ["silk dress", "river reflections"],
					colorPalette: "warm gold, amber",
					negative: "no crowd",
				},
				{
					index: 2,
					title: "The Painter's Gaze",
					fileStem: "",
					camera: { lens: "85mm", framing: "medium two-shot", movement: "locked-off", angle: "eye level" },
					lighting: "soft diffused afternoon",
					location: "Pont des Arts, Paris",
					action: "The painter looks up from his canvas",
					characterIds: ["painter", "unknown-character"],
					mood: "curious wonder",
					props: ["easel", "canvas", "paint brushes"],
					colorPalette: "warm earth tones",
					negative: "no modern elements",
				},
			],
		};

		const validated = validateBreakdown({ breakdown: raw });

		expect(validated.scenes[0].fileStem).toBe("01-golden-hour-on-the-seine");
		expect(validated.scenes[1].fileStem).toBe("02-the-painters-gaze");
		expect(validated.scenes[1].characterIds).toEqual(["painter"]);
	});

	test("validateBreakdown assigns default character when none match", () => {
		const raw: SceneBreakdown = {
			characters: [{ id: "hero", role: "lead", description: "The hero" }],
			continuityNotes: [],
			scenes: [
				{
					index: 1,
					title: "Opening",
					fileStem: "",
					camera: { lens: "24mm", framing: "wide", movement: "crane", angle: "high" },
					lighting: "dawn",
					location: "rooftop",
					action: "A figure stands alone",
					characterIds: [],
					mood: "solitary",
					props: [],
					colorPalette: "cool blue",
					negative: "",
				},
			],
		};

		const validated = validateBreakdown({ breakdown: raw });
		expect(validated.scenes[0].characterIds).toEqual(["hero"]);
	});

	test("renderShotArtifacts writes scene manifest", () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-shot-test-"));
		const source = join(dir, "story.md");
		writeFileSync(source, "# Test Story\n\nA short test story.\n");

		const analysis = analyzeSource({
			options: {
				input: source,
				outputDir: join(dir, "shot-plan"),
				promptsOnly: false,
				imagesOnly: false,
				dryRun: true,
			},
		});

		const breakdown: SceneBreakdown = {
			characters: [{ id: "hero", role: "lead", description: "The main character" }],
			continuityNotes: ["Keep hero consistent"],
			scenes: [
				{
					index: 1,
					title: "Opening Scene",
					fileStem: "01-opening-scene",
					camera: { lens: "24mm", framing: "wide", movement: "dolly", angle: "eye level" },
					lighting: "natural morning light",
					location: "city street",
					action: "Hero walks down the street",
					characterIds: ["hero"],
					mood: "contemplative",
					props: ["briefcase"],
					colorPalette: "muted grays, warm highlights",
					negative: "no crowd, no text",
				},
			],
		};

		const styleInstructions = loadStyleInstructions({
			style: analysis.style,
			stylePreset: analysis.stylePreset,
			framing: analysis.framing,
			movement: analysis.movement,
			lighting: analysis.lighting,
			mood: analysis.mood,
		});

		renderShotArtifacts({
			project: {
				shotDir: join(dir, "shot-plan"),
				promptsDir: join(dir, "shot-plan", "prompts"),
				analysis,
				breakdown,
				styleInstructions,
			},
		});

		const manifest = JSON.parse(
			readFileSync(join(dir, "shot-plan", "shots.json"), "utf8"),
		) as {
			characters: Array<{ id: string }>;
			scenes: Array<{ characterIds: string[] }>;
		};

		expect(manifest.characters.map((c) => c.id)).toEqual(["hero"]);
		expect(manifest.scenes[0]?.characterIds).toEqual(["hero"]);
	});
});

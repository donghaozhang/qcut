import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { analyzeSource, buildShots, loadStyleInstructions, parseArgs, parseNumberList, slugify } from "./lib";

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
		expect(options.framing).toBe("macro");
		expect(options.movement).toBe("slider");
		expect(options.lighting).toBe("bright");
		expect(options.mood).toBe("polished");
	});

	test("buildShots creates opening and closing beats", () => {
		const shots = buildShots({
			analysis: {
				title: "Product Reveal",
				topicSlug: "product-reveal",
				sourcePath: "/tmp/story.md",
				sourceExtension: ".md",
				wordCount: 900,
				language: "en",
				style: "product",
				stylePreset: "product",
				styleReason: "explicit",
				framing: "macro",
				movement: "slider",
				lighting: "bright",
				mood: "polished",
				recommendedShots: 6,
				targetShots: 5,
				coreThroughline: "Show the product clearly",
				beats: [
					{ title: "Opening", body: "Show the room and product table.", keywords: ["room", "product"] },
					{ title: "Reveal", body: "Move to the hero detail.", keywords: ["detail", "reveal"] },
				],
				visualAnchors: {
					subjectId: "device-01",
					subjectAnchor: "Same hero device across the sequence.",
					locationId: "studio-01",
					locationAnchor: "Same studio geography across the sequence.",
					propId: "hero-product-01",
					propAnchor: "Same product design and finish.",
					paletteAnchor: "bright neutral palette",
					continuityRules: ["Do not change the product identity between shots."],
				},
			},
		});

		expect(shots[0]?.shotType).toBe("opening");
		expect(shots.at(-1)?.shotType).toBe("closing");
		expect(shots.length).toBe(5);
		expect(shots[0]?.continuity.subjectId).toBe("device-01");
		expect(shots[2]?.shotRoleGuidance).toContain("hero-product-01");
		expect(shots[0]?.negativePrompt).toContain("no extra hero characters");
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

	test("analyzeSource prefers recurring hero props from content", () => {
		const dir = mkdtempSync(join(tmpdir(), "qcut-shot-test-"));
		const source = join(dir, "arena.md");
		writeFileSync(
			source,
			"# Arena\n\nThe contender sees giant screens above the arena and runs toward a bow. The bow becomes the only thing that matters.\n",
		);

		const analysis = analyzeSource({
			options: {
				input: source,
				promptsOnly: false,
				imagesOnly: false,
				dryRun: true,
			},
		});

		expect(analysis.visualAnchors.propId).toBe("bow-01");
		expect(analysis.visualAnchors.propAnchor).toContain("same bow design");
	});
});

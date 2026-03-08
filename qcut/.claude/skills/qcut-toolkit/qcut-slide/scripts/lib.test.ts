import { describe, expect, test } from "bun:test";
import { buildSlides, loadStyleInstructions, parseArgs, parseSlideList, slugify } from "./lib";

describe("qcut-slide helpers", () => {
	test("parseSlideList deduplicates and sorts", () => {
		expect(parseSlideList({ value: "5,2,5,8,foo" })).toEqual([2, 5, 8]);
	});

	test("slugify keeps stable ASCII output", () => {
		expect(slugify({ value: "Introduction to Machine Learning!" })).toBe(
			"introduction-to-machine-learning",
		);
	});

	test("buildSlides creates cover and closing slides", () => {
		const slides = buildSlides({
			analysis: {
				title: "Intro to QCut Slides",
				topicSlug: "intro-qcut-slides",
				sourcePath: "/tmp/source.md",
				sourceExtension: ".md",
				wordCount: 1200,
				language: "en",
				audience: "general",
				style: "blueprint",
				styleReason: "default fallback",
				recommendedSlides: 12,
				targetSlides: 6,
				coreMessage: "Intro to QCut Slides: fast deck generation",
				supportingPoints: ["fast deck generation", "prompt-driven visuals"],
				sections: [
					{
						title: "Problem",
						body: "Teams need slides quickly. Manual layout is slow.",
						keywords: ["teams", "slides", "layout"],
					},
					{
						title: "Process",
						body: "Analyze content. Create outline. Generate prompts.",
						keywords: ["analyze", "outline", "prompts"],
					},
				],
			},
		});

		expect(slides[0]?.type).toBe("cover");
		expect(slides.at(-1)?.type).toBe("closing");
		expect(slides.length).toBeGreaterThanOrEqual(3);
	});

	test("parseArgs supports custom dimensions", () => {
		const options = parseArgs({
			argv: [
				"bun",
				"main.ts",
				"article.md",
				"--style",
				"custom",
				"--texture",
				"paper",
				"--mood",
				"warm",
				"--typography",
				"editorial",
				"--density",
				"balanced",
			],
		});

		expect(options.style).toBe("custom");
		expect(options.texture).toBe("paper");
		expect(options.mood).toBe("warm");
		expect(options.typography).toBe("editorial");
		expect(options.density).toBe("balanced");
	});

	test("loadStyleInstructions composes custom dimensions", () => {
		const instructions = loadStyleInstructions({
			style: "custom:paper+warm+editorial+balanced",
			texture: "paper",
			mood: "warm",
			typography: "editorial",
			density: "balanced",
		});

		expect(instructions).toContain("Custom dimension-composed slide style.");
		expect(instructions).toContain("Texture: paper");
		expect(instructions).toContain("### paper");
		expect(instructions).toContain("### warm");
	});
});

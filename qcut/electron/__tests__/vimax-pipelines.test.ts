import { describe, expect, it } from "vitest";
import { createIdea2VideoConfig } from "../native-pipeline/vimax/pipelines/idea2video.js";
import { createScript2VideoConfig } from "../native-pipeline/vimax/pipelines/script2video.js";
import { createNovel2MovieConfig } from "../native-pipeline/vimax/pipelines/novel2movie.js";

describe("ViMax Pipelines", () => {
	describe("Idea2VideoConfig", () => {
		it("creates config with defaults", () => {
			const config = createIdea2VideoConfig();
			expect(config.output_dir).toContain("idea2video");
			expect(config.save_intermediate).toBe(true);
			expect(config.generate_portraits).toBe(true);
			expect(config.use_character_references).toBe(true);
			expect(config.parallel_generation).toBe(false);
		});

		it("allows overrides", () => {
			const config = createIdea2VideoConfig({
				output_dir: "/custom/output",
				target_duration: 120,
				generate_portraits: false,
				video_model: "kling_2_6_pro",
			});
			expect(config.output_dir).toBe("/custom/output");
			expect(config.target_duration).toBe(120);
			expect(config.generate_portraits).toBe(false);
			expect(config.video_model).toBe("kling_2_6_pro");
		});
	});

	describe("Script2VideoConfig", () => {
		it("creates config with defaults", () => {
			const config = createScript2VideoConfig();
			expect(config.output_dir).toContain("script2video");
			expect(config.use_character_references).toBe(true);
		});

		it("allows overrides", () => {
			const config = createScript2VideoConfig({
				video_model: "wan_2_6",
				image_model: "flux_dev",
			});
			expect(config.video_model).toBe("wan_2_6");
			expect(config.image_model).toBe("flux_dev");
		});
	});

	describe("Novel2MovieConfig", () => {
		it("creates config with defaults", () => {
			const config = createNovel2MovieConfig();
			expect(config.output_dir).toContain("novel2movie");
			expect(config.generate_portraits).toBe(true);
			expect(config.scripts_only).toBe(false);
			expect(config.storyboard_only).toBe(false);
		});

		it("allows overrides", () => {
			const config = createNovel2MovieConfig({
				scripts_only: true,
				chunk_size: 2000,
			});
			expect(config.scripts_only).toBe(true);
			expect(config.chunk_size).toBe(2000);
		});
	});
});

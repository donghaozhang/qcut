import { describe, expect, it } from "vitest";
import { buildCustomCutoutExpression } from "../ffmpeg/custom-cutout-expression";

describe("custom cutout FFmpeg expression", () => {
	it("builds cumulative foreground and background correction frames", () => {
		const expression = buildCustomCutoutExpression({
			fps: 30,
			customCutout: {
				enabled: true,
				applyStrokes: true,
				strokes: [
					{
						id: "foreground",
						frame: 0,
						mode: "foreground",
						size: 0.1,
						points: [
							{ x: 0.2, y: 0.2 },
							{ x: 0.4, y: 0.4 },
						],
					},
					{
						id: "background",
						frame: 30,
						mode: "background",
						size: 0.05,
						points: [{ x: 0.3, y: 0.3 }],
					},
				],
			},
		});
		expect(expression).toContain("if(lt((N/30),1)");
		expect(expression).toContain("max(0,");
		expect(expression).toContain("*(1-(");
		expect(expression).toContain("X/W-0.3");
	});

	it("returns an identity matte when brush preview is disabled", () => {
		expect(
			buildCustomCutoutExpression({
				fps: 30,
				customCutout: {
					enabled: true,
					applyStrokes: false,
					strokes: [],
				},
			})
		).toBe("1");
	});
});

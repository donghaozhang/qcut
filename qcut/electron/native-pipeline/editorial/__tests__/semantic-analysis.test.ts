import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineExecutor } from "../../execution/executor.js";
import { ModelRegistry } from "../../infra/registry.js";
import { registerImageUnderstandingModels } from "../../registry-data/image-understanding.js";

const extractJpegDataUrlsMock = vi.hoisted(() =>
	vi.fn(async () => [
		"data:image/jpeg;base64,frame-one",
		"data:image/jpeg;base64,frame-two",
	])
);

vi.mock("../media-process.js", () => ({
	extractJpegDataUrls: extractJpegDataUrlsMock,
}));

import {
	analyzeSourceSemantics,
	semanticAnalysisInternals,
} from "../semantic-analysis.js";

describe("editorial semantic analysis", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		if (!ModelRegistry.has("openrouter_gemini_3_5_flash_video")) {
			registerImageUnderstandingModels();
		}
	});

	it("samples local scene centers without exceeding the frame budget", () => {
		const times = semanticAnalysisInternals.buildSemanticSampleTimes({
			duration: 30,
			sceneBoundaries: [0, 3, 8, 14, 21, 26],
			maxFrames: 8,
		});

		expect(times).toHaveLength(8);
		expect(times).toEqual([...times].sort((left, right) => left - right));
		expect(times.every((time) => time >= 0 && time < 30)).toBe(true);
	});

	it("sends bounded JPEG references instead of embedding the source video", async () => {
		const executeStep = vi.fn(async () => ({
			success: true,
			duration: 1,
			text: JSON.stringify({
				summary: "A tram crosses a Melbourne street",
				tags: ["tram", "street"],
				locations: ["Melbourne"],
				subjects: ["tram"],
				scenes: [
					{
						start: 0,
						end: 10,
						description: "A tram moves through frame",
						tags: ["tram"],
						motionDirection: "right",
						subjectPosition: "center",
					},
				],
			}),
		}));

		const result = await analyzeSourceSemantics({
			path: "/media/tram.mp4",
			probe: {
				duration: 10,
				width: 1920,
				height: 1080,
				fps: 30,
				hasAudio: false,
			},
			sceneBoundaries: [0, 5],
			model: "openrouter_gemini_3_5_flash_video",
			executor: { executeStep } as unknown as PipelineExecutor,
			signal: new AbortController().signal,
		});

		expect(extractJpegDataUrlsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "/media/tram.mp4",
				times: expect.any(Array),
			})
		);
		expect(executeStep).toHaveBeenCalledWith(
			expect.objectContaining({ type: "image_understanding" }),
			{
				images: [
					"data:image/jpeg;base64,frame-one",
					"data:image/jpeg;base64,frame-two",
				],
			},
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(result).toMatchObject({
			summary: "A tram crosses a Melbourne street",
			locations: ["Melbourne"],
		});
	});
});

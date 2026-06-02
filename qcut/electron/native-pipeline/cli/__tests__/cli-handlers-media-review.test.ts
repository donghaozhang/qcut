import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { PipelineStep } from "../../execution/executor.js";
import type { StepInput, StepOutput } from "../../execution/step-executors.js";
import { ModelRegistry } from "../../infra/registry.js";
import { handleAnalyzeVideo } from "../cli-handlers-media.js";
import { parseCliArgs } from "../cli.js";
import type { CLIRunOptions } from "../cli-runner/types.js";

function registerReviewModel(): void {
	ModelRegistry.register({
		key: "openrouter_gemini_3_5_flash_video",
		name: "Gemini video review test model",
		provider: "openrouter",
		endpoint: "test",
		categories: ["image_understanding"],
		description: "test model",
		pricing: 0,
		providerBackend: "openrouter",
	});
}

function makeAnalyzeOptions({
	outputDir,
	reviewLanguage = "zh",
	input = "sample-video.mp4",
}: {
	outputDir: string;
	reviewLanguage?: string;
	input?: string;
}): CLIRunOptions {
	return {
		command: "analyze-video",
		input,
		outputDir,
		analysisType: "review",
		reviewLanguage,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function makeExecutor({
	captured,
	text,
}: {
	captured: PipelineStep[];
	text?: string;
}): {
	executeStep: (step: PipelineStep, input: StepInput) => Promise<StepOutput>;
} {
	return {
		async executeStep(step: PipelineStep, _input: StepInput) {
			captured.push(step);
			return {
				success: true,
				text:
					text ??
					JSON.stringify([
						{
							timestamp: "00:00:03",
							category: "镜头/剪辑",
							severity: "high",
							comment: "这里切得太跳，人物手的位置接不上。",
							fix: "延用上一个镜头半秒，或换一个连续动作 cut。",
						},
						{
							time: 8,
							category: "口型/音画",
							severity: "medium",
							comment: "这句台词口型慢了一拍。",
							fix: "把配音向后微调，重新对齐嘴型。",
						},
					]),
				duration: 0.1,
			};
		},
	};
}

describe("handleAnalyzeVideo review mode", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		registerReviewModel();
	});

	it("writes review JSON, CSV, HTML, report, raw output, and prompt snapshots", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-review-"));
		const captured: PipelineStep[] = [];

		const result = await handleAnalyzeVideo(
			makeAnalyzeOptions({ outputDir }),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(
			path.join(outputDir, "review-agent-report.md")
		);

		const params = captured[0]?.params as Record<string, unknown>;
		expect(params.prompt).toContain("真人审片老师");
		expect(params.analysis_type).toBe("review");

		const reviewJson = JSON.parse(
			readFileSync(path.join(outputDir, "review-comments.json"), "utf-8")
		) as { comments: unknown[]; promptLanguage: string };
		expect(reviewJson.promptLanguage).toBe("zh");
		expect(reviewJson.comments).toHaveLength(2);

		const csv = readFileSync(
			path.join(outputDir, "review-comments.csv"),
			"utf-8"
		);
		expect(csv).toContain("00:00:08");
		expect(csv).toContain("这句台词口型慢了一拍。");

		const browserHtml = readFileSync(
			path.join(outputDir, "review-feedback-browser.html"),
			"utf-8"
		);
		expect(browserHtml).toContain("这里切得太跳");
		expect(browserHtml).toContain("这句台词口型慢了一拍。");

		const summaryHtml = readFileSync(
			path.join(outputDir, "review-feedback-summary.html"),
			"utf-8"
		);
		expect(summaryHtml).toContain("镜头/剪辑");
		expect(summaryHtml).toContain("口型/音画");

		const report = readFileSync(
			path.join(outputDir, "review-agent-report.md"),
			"utf-8"
		);
		expect(report).toContain("Review comments: 2");

		const promptFiles = readdirSync(
			path.join(outputDir, "review-agent-prompts")
		);
		expect(promptFiles).toContain("00-master-video-review-agent-prompt.zh.md");
		expect(promptFiles).toContain("09-other-prompt.zh.md");
		expect(promptFiles).toHaveLength(10);
	});

	it("can use the English review prompt set", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-review-en-"));
		const captured: PipelineStep[] = [];

		const result = await handleAnalyzeVideo(
			makeAnalyzeOptions({ outputDir, reviewLanguage: "en" }),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);
		const params = captured[0]?.params as Record<string, unknown>;
		expect(params.prompt).toContain("human review director");

		const promptFiles = readdirSync(
			path.join(outputDir, "review-agent-prompts")
		);
		expect(promptFiles).toContain("00-master-video-review-agent-prompt.en.md");
		expect(promptFiles).toHaveLength(10);
	});

	it("parses review language flags from the command line", () => {
		const parsed = parseCliArgs([
			"analyze",
			"video",
			"-i",
			"sample.mp4",
			"--analysis-type",
			"review",
			"--review-language",
			"en",
		]);

		expect(parsed.command).toBe("analyze-video");
		expect(parsed.analysisType).toBe("review");
		expect(parsed.reviewLanguage).toBe("en");
	});

	it("keeps raw analysis artifacts when the model returns malformed JSON", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-review-bad-"));
		const captured: PipelineStep[] = [];

		const result = await handleAnalyzeVideo(
			makeAnalyzeOptions({ outputDir }),
			() => undefined,
			makeExecutor({
				captured,
				text: "not json, but keep this raw output",
			}) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);

		const reviewJson = JSON.parse(
			readFileSync(path.join(outputDir, "review-comments.json"), "utf-8")
		) as { comments: unknown[] };
		expect(reviewJson.comments).toHaveLength(0);

		const rawAnalysis = readFileSync(
			path.join(outputDir, "raw-analysis.json"),
			"utf-8"
		);
		expect(rawAnalysis).toContain("Review response did not contain valid JSON");
		expect(rawAnalysis).toContain("not json, but keep this raw output");
	});

	it("uses a readable display name for inline data URL videos", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-review-data-"));
		const captured: PipelineStep[] = [];

		const result = await handleAnalyzeVideo(
			makeAnalyzeOptions({
				outputDir,
				input: "data:video/mp4;base64,ZmFrZS12aWRlbw==",
			}),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);

		const reviewJson = JSON.parse(
			readFileSync(path.join(outputDir, "review-comments.json"), "utf-8")
		) as { video: string };
		expect(reviewJson.video).toBe("inline-video.mp4");

		const report = readFileSync(
			path.join(outputDir, "review-agent-report.md"),
			"utf-8"
		);
		expect(report).toContain("Video: inline-video.mp4");
	});
});

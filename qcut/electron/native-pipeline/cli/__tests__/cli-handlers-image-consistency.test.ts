import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ModelRegistry } from "../../infra/registry.js";
import { handleAnalyzeImageConsistencyWithDeps } from "../cli-handlers-image-consistency.js";
import type { ImageConsistencyResult } from "../../image-consistency/types.js";
import type { CLIRunOptions } from "../cli-runner/types.js";

function registerModel(): void {
	ModelRegistry.register({
		key: "openrouter_gemini_3_5_flash_video",
		name: "Gemini consistency test model",
		provider: "OpenRouter",
		providerBackend: "openrouter",
		endpoint: "chat/completions",
		categories: ["image_understanding"],
		description: "test",
		pricing: 0,
		defaults: { model: "google/gemini-3.5-flash" },
	});
}

function makeOptions({
	outputDir,
	refs = ["ref.png"],
	candidates = ["gen.png"],
	rulesFile,
}: {
	outputDir: string;
	refs?: string[];
	candidates?: string[];
	rulesFile?: string;
}): CLIRunOptions {
	return {
		command: "analyze-image-consistency",
		refs,
		candidates,
		rulesFile,
		outputDir,
		outputDirExplicit: true,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function makeResult(): ImageConsistencyResult {
	return {
		model: "openrouter_gemini_3_5_flash_video",
		language: "zh",
		referenceImages: ["ref.png"],
		candidateImages: ["gen.png"],
		ruleApplied: true,
		minSeverity: "high",
		findings: [
			{
				imageIndex: 0,
				imagePath: "gen.png",
				category: "prop/material",
				severity: "high",
				comment: "plastic",
				fix: "add texture",
			},
		],
	};
}

describe("handleAnalyzeImageConsistency", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		registerModel();
	});

	it("runs the pipeline, threads the rule file, and writes artifacts", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-cli-image-"));
		const ruleFile = path.join(outputDir, "rule.md");
		writeFileSync(ruleFile, "红纸飞机必须保留纸张纤维纹理");
		let capturedRule: string | undefined;

		const result = await handleAnalyzeImageConsistencyWithDeps({
			options: makeOptions({ outputDir, rulesFile: ruleFile }),
			onProgress: () => undefined,
			executor: {} as never,
			signal: new AbortController().signal,
			async runImageConsistencyCheckFn({ options }) {
				capturedRule = options.rule;
				return makeResult();
			},
		});

		expect(result.success).toBe(true);
		expect(capturedRule).toContain("红纸飞机必须保留纸张纤维纹理");
		expect(result.outputPath).toBe(
			path.join(outputDir, "image-consistency-report.md")
		);
		expect(
			existsSync(path.join(outputDir, "image-consistency-findings.json"))
		).toBe(true);
		expect(readFileSync(result.outputPath as string, "utf-8")).toContain(
			"Findings: 1"
		);
	});

	it("rejects missing references", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-cli-image-"));
		const result = await handleAnalyzeImageConsistencyWithDeps({
			options: makeOptions({ outputDir, refs: [] }),
			onProgress: () => undefined,
			executor: {} as never,
			signal: new AbortController().signal,
			async runImageConsistencyCheckFn() {
				return makeResult();
			},
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Missing --ref");
	});

	it("rejects missing candidates", async () => {
		const outputDir = mkdtempSync(path.join(os.tmpdir(), "qcut-cli-image-"));
		const result = await handleAnalyzeImageConsistencyWithDeps({
			options: makeOptions({ outputDir, candidates: [] }),
			onProgress: () => undefined,
			executor: {} as never,
			signal: new AbortController().signal,
			async runImageConsistencyCheckFn() {
				return makeResult();
			},
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("Missing --candidate");
	});
});

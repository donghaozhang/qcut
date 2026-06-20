import { describe, expect, it } from "vitest";
import type { PipelineStep } from "../../execution/executor.js";
import type { StepInput, StepOutput } from "../../execution/step-executors.js";
import { DEFAULT_IMAGE_CONSISTENCY_OPTIONS } from "../types.js";
import { runImageConsistencyCheck } from "../image-consistency-runner.js";

const collector = {
	collectCandidates() {
		return [
			{ index: 0, path: "data:image/png;base64,gen0" },
			{ index: 1, path: "data:image/png;base64,gen1" },
			{ index: 2, path: "data:image/png;base64,gen2" },
		];
	},
};

function makeExecutor({
	capturedInputs,
	capturedPrompts,
}: {
	capturedInputs: StepInput[];
	capturedPrompts: string[];
}): {
	executeStep: (
		step: PipelineStep,
		input: StepInput,
		options: Record<string, unknown>
	) => Promise<StepOutput>;
} {
	let callCount = 0;
	return {
		async executeStep(step: PipelineStep, input: StepInput) {
			capturedInputs.push(input);
			capturedPrompts.push(step.params.prompt as string);
			callCount += 1;
			const text =
				callCount === 1
					? JSON.stringify([
							{
								imageIndex: 0,
								category: "prop/material",
								severity: "high",
								comment: "plastic",
								fix: "add texture",
							},
							{
								imageIndex: 1,
								category: "identity/face",
								severity: "medium",
								comment: "slight drift",
								fix: "check",
							},
						])
					: JSON.stringify([
							{
								imageIndex: 2,
								category: "background/scene",
								severity: "high",
								comment: "different house",
								fix: "restore house",
							},
						]);
			return { success: true, text, duration: 0.1 };
		},
	};
}

describe("runImageConsistencyCheck", () => {
	it("batches candidates, repeats refs, labels global index, filters severity", async () => {
		const capturedInputs: StepInput[] = [];
		const capturedPrompts: string[] = [];

		const result = await runImageConsistencyCheck({
			options: {
				...DEFAULT_IMAGE_CONSISTENCY_OPTIONS,
				refs: ["data:image/png;base64,ref"],
				candidates: [],
				outputDir: "/tmp/qcut-image-consistency-runner",
				batchSize: 2,
				minSeverity: "high",
			},
			executor: makeExecutor({ capturedInputs, capturedPrompts }),
			collector,
		});

		// 3 candidates / batchSize 2 → 2 batches
		expect(capturedInputs).toHaveLength(2);
		// reference image carried in every batch, first position
		expect(capturedInputs[0]?.images?.[0]).toBe("data:image/png;base64,ref");
		expect(capturedInputs[1]?.images?.[0]).toBe("data:image/png;base64,ref");
		// second batch carries the global index (2), not a batch-local 0
		expect(capturedPrompts[1]).toContain("CANDIDATE index=2");
		// medium finding filtered out by min-severity high
		expect(result.findings).toHaveLength(2);
		expect(result.findings.map((finding) => finding.imageIndex)).toEqual([
			0, 2,
		]);
		expect(result.ruleApplied).toBe(false);
		expect(result.candidateImages).toHaveLength(3);
	});
});

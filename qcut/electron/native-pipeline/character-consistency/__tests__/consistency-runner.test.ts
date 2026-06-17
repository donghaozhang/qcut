import { describe, expect, it } from "vitest";
import type { PipelineStep } from "../../execution/executor.js";
import type { StepInput, StepOutput } from "../../execution/step-executors.js";
import { DEFAULT_CONSISTENCY_OPTIONS } from "../types.js";
import { runConsistencyCheck } from "../consistency-runner.js";

const frameTools = {
	async probeVideoMeta() {
		return {
			fps: 30,
			durationSeconds: 3,
			totalFrames: 90,
		};
	},
	async extractKeyframes() {
		return [
			{
				index: 0,
				frameNumber: 0,
				timeSeconds: 0,
				path: "data:image/jpeg;base64,frame0",
			},
			{
				index: 1,
				frameNumber: 30,
				timeSeconds: 1,
				path: "data:image/jpeg;base64,frame1",
			},
			{
				index: 2,
				frameNumber: 60,
				timeSeconds: 2,
				path: "data:image/jpeg;base64,frame2",
			},
		];
	},
};

function makeExecutor({ capturedInputs }: { capturedInputs: StepInput[] }): {
	executeStep: (
		step: PipelineStep,
		input: StepInput,
		options: {
			outputDir?: string;
			onProgress?: (percent: number, message: string) => void;
			signal?: AbortSignal;
		}
	) => Promise<StepOutput>;
} {
	let callCount = 0;
	return {
		async executeStep(step: PipelineStep, input: StepInput) {
			capturedInputs.push(input);
			callCount += 1;
			const text =
				callCount === 1
					? JSON.stringify([
							{
								frameNumber: 0,
								category: "proportion/height",
								severity: "high",
								comment: "too short",
								fix: "fix scale",
							},
							{
								frameNumber: 30,
								category: "proportion/height",
								severity: "high",
								comment: "still too short",
								fix: "fix scale",
							},
						])
					: JSON.stringify([
							{
								frameNumber: 60,
								category: "identity/face",
								severity: "medium",
								comment: "slight drift",
								fix: "check face",
							},
						]);
			expect(step.params.prompt).toContain("frameNumber");
			return { success: true, text, duration: 0.1 };
		},
	};
}

describe("runConsistencyCheck", () => {
	it("batches frames, repeats refs, merges adjacent findings, and filters severity", async () => {
		const capturedInputs: StepInput[] = [];

		const result = await runConsistencyCheck({
			options: {
				...DEFAULT_CONSISTENCY_OPTIONS,
				refs: ["data:image/jpeg;base64,ref"],
				videoInput: "video.mp4",
				outputDir: "/tmp/qcut-consistency-runner",
				batchSize: 2,
				minSeverity: "high",
			},
			executor: makeExecutor({ capturedInputs }),
			frameTools,
		});

		expect(capturedInputs).toHaveLength(2);
		expect(capturedInputs[0]?.images).toEqual([
			"data:image/jpeg;base64,ref",
			"data:image/jpeg;base64,frame0",
			"data:image/jpeg;base64,frame1",
		]);
		expect(capturedInputs[1]?.images?.[0]).toBe("data:image/jpeg;base64,ref");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.startFrame).toBe(0);
		expect(result.findings[0]?.endFrame).toBe(59);
		expect(result.findings[0]?.category).toBe("proportion/height");
	});
});

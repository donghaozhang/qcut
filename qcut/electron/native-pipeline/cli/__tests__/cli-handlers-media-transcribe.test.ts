import { beforeEach, describe, expect, it } from "vitest";
import { ModelRegistry } from "../../infra/registry.js";
import { registerSpeechToTextModels } from "../../registry-data/speech-to-text.js";
import type { PipelineStep } from "../../execution/executor.js";
import type { StepInput, StepOutput } from "../../execution/step-executors.js";
import { handleTranscribe } from "../cli-handlers-media.js";
import type { CLIRunOptions } from "../cli-runner/types.js";

function makeTranscribeOptions({
	model,
	provider,
}: {
	model?: string;
	provider?: string;
}): CLIRunOptions {
	return {
		command: "transcribe",
		model,
		provider,
		input: "sample-audio.mp3",
		outputDir: "/tmp/qcut-transcribe-test",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function makeExecutor({ captured }: { captured: PipelineStep[] }): {
	executeStep: (step: PipelineStep, input: StepInput) => Promise<StepOutput>;
} {
	return {
		async executeStep(step: PipelineStep, _input: StepInput) {
			captured.push(step);
			return {
				success: true,
				text: "hello from qcut",
				data: { text: "hello from qcut" },
				duration: 0.1,
			};
		},
	};
}

describe("handleTranscribe provider mapping", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		registerSpeechToTextModels();
	});

	it("defaults to the direct ElevenLabs model", async () => {
		const captured: PipelineStep[] = [];

		const result = await handleTranscribe(
			makeTranscribeOptions({}),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);
		expect(captured[0]?.model).toBe("elevenlabs_scribe_v2");
	});

	it("maps --provider elevenlabs to the direct ElevenLabs model", async () => {
		const captured: PipelineStep[] = [];

		const result = await handleTranscribe(
			makeTranscribeOptions({ provider: "elevenlabs" }),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);
		expect(captured[0]?.model).toBe("elevenlabs_scribe_v2");
	});

	it("keeps an explicit --model override", async () => {
		const captured: PipelineStep[] = [];

		const result = await handleTranscribe(
			makeTranscribeOptions({ model: "scribe_v2", provider: "elevenlabs" }),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(true);
		expect(captured[0]?.model).toBe("scribe_v2");
	});

	it("rejects unknown transcribe providers", async () => {
		const captured: PipelineStep[] = [];

		const result = await handleTranscribe(
			makeTranscribeOptions({ provider: "fal" }),
			() => undefined,
			makeExecutor({ captured }) as never,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown provider 'fal'");
		expect(captured).toHaveLength(0);
	});
});

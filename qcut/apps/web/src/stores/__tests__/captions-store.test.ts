import { beforeEach, describe, expect, it } from "vitest";
import type { TranscriptionResult } from "@/types/captions";
import { useCaptionsStore } from "@/stores/captions-store";

function transcriptionResult(): TranscriptionResult {
	return {
		language: "zh",
		segments: [
			{
				avg_logprob: -0.1,
				compression_ratio: 1,
				end: 3.75,
				id: 1,
				no_speech_prob: 0.05,
				seek: 0,
				start: 1.25,
				temperature: 0,
				text: "墨尔本的风",
				tokens: [1, 2, 3],
			},
		],
		text: "墨尔本的风",
	};
}

describe("captions store", () => {
	beforeEach(() => {
		useCaptionsStore.getState().reset();
	});

	it("creates an untrimmed timeline caption for the full segment duration", () => {
		const [caption] = useCaptionsStore
			.getState()
			.createCaptionElements(transcriptionResult());

		expect(caption).toMatchObject({
			duration: 2.5,
			startTime: 1.25,
			trimEnd: 0,
			trimStart: 0,
		});
		expect(
			caption.duration - caption.trimStart - caption.trimEnd
		).toBeGreaterThan(0);
	});
});

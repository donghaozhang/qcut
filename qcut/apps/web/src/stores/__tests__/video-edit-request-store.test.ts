import { beforeEach, describe, expect, it } from "vitest";
import { useVideoEditRequestStore } from "../video-edit-request-store";

describe("video edit request store", () => {
	beforeEach(() => {
		useVideoEditRequestStore.setState({ audioGenerationRequest: undefined });
	});

	it("keeps a clip-scoped audio request until its owner consumes it", () => {
		const first = {
			id: "request-1",
			sourceVideo: new File(["video"], "clip.mp4"),
			targetElementId: "clip-1",
			sourceStart: 3,
			sourceEnd: 8,
			autoStart: true,
		};
		useVideoEditRequestStore.getState().requestAudioGeneration(first);

		useVideoEditRequestStore
			.getState()
			.clearAudioGenerationRequest({ id: "different-request" });
		expect(useVideoEditRequestStore.getState().audioGenerationRequest).toBe(
			first
		);

		useVideoEditRequestStore
			.getState()
			.clearAudioGenerationRequest({ id: first.id });
		expect(
			useVideoEditRequestStore.getState().audioGenerationRequest
		).toBeUndefined();
	});
});

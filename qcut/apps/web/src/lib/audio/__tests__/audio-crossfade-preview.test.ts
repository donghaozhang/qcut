import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { resolveActiveAudioCrossfadePreview } from "../audio-crossfade-preview";

function clip({
	id,
	startTime,
	trimStart,
	trimEnd,
}: {
	id: string;
	startTime: number;
	trimStart: number;
	trimEnd: number;
}): MediaElement {
	return {
		id,
		type: "media",
		mediaId: `media-${id}`,
		name: id,
		duration: 6,
		startTime,
		trimStart,
		trimEnd,
	};
}

describe("audio crossfade preview", () => {
	it("extends source handles and produces equal-power midpoint gains", () => {
		const track: TimelineTrack = {
			id: "audio-track",
			name: "Audio",
			type: "audio",
			elements: [
				clip({ id: "from", startTime: 0, trimStart: 0, trimEnd: 1 }),
				clip({ id: "to", startTime: 5, trimStart: 1, trimEnd: 0 }),
			],
			audioCrossfades: [
				{
					id: "crossfade",
					fromElementId: "from",
					toElementId: "to",
					duration: 1,
					curve: "equal-power",
				},
			],
		};

		const preview = resolveActiveAudioCrossfadePreview({
			tracks: [track],
			currentTime: 5,
			fps: 30,
		});
		const from = preview.statesByElementId.get("from");
		const to = preview.statesByElementId.get("to");

		expect(from?.gain).toBeCloseTo(Math.SQRT1_2, 5);
		expect(to?.gain).toBeCloseTo(Math.SQRT1_2, 5);
		expect(from?.previewElement.trimEnd).toBe(0.5);
		expect(to?.previewElement.trimStart).toBe(0.5);
		expect(to?.previewElement.startTime).toBe(4.5);
		expect(preview.forceActiveElementIds).toEqual(new Set(["from", "to"]));
	});

	it("keeps a hard cut when source handles are unavailable", () => {
		const track: TimelineTrack = {
			id: "audio-track",
			name: "Audio",
			type: "audio",
			elements: [
				clip({ id: "from", startTime: 0, trimStart: 0, trimEnd: 0 }),
				clip({ id: "to", startTime: 6, trimStart: 0, trimEnd: 0 }),
			],
			audioCrossfades: [
				{
					id: "crossfade",
					fromElementId: "from",
					toElementId: "to",
					duration: 1,
					curve: "linear",
				},
			],
		};

		const preview = resolveActiveAudioCrossfadePreview({
			tracks: [track],
			currentTime: 6,
			fps: 30,
		});

		expect(preview.statesByElementId.size).toBe(0);
		expect(preview.forceActiveElementIds.size).toBe(0);
	});
});

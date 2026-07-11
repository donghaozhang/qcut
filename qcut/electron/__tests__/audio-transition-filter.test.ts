import { describe, expect, it } from "vitest";
import { buildTimelineAudioFilters } from "../ffmpeg/audio-filter-graph";
import type { AudioCrossfade, AudioFile } from "../ffmpeg/types";

function audioFiles({
	withHandles,
}: {
	withHandles: boolean;
}): AudioFile[] {
	return [
		{
			elementId: "clip-a",
			trackId: "track-1",
			path: "/a.mp4",
			startTime: 0,
			duration: 3,
			trimStart: 0,
			trimEnd: withHandles ? 1 : 0,
			playbackRate: 1,
		},
		{
			elementId: "clip-b",
			trackId: "track-1",
			path: "/b.mp4",
			startTime: withHandles ? 2 : 3,
			duration: 3,
			trimStart: withHandles ? 0.5 : 0,
			trimEnd: withHandles ? 0.5 : 0,
			playbackRate: 1,
		},
	];
}

function crossfade(): AudioCrossfade {
	return {
		id: "crossfade-1",
		trackId: "track-1",
		fromElementId: "clip-a",
		toElementId: "clip-b",
		duration: 1,
		curve: "equal-power",
	};
}

describe("audio transition filter graph", () => {
	it("builds equal-power envelopes from real source handles", () => {
		const result = buildTimelineAudioFilters({
			audioFiles: audioFiles({ withHandles: true }),
			audioCrossfades: [crossfade()],
			audioStartIndex: 0,
			fps: 30,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).toContain("atrim=start=0:duration=2.5");
		expect(filter).toContain("adelay=1500:all=1");
		expect(filter).toContain("cos(");
		expect(filter).toContain("sin(");
		expect(filter).toContain("amix=inputs=2:duration=longest");
	});

	it("keeps a hard cut when no crossfade is configured", () => {
		const result = buildTimelineAudioFilters({
			audioFiles: audioFiles({ withHandles: true }),
			audioStartIndex: 0,
			fps: 30,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).not.toContain("cos(");
		expect(filter).not.toContain("sin(");
		expect(filter).toContain("adelay=2000:all=1");
	});

	it.each([
		{
			name: "missing handles",
			files: audioFiles({ withHandles: false }),
		},
		{
			name: "speed curve",
			files: audioFiles({ withHandles: true }).map((file) => ({
				...file,
				speedKeyframes: [
					{ id: "speed-1", frame: 0, value: 1, easing: "linear" as const },
				],
			})),
		},
	])("falls back to a hard cut for $name", ({ files }) => {
		const result = buildTimelineAudioFilters({
			audioFiles: files,
			audioCrossfades: [crossfade()],
			audioStartIndex: 0,
			fps: 30,
		});
		const filter = result.filterSteps.join(";");

		expect(filter).not.toContain("cos(");
		expect(filter).not.toContain("sin(");
	});
});

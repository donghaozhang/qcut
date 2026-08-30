import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import { formatTracksForExport } from "../claude-timeline-bridge-helpers";

describe("Claude caption export", () => {
	it("preserves caption text and language for Compose read-back", () => {
		const tracks: TimelineTrack[] = [
			{
				id: "captions",
				name: "Compose Captions",
				type: "captions",
				elements: [
					{
						id: "caption-1",
						type: "captions",
						name: "Grace in motion",
						text: "Grace in motion",
						language: "en",
						source: "manual",
						startTime: 1,
						duration: 2,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		];

		const [caption] = formatTracksForExport({ tracks, fps: 30 })[0].elements;

		expect(caption).toMatchObject({
			type: "captions",
			content: "Grace in motion",
			language: "en",
		});
	});
});

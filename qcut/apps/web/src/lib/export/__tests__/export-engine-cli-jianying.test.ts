import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import type { VideoTransitionInput } from "../../export-cli/types";
import {
	applyJianyingTimelineTransitions,
	buildJianyingOutputPath,
	partitionJianyingTransitions,
} from "../export-engine-cli-jianying";

function transition({
	presetId,
	toElementId = "clip-b",
}: {
	presetId: string;
	toElementId?: string;
}): VideoTransitionInput {
	return {
		id: `transition-${presetId}`,
		trackId: "track-1",
		fromElementId: "clip-a",
		toElementId,
		presetId,
		type: "dissolve",
		easing: "linear",
		duration: 0.8,
	};
}

const tracks = [
	{
		id: "track-1",
		type: "media",
		elements: [
			{ id: "clip-a", type: "media", startTime: 0 },
			{ id: "clip-b", type: "media", startTime: 4 },
		],
	},
] as TimelineTrack[];

describe("Jianying timeline export", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("keeps local transitions out of the FFmpeg transition list", () => {
		const local = transition({ presetId: "jianying-local-traverse-3" });
		const qcut = transition({ presetId: "dissolve" });
		expect(
			partitionJianyingTransitions({ transitions: [qcut, local] })
		).toEqual({ qcutTransitions: [qcut], jianyingTransitions: [local] });
	});

	it("builds a separate postprocessed output path", () => {
		expect(buildJianyingOutputPath({ inputPath: "/tmp/output.mp4" })).toBe(
			"/tmp/output-jianying.mp4"
		);
	});

	it("passes the timeline cut and public preset ID to Electron", async () => {
		const renderTimeline = vi.fn().mockResolvedValue({
			outputPath: "/tmp/output-jianying.mp4",
			transitionCount: 1,
		});
		vi.stubGlobal("electronAPI", { jianyingTransitions: { renderTimeline } });
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { jianyingTransitions: { renderTimeline } },
		});

		await expect(
			applyJianyingTimelineTransitions({
				inputPath: "/tmp/output.mp4",
				transitions: [transition({ presetId: "jianying-local-traverse-3" })],
				tracks,
				fps: 30,
				width: 1920,
				height: 1080,
			})
		).resolves.toBe("/tmp/output-jianying.mp4");
		expect(renderTimeline).toHaveBeenCalledWith(
			expect.objectContaining({
				inputPath: "/tmp/output.mp4",
				outputPath: "/tmp/output-jianying.mp4",
				transitions: [
					{
						presetId: "jianying-local-traverse-3",
						cutTime: 4,
						duration: 0.8,
					},
				],
			})
		);
	});
});

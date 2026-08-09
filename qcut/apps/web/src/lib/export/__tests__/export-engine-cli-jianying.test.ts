import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import type { VideoTransitionInput } from "../../export-cli/types";
import {
	applyJianyingTimelineTransitions,
	buildJianyingOutputPath,
	partitionJianyingTransitions,
} from "../export-engine-cli-jianying";
import { resolveJianyingTransition } from "../../../../../../electron/jianying-transition-catalog";

function transition({
	presetId,
	toElementId = "clip-b",
	engine,
	packageHash,
}: {
	presetId: string;
	toElementId?: string;
	engine?: VideoTransitionInput["engine"];
	packageHash?: string;
}): VideoTransitionInput {
	return {
		id: `transition-${presetId}`,
		trackId: "track-1",
		fromElementId: "clip-a",
		toElementId,
		presetId,
		engine,
		packageHash,
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
		const definition = resolveJianyingTransition({
			value: "jianying-local-traverse-3",
		});
		expect(definition).toBeDefined();
		const local = transition({
			presetId: "jianying-local-traverse-3",
			engine: "jianying-local",
			packageHash: definition?.metadataMd5,
		});
		const qcut = transition({ presetId: "dissolve" });
		expect(
			partitionJianyingTransitions({ transitions: [qcut, local] })
		).toEqual({ qcutTransitions: [qcut], jianyingTransitions: [local] });
	});

	it("keeps explicit QCut transitions in the QCut renderer", () => {
		const transitionValue = transition({
			presetId: "jianying-local-traverse-3",
			engine: "qcut",
		});
		expect(
			partitionJianyingTransitions({ transitions: [transitionValue] })
		).toEqual({
			qcutTransitions: [transitionValue],
			jianyingTransitions: [],
		});
	});

	it("rejects a changed local package identity", () => {
		expect(() =>
			partitionJianyingTransitions({
				transitions: [
					transition({
						presetId: "jianying-local-traverse-3",
						engine: "jianying-local",
						packageHash: "0".repeat(32),
					}),
				],
			})
		).toThrow("package changed");
	});

	it("rejects an explicit local transition without package identity", () => {
		expect(() =>
			partitionJianyingTransitions({
				transitions: [
					transition({
						presetId: "jianying-local-traverse-3",
						engine: "jianying-local",
					}),
				],
			})
		).toThrow("package identity is missing");
	});

	it("builds a separate postprocessed output path", () => {
		expect(buildJianyingOutputPath({ inputPath: "/tmp/output.mp4" })).toBe(
			"/tmp/output-jianying.mp4"
		);
	});

	it("passes the timeline cut and public preset ID to Electron", async () => {
		const definition = resolveJianyingTransition({
			value: "jianying-local-traverse-3",
		});
		expect(definition).toBeDefined();
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
				transitions: [
					transition({
						presetId: "jianying-local-traverse-3",
						engine: "jianying-local",
						packageHash: definition?.metadataMd5,
					}),
				],
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
						packageHash: definition?.metadataMd5,
						cutTime: 4,
						duration: 0.8,
					},
				],
			})
		);
	});

	it("rejects missing package identity before invoking Electron", async () => {
		const renderTimeline = vi.fn();
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { jianyingTransitions: { renderTimeline } },
		});

		await expect(
			applyJianyingTimelineTransitions({
				inputPath: "/tmp/output.mp4",
				transitions: [
					transition({
						presetId: "jianying-local-traverse-3",
						engine: "jianying-local",
					}),
				],
				tracks,
				fps: 30,
				width: 1920,
				height: 1080,
			})
		).rejects.toThrow("package identity is missing");
		expect(renderTimeline).not.toHaveBeenCalled();
	});
});

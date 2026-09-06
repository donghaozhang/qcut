import { describe, expect, it, vi } from "vitest";
import {
	analyzeComposeMedia,
	type ComposeAnalysisClip,
} from "../native-pipeline/compose/compose-media-analysis";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client";

function clip({
	id = "clip",
	startTime = 4,
	muted = false,
}: {
	id?: string;
	startTime?: number;
	muted?: boolean;
} = {}): ComposeAnalysisClip {
	return {
		media: {
			id: "source",
			kind: "video",
			elementId: id,
			trackId: "main",
			startTime,
			trimStart: 2,
			duration: 10,
		},
		visibleDuration: 3,
		playbackRate: 2,
		muted,
	};
}

describe("Compose media analysis", () => {
	it("maps real detections through trim and speed, reusing source analysis", async () => {
		const post = vi.fn(async (path: string) => {
			if (path.endsWith("beats"))
				return {
					beats: [1, 2, 4, 8, Number.NaN].map((timestamp) => ({
						timestamp,
						strength: 0.8,
					})),
				};
			if (path.endsWith("scenes"))
				return {
					scenes: [{ timestamp: 0 }, { timestamp: 4 }, { timestamp: 9 }],
				};
			return {
				frames: [
					{
						timestamp: 2,
						description: "Opening shot",
						objects: ["stage"],
						mood: "calm",
						composition: "wide",
					},
					{
						timestamp: 4,
						description: "Close-up",
						objects: [],
						mood: "calm",
						composition: "centered",
					},
				],
			};
		});
		const result = await analyzeComposeMedia({
			client: { post } as unknown as EditorApiClient,
			projectId: "project",
			clips: [clip(), clip({ id: "repeat", startTime: 10, muted: true })],
			visual: true,
		});
		expect(post).toHaveBeenCalledTimes(3);
		expect(result.beats.map(({ timestamp }) => timestamp)).toEqual([4, 5]);
		expect(
			result.shots.map(({ startTime, duration }) => [startTime, duration])
		).toEqual([
			[4, 1],
			[5, 2],
			[10, 1],
			[11, 2],
		]);
		expect(result.shots[0].label).toContain("Opening shot");
		expect(result.warnings).toEqual([]);
	});
	it("does not call vision by default and reports unavailable analysis without leaking paths", async () => {
		const post = vi.fn().mockRejectedValue(new Error("/private/secret.mp4"));
		const result = await analyzeComposeMedia({
			client: { post } as unknown as EditorApiClient,
			projectId: "project",
			clips: [clip()],
		});
		expect(post).toHaveBeenCalledTimes(2);
		expect(result.beats).toEqual([]);
		expect(result.warnings).toHaveLength(2);
		expect(JSON.stringify(result)).not.toContain("/private");
		expect(result.shots[0].label).toBeUndefined();
	});
	it("honors cancellation before analysis", async () => {
		const post = vi.fn();
		await expect(
			analyzeComposeMedia({
				client: { post } as unknown as EditorApiClient,
				projectId: "project",
				clips: [clip()],
				signal: AbortSignal.abort(),
			})
		).rejects.toThrow();
		expect(post).not.toHaveBeenCalled();
	});
});

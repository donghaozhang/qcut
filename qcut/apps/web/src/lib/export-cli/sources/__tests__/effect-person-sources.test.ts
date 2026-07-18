import type {
	EffectPersonTrackingRenderStage,
	EffectRenderProgram,
	MediaElement,
	TimelineTrack,
} from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store";
import { extractEffectPersonSources } from "../effect-person-sources";

function personStage({
	treatment,
	fallback = "disable",
}: {
	treatment: EffectPersonTrackingRenderStage["treatment"];
	fallback?: EffectPersonTrackingRenderStage["fallback"];
}): EffectPersonTrackingRenderStage {
	return {
		kind: "person-tracking",
		target: "person",
		treatment,
		fallback,
	};
}

function program({
	stages,
}: {
	stages: EffectPersonTrackingRenderStage[];
}): EffectRenderProgram {
	return { version: 1, stages };
}

function mediaElement({ id = "clip-1" }: { id?: string } = {}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: "media-1",
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	};
}

function track({ element }: { element: MediaElement }): TimelineTrack {
	return {
		id: "track-1",
		name: "Video",
		type: "media",
		elements: [element],
	};
}

function mediaItem({ file }: { file?: File } = {}): MediaItem {
	return {
		id: "media-1",
		name: "person.mp4",
		type: "video",
		file: file ?? new File(["video"], "person.mp4", { type: "video/mp4" }),
	};
}

describe("extractEffectPersonSources", () => {
	it("deduplicates generated media by source and absent-person mode", async () => {
		const element = mediaElement();
		const generatePersonResource = vi.fn(
			async ({ absentPersonMode }: { absentPersonMode: string }) =>
				new Blob([absentPersonMode])
		);
		const saveTemp = vi.fn(
			async (_data: Uint8Array, filename: string) => `/tmp/${filename}`
		);
		const result = await extractEffectPersonSources({
			programsByElementId: new Map([
				[
					element.id,
					program({
						stages: [
							personStage({ treatment: "outline" }),
							personStage({ treatment: "spotlight" }),
							personStage({ treatment: "background-blur" }),
						],
					}),
				],
			]),
			tracks: [track({ element })],
			mediaItems: [mediaItem()],
			sessionId: "session-1",
			api: {
				readFile: vi.fn(),
				saveTemp,
			},
			generatePersonResource,
		});

		expect(generatePersonResource).toHaveBeenCalledTimes(2);
		expect(
			generatePersonResource.mock.calls
				.map(([request]) => request.absentPersonMode)
				.sort()
		).toEqual(["full-frame", "transparent"]);
		expect(saveTemp).toHaveBeenCalledTimes(2);
		expect(result.get(element.id)).toEqual([
			expect.objectContaining({ stageIndex: 0, animated: true }),
			expect.objectContaining({ stageIndex: 1, animated: true }),
			expect.objectContaining({ stageIndex: 2, animated: true }),
		]);
		expect(result.get(element.id)?.[1]?.path).toBe(
			result.get(element.id)?.[2]?.path
		);
	});

	it("materializes an empty persisted File from its local path", async () => {
		const element = mediaElement();
		const readFile = vi.fn(async () => Uint8Array.from([1, 2, 3]));
		const generatePersonResource = vi.fn(async ({ file }: { file: File }) => {
			expect(file.size).toBe(3);
			return new Blob(["alpha"]);
		});
		await extractEffectPersonSources({
			programsByElementId: new Map([
				[
					element.id,
					program({ stages: [personStage({ treatment: "outline" })] }),
				],
			]),
			tracks: [track({ element })],
			mediaItems: [
				{
					...mediaItem({ file: new File([], "person.mp4") }),
					localPath: "/project/person.mp4",
				},
			],
			sessionId: "session-1",
			api: {
				readFile,
				saveTemp: vi.fn(async () => "/tmp/person.webm"),
			},
			generatePersonResource,
		});
		expect(readFile).toHaveBeenCalledWith("/project/person.mp4");
		expect(generatePersonResource).toHaveBeenCalledTimes(1);
	});

	it("does no media work when no person stages exist", async () => {
		const generatePersonResource = vi.fn();
		const saveTemp = vi.fn();
		const result = await extractEffectPersonSources({
			programsByElementId: new Map([
				["clip-1", { version: 1, stages: [{ kind: "filter" }] }],
			]),
			tracks: [],
			mediaItems: [],
			sessionId: "session-1",
			api: { readFile: vi.fn(), saveTemp },
			generatePersonResource,
		});
		expect(result.size).toBe(0);
		expect(generatePersonResource).not.toHaveBeenCalled();
		expect(saveTemp).not.toHaveBeenCalled();
	});
});

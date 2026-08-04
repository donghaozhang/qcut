import { describe, expect, it } from "vitest";
import {
	buildExportSegmentInputArgs,
	collectExportSegments,
} from "../claude/handlers/claude-export-handler/export-engine.js";
import type { ExportSegment } from "../claude/handlers/claude-export-handler/types.js";
import type { ClaudeTimeline, MediaFile } from "../types/claude-api.js";

const mediaFiles: MediaFile[] = [
	{
		id: "media-1",
		name: "clip.mp4",
		type: "video",
		path: "/tmp/clip.mp4",
		size: 1000,
		duration: 400,
		createdAt: 0,
		modifiedAt: 0,
	},
];

function timelineWith(elements: Record<string, unknown>[]): ClaudeTimeline {
	return {
		name: "Trim audit",
		duration: 10,
		width: 1920,
		height: 1080,
		fps: 25,
		tracks: [
			{
				id: "media-track",
				index: 0,
				name: "Media",
				type: "media",
				elements: elements as ClaudeTimeline["tracks"][number]["elements"],
			},
		],
	};
}

describe("native export segment trims", () => {
	it("carries trimStart from timeline elements into export segments", async () => {
		const timeline = timelineWith([
			{
				id: "el-1",
				trackIndex: 0,
				type: "media",
				sourceId: "media-1",
				startTime: 0,
				endTime: 1.5,
				duration: 1.5,
				trimStart: 129.5,
				trimEnd: 269,
			},
			{
				id: "el-2",
				trackIndex: 0,
				type: "media",
				sourceId: "media-1",
				startTime: 1.5,
				endTime: 3,
				duration: 1.5,
			},
		]);

		const segments = await collectExportSegments({ timeline, mediaFiles });

		expect(segments).toHaveLength(2);
		expect(segments[0].trimStart).toBe(129.5);
		// Elements without trims default to source start.
		expect(segments[1].trimStart).toBe(0);
	});

	it("seeks to the trim in-point when building ffmpeg input args", () => {
		const segment: ExportSegment = {
			elementId: "clip-1",
			trackId: "track-1",
			trackOrder: 0,
			elementOrder: 0,
			sourcePath: "/tmp/clip.mp4",
			startTime: 26.6,
			duration: 1.5,
			trimStart: 129.5,
			sourceId: "media-1",
			fitMode: "cover",
		};

		expect(buildExportSegmentInputArgs({ segment })).toEqual([
			"-ss",
			"129.5",
			"-i",
			"/tmp/clip.mp4",
			"-t",
			"1.5",
		]);
	});

	it("omits the seek for untrimmed segments and images", () => {
		const untrimmed: ExportSegment = {
			elementId: "clip-1",
			trackId: "track-1",
			trackOrder: 0,
			elementOrder: 0,
			sourcePath: "/tmp/clip.mp4",
			startTime: 0,
			duration: 2,
			trimStart: 0,
			sourceId: "media-1",
			fitMode: "cover",
		};
		expect(buildExportSegmentInputArgs({ segment: untrimmed })).toEqual([
			"-i",
			"/tmp/clip.mp4",
			"-t",
			"2",
		]);

		const image: ExportSegment = {
			elementId: "image-1",
			trackId: "track-1",
			trackOrder: 0,
			elementOrder: 1,
			sourcePath: "/tmp/still.png",
			startTime: 0,
			duration: 3,
			trimStart: 5,
			sourceId: "media-2",
			isImage: true,
			fitMode: "cover",
		};
		expect(buildExportSegmentInputArgs({ segment: image })).toEqual([
			"-loop",
			"1",
			"-t",
			"3",
			"-i",
			"/tmp/still.png",
		]);
	});
});

import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "@/lib/audio/audio-properties";
import { analyzeTimelineForExport } from "../export-analysis";

function inputs(overrides: Partial<MediaElement> = {}) {
	const element: MediaElement = {
		id: "video-1",
		type: "media",
		mediaId: "asset-1",
		name: "Video",
		duration: 2,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
	const track: TimelineTrack = {
		id: "track-1",
		name: "Main",
		type: "media",
		isMain: true,
		elements: [element],
	};
	const media: MediaItem = {
		id: "asset-1",
		name: "video.mp4",
		type: "video",
		file: new File([], "video.mp4"),
		localPath: "/tmp/video.mp4",
		width: 1920,
		height: 1080,
		fps: 30,
	};
	return { tracks: [track], media: [media] };
}

describe("video visual export analysis", () => {
	it("keeps untouched video eligible for direct copy", () => {
		const { tracks, media } = inputs();
		const result = analyzeTimelineForExport(tracks, media, {
			width: 1920,
			height: 1080,
			fps: 30,
		});
		expect(result.hasVideoVisualEdits).toBe(false);
		expect(result.optimizationStrategy).toBe("direct-copy");
	});

	it("routes transformed video through the filter pipeline", () => {
		const { tracks, media } = inputs({ x: 80, flipHorizontal: true });
		const result = analyzeTimelineForExport(tracks, media, {
			width: 1920,
			height: 1080,
			fps: 30,
		});
		expect(result.hasVideoVisualEdits).toBe(true);
		expect(result.hasEffects).toBe(true);
		expect(result.canUseDirectCopy).toBe(false);
		expect(result.optimizationStrategy).toBe("direct-video-with-filters");
	});

	it("routes timing and clip audio edits through the filter pipeline", () => {
		for (const overrides of [
			{ playbackRate: 2 },
			{ reverse: true },
			{ freezeFrameTime: 0.5, freezeFrameDuration: 1 },
			{ audioFadeIn: 0.5 },
			{ audioDenoise: 40 },
		] satisfies Array<Partial<MediaElement>>) {
			const { tracks, media } = inputs(overrides);
			const result = analyzeTimelineForExport(tracks, media, {
				width: 1920,
				height: 1080,
				fps: 30,
			});
			expect(result.canUseDirectCopy).toBe(false);
			expect(result.optimizationStrategy).toBe("direct-video-with-filters");
		}
	});

	it("routes canonical professional audio effects through the filter pipeline", () => {
		const { tracks, media } = inputs({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				pitch: { enabled: true, semitones: 4, preserveFormants: true },
			},
		});
		const result = analyzeTimelineForExport(tracks, media, {
			width: 1920,
			height: 1080,
			fps: 30,
		});

		expect(result.hasEffects).toBe(true);
		expect(result.canUseDirectCopy).toBe(false);
		expect(result.optimizationStrategy).toBe("direct-video-with-filters");
	});
});

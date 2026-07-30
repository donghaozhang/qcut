import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "../jianying-draft/index.js";
import type {
	MediaElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";
import type {
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";

function createMediaElement({
	duration = 10,
	id,
	mediaId,
	playbackRate = 1,
	startTime = 0,
	trimEnd = 0,
	trimStart = 0,
}: {
	duration?: number;
	id: string;
	mediaId: string;
	playbackRate?: number;
	startTime?: number;
	trimEnd?: number;
	trimStart?: number;
}): MediaElement {
	return {
		duration,
		id,
		mediaId,
		name: id,
		playbackRate,
		startTime,
		trimEnd,
		trimStart,
		type: "media",
	};
}

function createTextElement({ id }: { id: string }): TextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content: "Needs native mapping",
		duration: 2,
		fontFamily: "Arial",
		fontSize: 48,
		fontStyle: "normal",
		fontWeight: "normal",
		id,
		name: id,
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		x: 0,
		y: 0,
	};
}

function createTrack({
	element,
	id,
	order,
	type = "media",
}: {
	element: MediaElement | TextElement;
	id: string;
	order: number;
	type?: TimelineTrack["type"];
}): TimelineTrack {
	return {
		elements: [element],
		hidden: false,
		id,
		muted: false,
		name: id,
		order,
		type,
	};
}

function createSnapshot({
	media,
	timelineDurationByElementId,
	tracks,
}: {
	media: QCutDraftExportMedia[];
	timelineDurationByElementId: Record<string, number>;
	tracks: TimelineTrack[];
}): QCutDraftExportSnapshotV1 {
	return {
		media,
		project: {
			backgroundColor: "#000000",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Interop Test",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId,
		tracks,
	};
}

const videoMedia: QCutDraftExportMedia = {
	duration: 10,
	height: 1080,
	id: "video-1",
	name: "clip.mov",
	sourcePath: "/source/clip.mov",
	type: "video",
	width: 1920,
};

const audioMedia: QCutDraftExportMedia = {
	duration: 4,
	id: "audio-1",
	name: "voice.wav",
	sourcePath: "C:\\source\\voice.wav",
	type: "audio",
};

describe("JianYing draft baseline", () => {
	it("maps a trimmed constant-speed video to integer microseconds", () => {
		const element = {
			...createMediaElement({
				duration: 10,
				id: "clip-1",
				mediaId: videoMedia.id,
				playbackRate: 2,
				startTime: 1,
				trimEnd: 3,
				trimStart: 2,
			}),
			opacity: 0.75,
			rotation: 12,
			scaleX: 1.2,
			scaleY: 1.2,
			x: 96,
			y: 54,
		};
		const result = buildJianyingDraft({
			createdAtUnixSeconds: 100,
			draftOutputDirectory: "/exports/draft-1",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [element.id]: 2.5 },
				tracks: [
					createTrack({
						element,
						id: "track-1",
						order: 0,
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_PROJECT_BACKGROUND",
				severity: "warning",
			})
		);
		expect(result.compatibility).toEqual({
			appSource: "lv",
			appVersion: "5.9.0",
			baseline: "synthetic-plaintext-5.9",
			contentFileName: "draft_info.json",
			contentFileNameEvidence: "platform-heuristic",
			registeredWithApp: false,
			verifiedWithInstalledApp: false,
		});
		expect(result.content.duration).toBe(3_500_000);
		expect(result.content.materials.videos).toHaveLength(1);
		expect(result.content.materials.speeds).toHaveLength(1);
		expect(result.assets[0]?.draftMediaPath).toContain("/assets/video/");

		const segment = result.content.tracks[0]?.segments[0];
		expect(segment?.target_timerange).toEqual({
			duration: 2_500_000,
			start: 1_000_000,
		});
		expect(segment?.source_timerange).toEqual({
			duration: 5_000_000,
			start: 2_000_000,
		});
		expect(segment?.clip).toMatchObject({
			alpha: 0.75,
			rotation: 12,
			scale: { x: 1.2, y: 1.2 },
			transform: { x: 0.1, y: -0.1 },
		});
		expect(segment?.uniform_scale).toEqual({ on: true, value: 1 });
	});

	it("exports visual tracks from bottom to top and deduplicates media", () => {
		const topElement = createMediaElement({
			duration: 3,
			id: "top-clip",
			mediaId: videoMedia.id,
		});
		const bottomElement = createMediaElement({
			duration: 3,
			id: "bottom-clip",
			mediaId: videoMedia.id,
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/draft-2",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: {
					[bottomElement.id]: 3,
					[topElement.id]: 3,
				},
				tracks: [
					createTrack({
						element: topElement,
						id: "top-track",
						order: 0,
					}),
					createTrack({
						element: bottomElement,
						id: "bottom-track",
						order: 1,
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.content.tracks.map(({ name }) => name)).toEqual([
			"bottom-track",
			"top-track",
		]);
		expect(result.content.tracks[0]?.segments[0]?.render_index).toBe(0);
		expect(result.content.tracks[1]?.segments[0]?.render_index).toBe(1);
		expect(result.content.materials.videos).toHaveLength(1);
		expect(result.content.materials.speeds).toHaveLength(2);
		expect(result.assets).toHaveLength(1);
	});

	it("sorts same-track segments by target time", () => {
		const earlierElement = createMediaElement({
			duration: 2,
			id: "earlier-clip",
			mediaId: videoMedia.id,
			startTime: 0,
		});
		const laterElement = createMediaElement({
			duration: 2,
			id: "later-clip",
			mediaId: videoMedia.id,
			startTime: 2,
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/sorted",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: {
					[earlierElement.id]: 2,
					[laterElement.id]: 2,
				},
				tracks: [
					{
						elements: [laterElement, earlierElement],
						id: "unsorted-track",
						name: "unsorted-track",
						order: 0,
						type: "media",
					},
				],
			}),
			targetPlatform: "macos",
		});

		expect(
			result.content.tracks[0]?.segments.map(
				({ target_timerange }) => target_timerange.start
			)
		).toEqual([0, 2_000_000]);
	});

	it("blocks unsupported visible elements instead of silently dropping them", () => {
		const text = createTextElement({ id: "title-1" });
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/draft-3",
			snapshot: createSnapshot({
				media: [],
				timelineDurationByElementId: {},
				tracks: [
					createTrack({
						element: text,
						id: "text-track",
						order: 0,
						type: "text",
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_TIMELINE_ELEMENT",
				elementId: text.id,
				severity: "error",
			})
		);
	});

	it("maps a dedicated audio track without visual clip settings", () => {
		const element = createMediaElement({
			duration: 4,
			id: "audio-clip",
			mediaId: audioMedia.id,
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "C:\\exports\\draft-3",
			snapshot: createSnapshot({
				media: [audioMedia],
				timelineDurationByElementId: { [element.id]: 4 },
				tracks: [
					createTrack({
						element,
						id: "audio-track",
						order: 0,
						type: "audio",
					}),
				],
			}),
			targetPlatform: "windows",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.materials.audios).toHaveLength(1);
		expect(result.content.tracks[0]?.type).toBe("audio");
		expect(result.content.tracks[0]?.segments[0]?.clip).toBeNull();
		expect(result.assets[0]?.draftMediaPath).toContain("\\assets\\audio\\");
		expect(result.compatibility.contentFileName).toBe("draft_content.json");
	});

	it("blocks source ranges that exceed the media duration", () => {
		const element = createMediaElement({
			duration: 10,
			id: "invalid-clip",
			mediaId: videoMedia.id,
			playbackRate: 2,
			trimStart: 8,
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/draft-4",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [element.id]: 2 },
				tracks: [
					createTrack({
						element,
						id: "track-4",
						order: 0,
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "SOURCE_RANGE_OUT_OF_BOUNDS",
				elementId: element.id,
			})
		);
		expect(result.content.tracks).toHaveLength(0);
	});

	it("reports malformed element time without throwing", () => {
		const element = createMediaElement({
			duration: 3,
			id: "negative-start",
			mediaId: videoMedia.id,
			startTime: -1,
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/draft-5",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [element.id]: 3 },
				tracks: [
					createTrack({
						element,
						id: "track-5",
						order: 0,
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "INVALID_ELEMENT_VALUE",
				elementId: element.id,
			})
		);
	});
});

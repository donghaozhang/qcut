import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type {
	MediaElement,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import { createQCutDraftExportSnapshot } from "../qcut-draft-export-snapshot";

function createProject({
	overrides = {},
}: {
	overrides?: Partial<TProject>;
} = {}): TProject {
	const createdAt = new Date("2026-07-31T00:00:00.000Z");
	return {
		id: "project-1",
		name: "Export project",
		thumbnail: "",
		createdAt,
		updatedAt: createdAt,
		scenes: [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				createdAt,
				updatedAt: createdAt,
			},
		],
		currentSceneId: "scene-1",
		backgroundColor: "#000000",
		backgroundType: "color",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		canvasMode: "preset",
		...overrides,
	};
}

function createMediaElement({
	id,
	mediaId,
	overrides = {},
}: {
	id: string;
	mediaId: string;
	overrides?: Partial<MediaElement>;
}): MediaElement {
	return {
		id,
		mediaId,
		name: `${mediaId}.mov`,
		type: "media",
		startTime: 0,
		duration: 10,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function createStickerElement({
	id,
	mediaId,
	overrides = {},
}: {
	id: string;
	mediaId: string;
	overrides?: Partial<StickerElement>;
}): StickerElement {
	return {
		id,
		mediaId,
		stickerId: `sticker-${id}`,
		name: `${mediaId}.png`,
		type: "sticker",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function createMediaItem({
	duration,
	height,
	id,
	importOriginalPath,
	localPath,
	type,
	width,
}: {
	duration?: number;
	height?: number;
	id: string;
	importOriginalPath?: string;
	localPath?: string;
	type: MediaItem["type"];
	width?: number;
}): MediaItem {
	return {
		id,
		name: `${id}.${type === "image" ? "png" : type === "audio" ? "wav" : "mov"}`,
		type,
		file: new File([], id),
		duration,
		height,
		localPath,
		width,
		importMetadata: importOriginalPath
			? {
					importMethod: "copy",
					originalPath: importOriginalPath,
					importedAt: 1,
					fileSize: 0,
				}
			: undefined,
	};
}

async function expectSuccessfulSnapshot({
	result,
}: {
	result: ReturnType<typeof createQCutDraftExportSnapshot>;
}) {
	const resolvedResult = await result;
	expect(resolvedResult.ok).toBe(true);
	if (!resolvedResult.ok) {
		throw new Error("Expected snapshot creation to succeed");
	}
	return resolvedResult.snapshot;
}

describe("createQCutDraftExportSnapshot", () => {
	it("uses source priority and includes unused media for compatibility review", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "visuals",
				name: "Visuals",
				type: "media",
				elements: [
					createMediaElement({ id: "video-el", mediaId: "video" }),
					createMediaElement({ id: "video-el-2", mediaId: "video" }),
				],
			},
			{
				id: "stickers",
				name: "Stickers",
				type: "sticker",
				elements: [createStickerElement({ id: "image-el", mediaId: "image" })],
			},
			{
				id: "audio",
				name: "Audio",
				type: "audio",
				elements: [createMediaElement({ id: "audio-el", mediaId: "audio" })],
			},
		];
		const mediaItems = [
			createMediaItem({
				id: "video",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
				localPath: "/local/video.mov",
				importOriginalPath: "/original/video.mov",
			}),
			createMediaItem({
				id: "image",
				type: "image",
				width: 800,
				height: 600,
				importOriginalPath: "C:\\original\\image.png",
			}),
			createMediaItem({
				id: "audio",
				type: "audio",
				duration: 18,
			}),
			createMediaItem({
				id: "unused",
				type: "video",
				duration: 99,
				width: 1,
				height: 1,
				localPath: "/local/unused.mov",
			}),
		];
		const getPathForFile = vi.fn((file: File) => `/file/${file.name}.wav`);

		const snapshot = await expectSuccessfulSnapshot({
			result: createQCutDraftExportSnapshot({
				project: createProject(),
				tracks,
				mediaItems,
				getPathForFile,
			}),
		});

		expect(snapshot.media).toEqual([
			{
				id: "video",
				name: "video.mov",
				sourcePath: "/local/video.mov",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
			},
			{
				id: "image",
				name: "image.png",
				sourcePath: "C:\\original\\image.png",
				type: "image",
				width: 800,
				height: 600,
			},
			{
				id: "audio",
				name: "audio.wav",
				sourcePath: "/file/audio.wav",
				type: "audio",
				duration: 18,
			},
			{
				id: "unused",
				name: "unused.mov",
				sourcePath: "/local/unused.mov",
				type: "video",
				duration: 99,
				width: 1,
				height: 1,
			},
		]);
		expect(snapshot.project).toEqual({
			id: "project-1",
			name: "Export project",
			sceneId: "scene-1",
			width: 1920,
			height: 1080,
			fps: 30,
			backgroundColor: "transparent",
			backgroundType: "color",
		});
		expect(getPathForFile).toHaveBeenCalledTimes(4);
		for (const mediaItem of mediaItems) {
			expect(getPathForFile).toHaveBeenCalledWith(mediaItem.file);
		}
	});

	it("falls through stale and invalid higher-priority source candidates", async () => {
		const mediaItem = createMediaItem({
			id: "video",
			type: "video",
			duration: 4,
			width: 1920,
			height: 1080,
			localPath: "/stale/video.mov",
			importOriginalPath: "/original/video.mov",
		});
		const getPathForFile = vi.fn(() => "/file/video.mov");
		const sourcePathExists = vi.fn(
			async ({ sourcePath }: { sourcePath: string }) =>
				sourcePath !== "/stale/video.mov"
		);

		const snapshot = await expectSuccessfulSnapshot({
			result: createQCutDraftExportSnapshot({
				project: createProject(),
				tracks: [
					{
						id: "visuals",
						name: "Visuals",
						type: "media",
						elements: [
							createMediaElement({ id: "video-el", mediaId: "video" }),
						],
					},
				],
				mediaItems: [mediaItem],
				getPathForFile,
				sourcePathExists,
			}),
		});

		expect(snapshot.media[0].sourcePath).toBe("/original/video.mov");
		expect(getPathForFile).toHaveBeenCalledWith(mediaItem.file);
		expect(sourcePathExists).toHaveBeenCalledTimes(3);
	});

	it.each([
		"#000000",
		"#000000ff",
	])("maps CapCut 8.1's equivalent default canvas color %s to transparent", async (backgroundColor) => {
		const snapshot = await expectSuccessfulSnapshot({
			result: createQCutDraftExportSnapshot({
				getPathForFile: vi.fn(() => undefined),
				mediaItems: [],
				project: createProject({
					overrides: { backgroundColor, backgroundType: "color" },
				}),
				tracks: [],
			}),
		});

		expect(snapshot.project.backgroundColor).toBe("transparent");
		expect(snapshot.project.backgroundType).toBe("color");
	});

	it("preserves project backgrounds that are not CapCut 8.1's default canvas", async () => {
		const snapshot = await expectSuccessfulSnapshot({
			result: createQCutDraftExportSnapshot({
				getPathForFile: vi.fn(() => undefined),
				mediaItems: [],
				project: createProject({
					overrides: {
						backgroundColor: "#ff0000",
						backgroundType: "color",
					},
				}),
				tracks: [],
			}),
		});

		expect(snapshot.project.backgroundColor).toBe("#ff0000");
	});

	it("uses playback-aware duration and preserves resolved color, masks, and effects", async () => {
		const mask = {
			type: "ellipse" as const,
			centerX: 0.5,
			centerY: 0.5,
			width: 0.8,
			height: 0.7,
			rotation: 0,
			feather: 0.1,
			invert: false,
			name: undefined,
		};
		const effect = {
			id: "effect-1",
			name: "Sharpen",
			effectType: "sharpen" as const,
			parameters: { sharpen: 25, opacity: undefined },
			duration: 12,
			enabled: true,
		};
		const mediaElement = createMediaElement({
			id: "video-el",
			mediaId: "video",
			overrides: {
				duration: 12,
				trimStart: 1,
				trimEnd: 1,
				playbackRate: 2,
				freezeFrameDuration: 1,
				groupId: undefined,
				color: {
					...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
					filter: {
						presetId: "clean",
						presetVersion: 1,
						intensity: 50,
					},
				},
				mask,
				effects: [effect],
			},
		});
		const stickerElement = createStickerElement({
			id: "sticker-el",
			mediaId: "sticker",
			overrides: { trimStart: 0.5, trimEnd: 0.5 },
		});
		const tracks: TimelineTrack[] = [
			{
				id: "visuals",
				name: "Visuals",
				type: "media",
				height: undefined,
				elements: [mediaElement],
			},
			{
				id: "stickers",
				name: "Stickers",
				type: "sticker",
				elements: [stickerElement],
			},
		];
		const tracksBefore = structuredClone(tracks);

		const snapshot = await expectSuccessfulSnapshot({
			result: createQCutDraftExportSnapshot({
				project: createProject({ overrides: { fps: 60 } }),
				tracks,
				mediaItems: [
					createMediaItem({
						id: "video",
						type: "video",
						duration: 12,
						width: 1920,
						height: 1080,
						localPath: "/local/video.mov",
					}),
					createMediaItem({
						id: "sticker",
						type: "image",
						width: 512,
						height: 512,
						localPath: "/local/sticker.png",
					}),
				],
				getPathForFile: vi.fn(() => undefined),
			}),
		});

		expect(snapshot.timelineDurationByElementId).toEqual({
			"video-el": 6,
			"sticker-el": 4,
		});
		const exportedMediaElement = snapshot.tracks[0].elements[0];
		expect(exportedMediaElement.type).toBe("media");
		if (exportedMediaElement.type !== "media") {
			throw new Error("Expected a media element");
		}
		expect(exportedMediaElement.color?.lut.cube?.values).toHaveLength(
			17 ** 3 * 3
		);
		expect(exportedMediaElement.color?.basic.sharpness).toBe(4);
		expect(exportedMediaElement.mask).toEqual({
			type: "ellipse",
			centerX: 0.5,
			centerY: 0.5,
			width: 0.8,
			height: 0.7,
			rotation: 0,
			feather: 0.1,
			invert: false,
		});
		expect(exportedMediaElement.effects).toEqual([
			{
				...effect,
				parameters: { sharpen: 25 },
			},
		]);
		expect("height" in snapshot.tracks[0]).toBe(false);
		expect("groupId" in exportedMediaElement).toBe(false);
		expect("name" in (exportedMediaElement.mask ?? {})).toBe(false);
		expect(tracks).toEqual(tracksBefore);
		expect(mediaElement.color?.lut.cube).toBeUndefined();
	});

	it("returns stable renderer issues for missing media and missing or invalid paths", async () => {
		const tracks: TimelineTrack[] = [
			{
				id: "visuals",
				name: "Visuals",
				type: "media",
				elements: [
					createMediaElement({ id: "missing-el", mediaId: "missing" }),
					createMediaElement({ id: "no-path-el", mediaId: "no-path" }),
					createMediaElement({ id: "invalid-el", mediaId: "invalid" }),
				],
			},
		];
		const noPath = createMediaItem({
			id: "no-path",
			type: "video",
			duration: 5,
			width: 1920,
			height: 1080,
		});
		const invalid = createMediaItem({
			id: "invalid",
			type: "video",
			duration: 5,
			width: 1920,
			height: 1080,
			localPath: "data:video/mp4;base64,AAAA",
			importOriginalPath: "relative/video.mov",
		});
		const unusedNoPath = createMediaItem({
			id: "unused-no-path",
			type: "audio",
			duration: 2,
		});

		const result = await createQCutDraftExportSnapshot({
			project: createProject(),
			tracks,
			mediaItems: [noPath, invalid, unusedNoPath],
			getPathForFile: (file) =>
				file === invalid.file ? "https://cdn.example/video.mov" : "",
		});

		expect(result).toEqual({
			ok: false,
			issues: [
				{
					code: "MISSING_MEDIA",
					elementId: "missing-el",
					mediaId: "missing",
					message:
						"Timeline element missing-el references missing media missing.",
					severity: "error",
					trackId: "visuals",
				},
				{
					code: "MISSING_MEDIA_SOURCE_PATH",
					elementId: "no-path-el",
					mediaId: "no-path",
					message:
						"Media no-path referenced by timeline element no-path-el has no filesystem source path.",
					severity: "error",
					trackId: "visuals",
				},
				{
					code: "INVALID_MEDIA_SOURCE_PATH",
					elementId: "invalid-el",
					mediaId: "invalid",
					message:
						"Media invalid referenced by timeline element invalid-el has no available absolute filesystem source path. Checked candidates: data:video/mp4;base64,AAAA, relative/video.mov, https://cdn.example/video.mov.",
					severity: "error",
					trackId: "visuals",
				},
				{
					code: "MISSING_MEDIA_SOURCE_PATH",
					mediaId: "unused-no-path",
					message:
						"Media unused-no-path in the project media bin has no filesystem source path.",
					severity: "error",
				},
			],
		});
		expect("snapshot" in result).toBe(false);
	});
});

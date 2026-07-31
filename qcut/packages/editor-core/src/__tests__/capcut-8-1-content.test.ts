import { describe, expect, it } from "vitest";
import {
	buildJianyingDraft,
	composeCapCut81BuildResultContent,
	composeCapCut81Content,
	CAPCUT_8_1_CONFIG_KEYS,
	CAPCUT_8_1_KEYFRAME_BUCKET_KEYS,
	CAPCUT_8_1_MATERIAL_BUCKET_KEYS,
	CAPCUT_8_1_TOP_LEVEL_KEYS,
	parseCapCut81PlaceholderAssetPath,
	validateCapCut81Content,
} from "../jianying-draft/index.js";
import type {
	JianyingDraftBuildResult,
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";
import type {
	MediaElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";

const TIMELINE_ID = "11111111-2222-4333-8444-555555555555";
const PLACEHOLDER_ID = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";

function createMediaElement({
	id,
	mediaId,
}: {
	id: string;
	mediaId: string;
}): MediaElement {
	return {
		duration: 4,
		id,
		mediaId,
		name: id,
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createTrack({
	element,
	id,
	order,
	type,
}: {
	element: MediaElement;
	id: string;
	order: number;
	type: TimelineTrack["type"];
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

function createBuildResult(): JianyingDraftBuildResult {
	const media: QCutDraftExportMedia[] = [
		{
			duration: 4,
			height: 720,
			id: "video-1",
			name: "private-video.mov",
			sourcePath: "/Users/private/Videos/private-video.mov",
			type: "video",
			width: 1280,
		},
		{
			height: 720,
			id: "image-1",
			name: "private-image.png",
			sourcePath: "/Users/private/Pictures/private-image.png",
			type: "image",
			width: 1280,
		},
		{
			duration: 4,
			id: "audio-1",
			name: "private-audio.wav",
			sourcePath: "/Users/private/Audio/private-audio.wav",
			type: "audio",
		},
	];
	const videoElement = createMediaElement({
		id: "video-element",
		mediaId: "video-1",
	});
	const imageElement = createMediaElement({
		id: "image-element",
		mediaId: "image-1",
	});
	const audioElement = createMediaElement({
		id: "audio-element",
		mediaId: "audio-1",
	});
	const snapshot: QCutDraftExportSnapshotV1 = {
		media,
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 720,
			id: "project-1",
			name: "Modern Content Test",
			sceneId: "scene-1",
			width: 1280,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {
			[audioElement.id]: 4,
			[imageElement.id]: 4,
			[videoElement.id]: 4,
		},
		tracks: [
			createTrack({
				element: videoElement,
				id: "video-track",
				order: 0,
				type: "media",
			}),
			createTrack({
				element: imageElement,
				id: "image-track",
				order: 1,
				type: "media",
			}),
			createTrack({
				element: audioElement,
				id: "audio-track",
				order: 2,
				type: "audio",
			}),
		],
	};

	return buildJianyingDraft({
		createdAtUnixSeconds: 123,
		draftOutputDirectory: "/legacy/output",
		snapshot,
		targetPlatform: "macos",
	});
}

function createTextBuildResult(): JianyingDraftBuildResult {
	const text: TextElement = {
		backgroundColor: "transparent",
		color: "#ffffff",
		content: "CapCut text",
		duration: 4,
		fontFamily: "Arial",
		fontSize: 64,
		fontStyle: "normal",
		fontWeight: "normal",
		id: "text-element",
		name: "text-element",
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
	const snapshot: QCutDraftExportSnapshotV1 = {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 720,
			id: "text-project",
			name: "Modern Text Test",
			sceneId: "text-scene",
			width: 1280,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {
			[text.id]: 4,
		},
		tracks: [
			{
				elements: [text],
				id: "text-track",
				name: "Text",
				order: 0,
				type: "text",
			},
		],
	};

	return buildJianyingDraft({
		createdAtUnixSeconds: 123,
		draftOutputDirectory: "/legacy/output",
		snapshot,
		targetPlatform: "macos",
	});
}

describe("CapCut 8.1 modern content composer", () => {
	it("composes the exact modern envelope without mutating legacy content", () => {
		const buildResult = createBuildResult();
		const sourceBefore = JSON.stringify(buildResult);
		const content = composeCapCut81BuildResultContent({
			buildResult,
			placeholderId: PLACEHOLDER_ID,
			targetPlatform: "macos",
			timelineId: TIMELINE_ID,
		});

		expect(Object.keys(content)).toEqual(CAPCUT_8_1_TOP_LEVEL_KEYS);
		expect(Object.keys(content.config)).toEqual(CAPCUT_8_1_CONFIG_KEYS);
		expect(Object.keys(content.keyframes)).toEqual(
			CAPCUT_8_1_KEYFRAME_BUCKET_KEYS
		);
		expect(Object.keys(content.materials)).toEqual(
			CAPCUT_8_1_MATERIAL_BUCKET_KEYS
		);
		expect(Object.keys(content.canvas_config)).toEqual([
			"ratio",
			"width",
			"height",
			"background",
		]);
		expect(content.id).toBe(TIMELINE_ID);
		expect(content.duration).toBe(buildResult.content.duration);
		expect(content.create_time).toBe(buildResult.content.create_time);
		expect(content.update_time).toBe(buildResult.content.update_time);
		expect(content.fps).toBe(buildResult.content.fps);
		expect(content.tracks).not.toBe(buildResult.content.tracks);
		expect(content.tracks.map(({ flag }) => flag)).toEqual([0, 2, 0]);
		for (let trackIndex = 0; trackIndex < content.tracks.length; trackIndex++) {
			const sourceTrack = buildResult.content.tracks[trackIndex];
			const modernTrack = content.tracks[trackIndex];
			expect(
				modernTrack.segments.map(({ track_render_index }) => track_render_index)
			).toEqual(modernTrack.segments.map(() => trackIndex));
			expect(modernTrack.segments.map(({ clip }) => clip)).toEqual(
				sourceTrack.segments.map(({ clip }) => clip)
			);
		}
		expect(content.tracks[2]?.segments[0]?.render_index).toBe(0);
		expect(content.render_index_track_mode_on).toBe(true);
		expect(content.color_space).toBe(-1);
		expect(content.new_version).toBe("159.0.0");
		expect(JSON.stringify(buildResult)).toBe(sourceBefore);
		expect(() => validateCapCut81Content({ content })).not.toThrow();
	});

	it("uses CapCut text timing while preserving target timing and clip geometry", () => {
		const buildResult = createTextBuildResult();
		const sourceSegment = buildResult.content.tracks[0]?.segments[0];
		const content = composeCapCut81BuildResultContent({
			buildResult,
			placeholderId: PLACEHOLDER_ID,
			targetPlatform: "macos",
			timelineId: TIMELINE_ID,
		});
		const modernSegment = content.tracks[0]?.segments[0];

		expect(sourceSegment?.source_timerange).toEqual({
			duration: 4_000_000,
			start: 0,
		});
		expect(modernSegment).toMatchObject({
			clip: sourceSegment?.clip,
			source_timerange: null,
			target_timerange: sourceSegment?.target_timerange,
			track_render_index: 0,
		});
		expect(content.materials.material_animations).toEqual([]);
		expect(modernSegment?.extra_material_refs).toEqual([]);
	});

	it("rewrites video, image, and audio paths to one placeholder namespace", () => {
		const buildResult = createBuildResult();
		const content = composeCapCut81BuildResultContent({
			buildResult,
			placeholderId: PLACEHOLDER_ID,
			targetPlatform: "macos",
			timelineId: TIMELINE_ID,
		});
		const paths = [
			...content.materials.videos.map(({ path }) => path),
			...content.materials.audios.map(({ path }) => path),
		];

		expect(paths).toHaveLength(3);
		expect(
			paths.map((path) => parseCapCut81PlaceholderAssetPath({ path }))
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					mediaFolder: "video",
					placeholderId: PLACEHOLDER_ID,
				}),
				expect.objectContaining({
					mediaFolder: "image",
					placeholderId: PLACEHOLDER_ID,
				}),
				expect.objectContaining({
					mediaFolder: "audio",
					placeholderId: PLACEHOLDER_ID,
				}),
			])
		);

		const serialized = JSON.stringify(content);
		expect(serialized).not.toContain("/Users/private");
		expect(serialized).not.toContain("/legacy/output");
		expect(
			content.materials.videos.every(({ media_path }) => !media_path)
		).toBe(true);
	});

	it("preserves material and track ids while changing only the content id", () => {
		const buildResult = createBuildResult();
		const content = composeCapCut81BuildResultContent({
			buildResult,
			placeholderId: PLACEHOLDER_ID,
			targetPlatform: "macos",
			timelineId: TIMELINE_ID,
		});
		const sourceMaterialIds = [
			...buildResult.content.materials.videos,
			...buildResult.content.materials.audios,
			...buildResult.content.materials.speeds,
		].map(({ id }) => id);
		const modernMaterialIds = [
			...content.materials.videos,
			...content.materials.audios,
			...content.materials.speeds,
		].map(({ id }) => id);

		expect(modernMaterialIds).toEqual(sourceMaterialIds);
		expect(content.tracks.map(({ id }) => id)).toEqual(
			buildResult.content.tracks.map(({ id }) => id)
		);
		expect(content.id).not.toBe(buildResult.content.id);
	});

	it("emits no machine identity and maps the requested platform", () => {
		const buildResult = createBuildResult();
		const content = composeCapCut81BuildResultContent({
			buildResult,
			placeholderId: PLACEHOLDER_ID,
			targetPlatform: "windows",
			timelineId: TIMELINE_ID,
		});

		expect(content.platform).toEqual({
			app_id: 359_289,
			app_source: "cc",
			app_version: "8.1.1",
			device_id: "",
			hard_disk_id: "",
			mac_address: "",
			os: "windows",
			os_version: "",
		});
		expect(content.last_modified_platform).toEqual(content.platform);
		expect(content.last_modified_platform).not.toBe(content.platform);
	});

	it("rejects non-empty legacy masks instead of dropping them", () => {
		const buildResult = createBuildResult();
		buildResult.content.materials.masks = [{ id: "legacy-mask" }];

		expect(() =>
			composeCapCut81BuildResultContent({
				buildResult,
				placeholderId: PLACEHOLDER_ID,
				targetPlatform: "macos",
				timelineId: TIMELINE_ID,
			})
		).toThrow("non-empty legacy masks");
	});

	it("rejects incomplete asset-to-material mappings", () => {
		const buildResult = createBuildResult();

		expect(() =>
			composeCapCut81Content({
				assets: buildResult.assets.slice(1),
				content: buildResult.content,
				placeholderId: PLACEHOLDER_ID,
				targetPlatform: "macos",
				timelineId: TIMELINE_ID,
			})
		).toThrow("has no matching asset");
	});

	it("rejects blocked build results and invalid placeholder ids", () => {
		const blockedResult = createBuildResult();
		blockedResult.canWrite = false;

		expect(() =>
			composeCapCut81BuildResultContent({
				buildResult: blockedResult,
				placeholderId: PLACEHOLDER_ID,
				targetPlatform: "macos",
				timelineId: TIMELINE_ID,
			})
		).toThrow("blocked build result");

		const buildResult = createBuildResult();
		expect(() =>
			composeCapCut81BuildResultContent({
				buildResult,
				placeholderId: "not-a-uuid",
				targetPlatform: "macos",
				timelineId: TIMELINE_ID,
			})
		).toThrow("placeholderId must be a UUID");
	});
});

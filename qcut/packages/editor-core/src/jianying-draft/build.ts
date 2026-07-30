import { normalizeTrackOrder } from "../timeline/track-utils.js";
import type { TimelineElement, TimelineTrack } from "../types/timeline.js";
import {
	createEmptyJianyingKeyframes,
	createEmptyJianyingMaterials,
	createJianyingConfig,
	JIANYING_PLAINTEXT_SCHEMA_VERSION,
} from "./constants.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import {
	mapMediaElementToJianying,
	type MappedMediaElement,
} from "./media-mapping.js";
import { secondsToMicroseconds } from "./time.js";
import type {
	JianyingDraftBuildResult,
	JianyingDraftContent,
	JianyingDraftIssue,
	JianyingDraftPlatform,
	JianyingSpeedMaterial,
	JianyingDraftTargetPlatform,
	JianyingDraftTrack,
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "./types.js";
import { hasLossyTrackAudioSettings } from "./unsupported-features.js";
import {
	validateJianyingExportSnapshot,
	validateJianyingMediaElement,
} from "./snapshot-validation.js";
import { validateJianyingDraftContent } from "./validation.js";

interface BuildJianyingDraftOptions {
	createdAtUnixSeconds?: number;
	draftOutputDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

interface BuildTrackContext {
	assetsByMediaId: Map<string, MappedMediaElement["asset"]>;
	issues: JianyingDraftIssue[];
	mappedMaterialsByMediaId: Map<string, MappedMediaElement>;
	mediaById: Map<string, QCutDraftExportMedia>;
	options: BuildJianyingDraftOptions;
	speedMaterialsById: Map<string, JianyingSpeedMaterial>;
	track: TimelineTrack;
}

function createPlatform({
	targetPlatform,
}: {
	targetPlatform: JianyingDraftTargetPlatform;
}): JianyingDraftPlatform {
	return {
		app_id: 3704,
		app_source: "lv",
		app_version: "5.9.0",
		os: targetPlatform === "macos" ? "mac" : "windows",
	};
}

function getSafeCreatedAtUnixSeconds({
	createdAtUnixSeconds,
}: {
	createdAtUnixSeconds: number;
}): number {
	try {
		secondsToMicroseconds({ seconds: createdAtUnixSeconds });
		return createdAtUnixSeconds;
	} catch {
		return 0;
	}
}

function addUnsupportedElementIssue({
	element,
	issues,
	track,
}: {
	element: TimelineElement;
	issues: JianyingDraftIssue[];
	track: TimelineTrack;
}): void {
	issues.push({
		code: "UNSUPPORTED_TIMELINE_ELEMENT",
		severity: "error",
		message: `Element type ${element.type} needs mapping or baking before export.`,
		elementId: element.id,
		trackId: track.id,
	});
}

function mapTrack({
	assetsByMediaId,
	issues,
	mappedMaterialsByMediaId,
	mediaById,
	options,
	speedMaterialsById,
	track,
}: BuildTrackContext): JianyingDraftTrack | null {
	if (track.type !== "media" && track.type !== "audio") {
		for (const element of track.elements) {
			if (!element.hidden) {
				addUnsupportedElementIssue({ element, issues, track });
			}
		}
		return null;
	}
	if ((track.transitions?.length ?? 0) > 0) {
		issues.push({
			code: "UNSUPPORTED_TRACK_TRANSITION",
			severity: "error",
			message: `Track ${track.id} contains transitions that need mapping or baking.`,
			trackId: track.id,
		});
	}
	if (hasLossyTrackAudioSettings({ track })) {
		issues.push({
			code: "UNSUPPORTED_TRACK_AUDIO_MIX",
			severity: "warning",
			message: `Track ${track.id} audio-bus processing is not mapped yet.`,
			trackId: track.id,
		});
	}

	const segments: MappedMediaElement["segment"][] = [];
	for (const element of track.elements) {
		if (element.hidden) continue;
		if (element.type !== "media") {
			addUnsupportedElementIssue({ element, issues, track });
			continue;
		}
		const media = mediaById.get(element.mediaId);
		const elementIssues = validateJianyingMediaElement({
			element,
			media,
			snapshot: options.snapshot,
			track,
		});
		issues.push(...elementIssues);
		if (!media || elementIssues.some(({ severity }) => severity === "error")) {
			continue;
		}
		const mapped = mapMediaElementToJianying({
			canvasHeight: options.snapshot.project.height,
			canvasWidth: options.snapshot.project.width,
			draftOutputDirectory: options.draftOutputDirectory,
			element,
			media,
			targetPlatform: options.targetPlatform,
			timelineDuration:
				options.snapshot.timelineDurationByElementId[element.id],
		});
		segments.push(mapped.segment);
		assetsByMediaId.set(media.id, mapped.asset);
		speedMaterialsById.set(mapped.speedMaterial.id, mapped.speedMaterial);
		if (!mappedMaterialsByMediaId.has(media.id)) {
			mappedMaterialsByMediaId.set(media.id, mapped);
		}
	}
	if (segments.length === 0) return null;

	return {
		attribute: track.muted ? 1 : 0,
		flag: 0,
		id: createDeterministicJianyingId({
			namespace: "track",
			sourceId: track.id,
		}),
		is_default_name: track.name.length === 0,
		name: track.name,
		segments: [...segments].sort(
			(left, right) =>
				left.target_timerange.start - right.target_timerange.start
		),
		type: track.type === "audio" ? "audio" : "video",
	};
}

function orderExportTracks({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TimelineTrack[] {
	const orderedTracks = normalizeTrackOrder({ tracks }).filter(
		({ hidden }) => !hidden
	);
	const visualTracks = orderedTracks
		.filter(({ type }) => type !== "audio")
		.reverse();
	const audioTracks = orderedTracks.filter(({ type }) => type === "audio");
	return [...visualTracks, ...audioTracks];
}

function createDraftContent({
	createdAtUnixSeconds,
	draftTracks,
	mappedMaterialsByMediaId,
	options,
	speedMaterialsById,
}: {
	createdAtUnixSeconds: number;
	draftTracks: JianyingDraftTrack[];
	mappedMaterialsByMediaId: Map<string, MappedMediaElement>;
	options: BuildJianyingDraftOptions;
	speedMaterialsById: Map<string, JianyingSpeedMaterial>;
}): JianyingDraftContent {
	const materials = createEmptyJianyingMaterials();
	for (const mapped of mappedMaterialsByMediaId.values()) {
		if (mapped.videoMaterial) materials.videos.push(mapped.videoMaterial);
		if (mapped.audioMaterial) materials.audios.push(mapped.audioMaterial);
	}
	materials.speeds.push(...speedMaterialsById.values());
	const duration = draftTracks.reduce(
		(maximum, { segments }) =>
			Math.max(
				maximum,
				...segments.map(
					({ target_timerange }) =>
						target_timerange.start + target_timerange.duration
				)
			),
		0
	);
	const platform = createPlatform({
		targetPlatform: options.targetPlatform,
	});

	return {
		canvas_config: {
			height: options.snapshot.project.height,
			ratio: "original",
			width: options.snapshot.project.width,
		},
		color_space: 0,
		config: createJianyingConfig(),
		cover: null,
		create_time: secondsToMicroseconds({ seconds: createdAtUnixSeconds }),
		duration,
		extra_info: null,
		fps: options.snapshot.project.fps,
		free_render_index_mode_on: false,
		group_container: null,
		id: createDeterministicJianyingId({
			namespace: "draft",
			sourceId: `${options.snapshot.project.id}:${options.snapshot.project.sceneId}`,
		}),
		keyframe_graph_list: [],
		keyframes: createEmptyJianyingKeyframes(),
		last_modified_platform: { ...platform },
		materials,
		mutable_config: null,
		name: options.snapshot.project.name,
		new_version: "110.0.0",
		platform,
		relationships: [],
		render_index_track_mode_on: false,
		retouch_cover: null,
		source: "default",
		static_cover_image_path: "",
		time_marks: null,
		tracks: draftTracks,
		update_time: secondsToMicroseconds({ seconds: createdAtUnixSeconds }),
		version: JIANYING_PLAINTEXT_SCHEMA_VERSION,
	};
}

export function buildJianyingDraft({
	createdAtUnixSeconds = 0,
	draftOutputDirectory,
	snapshot,
	targetPlatform,
}: BuildJianyingDraftOptions): JianyingDraftBuildResult {
	const options: BuildJianyingDraftOptions = {
		createdAtUnixSeconds,
		draftOutputDirectory,
		snapshot,
		targetPlatform,
	};
	const safeCreatedAtUnixSeconds = getSafeCreatedAtUnixSeconds({
		createdAtUnixSeconds,
	});
	const issues = validateJianyingExportSnapshot({
		createdAtUnixSeconds,
		draftOutputDirectory,
		snapshot,
	});
	const mediaById = new Map(snapshot.media.map((media) => [media.id, media]));
	const mappedMaterialsByMediaId = new Map<string, MappedMediaElement>();
	const speedMaterialsById = new Map<string, JianyingSpeedMaterial>();
	const assetsByMediaId = new Map<string, MappedMediaElement["asset"]>();
	const mappedTracks: JianyingDraftTrack[] = [];

	const hasFatalSnapshotIssue = issues.some(
		({ code }) => code === "INVALID_EXPORT_SNAPSHOT"
	);
	if (!hasFatalSnapshotIssue) {
		for (const track of orderExportTracks({ tracks: snapshot.tracks })) {
			const mappedTrack = mapTrack({
				assetsByMediaId,
				issues,
				mappedMaterialsByMediaId,
				mediaById,
				options,
				speedMaterialsById,
				track,
			});
			if (mappedTrack) mappedTracks.push(mappedTrack);
		}
	}
	const draftTracks = mappedTracks.map((track, renderIndex) => ({
		...track,
		segments: track.segments.map((segment) => ({
			...segment,
			render_index: renderIndex,
		})),
	}));
	const content = createDraftContent({
		createdAtUnixSeconds: safeCreatedAtUnixSeconds,
		draftTracks,
		mappedMaterialsByMediaId,
		options,
		speedMaterialsById,
	});
	issues.push(...validateJianyingDraftContent({ content }));

	return {
		assets: [...assetsByMediaId.values()],
		canWrite: !issues.some(({ severity }) => severity === "error"),
		compatibility: {
			appSource: "lv",
			appVersion: "5.9.0",
			baseline: "synthetic-plaintext-5.9",
			contentFileName: "draft_content.json",
			contentFileNameEvidence: "plaintext-5.9-reference",
			registeredWithApp: false,
			verifiedWithInstalledApp: false,
		},
		content,
		issues,
	};
}

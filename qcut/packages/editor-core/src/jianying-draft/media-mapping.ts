import type { MediaElement } from "../types/timeline.js";
import { JIANYING_IMAGE_SOURCE_DURATION_MICROSECONDS } from "./constants.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import { buildJianyingAssetPaths } from "./paths.js";
import { secondsToMicroseconds } from "./time.js";
import type {
	JianyingAudioMaterial,
	JianyingDraftAssetCopy,
	JianyingDraftMediaType,
	JianyingDraftSegment,
	JianyingDraftTargetPlatform,
	JianyingSpeedMaterial,
	JianyingVideoMaterial,
	QCutDraftExportMedia,
} from "./types.js";

interface MapMediaElementOptions {
	canvasHeight: number;
	canvasWidth: number;
	draftOutputDirectory: string;
	element: MediaElement;
	media: QCutDraftExportMedia;
	targetPlatform: JianyingDraftTargetPlatform;
	timelineDuration: number;
}

export interface MappedMediaElement {
	asset: JianyingDraftAssetCopy;
	audioMaterial?: JianyingAudioMaterial;
	segment: JianyingDraftSegment;
	speedMaterial: JianyingSpeedMaterial;
	videoMaterial?: JianyingVideoMaterial;
}

function getDraftMediaType({
	media,
}: {
	media: QCutDraftExportMedia;
}): JianyingDraftMediaType {
	return media.type;
}

function getMaterialDurationMicroseconds({
	media,
}: {
	media: QCutDraftExportMedia;
}): number {
	if (media.type === "image") {
		return JIANYING_IMAGE_SOURCE_DURATION_MICROSECONDS;
	}
	return secondsToMicroseconds({ seconds: media.duration });
}

function createVideoMaterial({
	destinationPath,
	materialId,
	media,
}: {
	destinationPath: string;
	materialId: string;
	media: QCutDraftExportMedia;
}): JianyingVideoMaterial | undefined {
	if (media.type === "audio") return undefined;
	return {
		audio_fade: null,
		category_id: "",
		category_name: "local",
		check_flag: 63487,
		crop: {
			upper_left_x: 0,
			upper_left_y: 0,
			upper_right_x: 1,
			upper_right_y: 0,
			lower_left_x: 0,
			lower_left_y: 1,
			lower_right_x: 1,
			lower_right_y: 1,
		},
		crop_ratio: "free",
		crop_scale: 1,
		duration: getMaterialDurationMicroseconds({ media }),
		height: media.height,
		id: materialId,
		local_material_id: "",
		material_id: materialId,
		material_name: media.name,
		media_path: "",
		path: destinationPath,
		type: media.type === "image" ? "photo" : "video",
		width: media.width,
	};
}

function createAudioMaterial({
	destinationPath,
	materialId,
	media,
}: {
	destinationPath: string;
	materialId: string;
	media: QCutDraftExportMedia;
}): JianyingAudioMaterial | undefined {
	if (media.type !== "audio") return undefined;
	return {
		app_id: 0,
		category_id: "",
		category_name: "local",
		check_flag: 3,
		copyright_limit_type: "none",
		duration: secondsToMicroseconds({ seconds: media.duration }),
		effect_id: "",
		formula_id: "",
		id: materialId,
		local_material_id: materialId,
		music_id: materialId,
		name: media.name,
		path: destinationPath,
		source_platform: 0,
		type: "extract_music",
		wave_points: [],
	};
}

function createClipSettings({
	canvasHeight,
	canvasWidth,
	element,
}: {
	canvasHeight: number;
	canvasWidth: number;
	element: MediaElement;
}): NonNullable<JianyingDraftSegment["clip"]> {
	return {
		alpha: element.opacity ?? 1,
		flip: {
			horizontal: element.flipHorizontal ?? false,
			vertical: element.flipVertical ?? false,
		},
		rotation: element.rotation ?? 0,
		scale: {
			x: element.scaleX ?? 1,
			y: element.scaleY ?? 1,
		},
		transform: {
			x: (2 * (element.x ?? 0)) / canvasWidth,
			y: (-2 * (element.y ?? 0)) / canvasHeight,
		},
	};
}

export function mapMediaElementToJianying({
	canvasHeight,
	canvasWidth,
	draftOutputDirectory,
	element,
	media,
	targetPlatform,
	timelineDuration,
}: MapMediaElementOptions): MappedMediaElement {
	const materialId = createDeterministicJianyingId({
		namespace: "material",
		sourceId: media.id,
	});
	const segmentId = createDeterministicJianyingId({
		namespace: "segment",
		sourceId: element.id,
	});
	const speedId = createDeterministicJianyingId({
		namespace: "speed",
		sourceId: element.id,
	});
	const speed = element.playbackRate ?? 1;
	const targetDuration = secondsToMicroseconds({ seconds: timelineDuration });
	const sourceDuration = secondsToMicroseconds({
		seconds: timelineDuration * speed,
	});
	const { draftMediaPath, relativePath } = buildJianyingAssetPaths({
		draftOutputDirectory,
		materialId,
		mediaType: getDraftMediaType({ media }),
		sourcePath: media.sourcePath,
		targetPlatform,
	});
	const volume = Math.max(0, element.volume ?? 1);
	const isAudio = media.type === "audio";
	const scaleX = element.scaleX ?? 1;
	const scaleY = element.scaleY ?? 1;
	const usesUniformScale =
		element.maintainAspectRatio !== false &&
		Math.abs(scaleX - scaleY) < Number.EPSILON;

	return {
		asset: {
			draftMediaPath,
			materialId,
			mediaId: media.id,
			relativePath,
			sourcePath: media.sourcePath,
			type: getDraftMediaType({ media }),
		},
		audioMaterial: createAudioMaterial({
			destinationPath: draftMediaPath,
			materialId,
			media,
		}),
		segment: {
			clip: isAudio
				? null
				: createClipSettings({ canvasHeight, canvasWidth, element }),
			common_keyframes: [],
			enable_adjust: true,
			enable_color_correct_adjust: false,
			enable_color_curves: true,
			enable_color_match_adjust: false,
			enable_color_wheels: true,
			enable_lut: true,
			enable_smart_color_adjust: false,
			extra_material_refs: [speedId],
			hdr_settings: isAudio ? null : { intensity: 1, mode: 1, nits: 1000 },
			id: segmentId,
			is_tone_modify: !(element.preservePitch ?? true),
			keyframe_refs: [],
			last_nonzero_volume: volume > 0 ? volume : 1,
			material_id: materialId,
			render_index: 0,
			reverse: false,
			source_timerange: {
				duration: sourceDuration,
				start: secondsToMicroseconds({ seconds: element.trimStart }),
			},
			speed,
			target_timerange: {
				duration: targetDuration,
				start: secondsToMicroseconds({ seconds: element.startTime }),
			},
			track_attribute: 0,
			track_render_index: 0,
			uniform_scale: isAudio
				? undefined
				: {
						on: usesUniformScale,
						value: 1,
					},
			visible: true,
			volume,
		},
		speedMaterial: {
			curve_speed: null,
			id: speedId,
			mode: 0,
			speed,
			type: "speed",
		},
		videoMaterial: createVideoMaterial({
			destinationPath: draftMediaPath,
			materialId,
			media,
		}),
	};
}

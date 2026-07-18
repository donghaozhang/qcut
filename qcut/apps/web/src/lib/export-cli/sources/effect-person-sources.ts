import type {
	EffectPersonTrackingRenderStage,
	EffectRenderProgram,
	MediaElement,
	TimelineTrack,
} from "@qcut/editor-core";
import { platform } from "@qcut/platform-core";
import type { MediaItem } from "@/stores/media/media-store";
import {
	exportPersonCutoutImage,
	exportPersonCutoutVideo,
	type PersonCutoutAbsentMode,
} from "@/lib/segmentation/person-cutout-export";
import type { EffectPersonSourceInput } from "../types";

const MASK_SETTINGS = {
	threshold: 0.5,
	temporalSmoothing: 0.55,
	edgeShift: 1,
	feather: 1.5,
};

interface PersonStageReference {
	elementId: string;
	stageIndex: number;
	stage: EffectPersonTrackingRenderStage;
}

interface EffectPersonSourceAPI {
	readFile: (filePath: string) => Promise<Uint8Array | null>;
	saveTemp: (
		data: Uint8Array,
		filename: string,
		sessionId?: string
	) => Promise<string>;
}

type GeneratePersonResource = ({
	file,
	type,
	absentPersonMode,
}: {
	file: File;
	type: "image" | "video";
	absentPersonMode: PersonCutoutAbsentMode;
}) => Promise<Blob>;

function collectPersonStageReferences({
	programsByElementId,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
}): PersonStageReference[] {
	const references: PersonStageReference[] = [];
	for (const [elementId, program] of programsByElementId) {
		for (const [stageIndex, stage] of program.stages.entries()) {
			if (stage.kind !== "person-tracking") continue;
			references.push({ elementId, stageIndex, stage });
		}
	}
	return references;
}

function mediaElementById({
	tracks,
	elementId,
}: {
	tracks: readonly TimelineTrack[];
	elementId: string;
}): MediaElement | undefined {
	for (const track of tracks) {
		const element = track.elements.find(
			(candidate) => candidate.id === elementId
		);
		if (element?.type === "media") return element;
	}
	return undefined;
}

function absentModeForStage({
	stage,
}: {
	stage: EffectPersonTrackingRenderStage;
}): PersonCutoutAbsentMode {
	if (stage.fallback === "center") return "center";
	if (stage.fallback === "full-frame") return "full-frame";
	return stage.treatment === "outline" ? "transparent" : "full-frame";
}

async function resolveMediaFile({
	mediaItem,
	api,
	fetchSource,
}: {
	mediaItem: MediaItem;
	api: EffectPersonSourceAPI;
	fetchSource: typeof fetch;
}): Promise<File> {
	if (mediaItem.file.size > 0) return mediaItem.file;
	if (mediaItem.localPath) {
		const bytes = await api.readFile(mediaItem.localPath);
		if (bytes) {
			const copiedBytes = Uint8Array.from(bytes);
			return new File([copiedBytes.buffer], mediaItem.name, {
				type: mediaItem.file.type || "application/octet-stream",
			});
		}
	}
	const sourceUrl = mediaItem.originalUrl || mediaItem.url;
	if (sourceUrl) {
		const response = await fetchSource(sourceUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to read person effect source ${mediaItem.id} (${response.status})`
			);
		}
		const blob = await response.blob();
		return new File([blob], mediaItem.name, { type: blob.type });
	}
	throw new Error(`Person effect source is unavailable: ${mediaItem.id}`);
}

async function defaultGeneratePersonResource({
	file,
	type,
	absentPersonMode,
}: {
	file: File;
	type: "image" | "video";
	absentPersonMode: PersonCutoutAbsentMode;
}): Promise<Blob> {
	if (type === "image") {
		return exportPersonCutoutImage({
			file,
			settings: MASK_SETTINGS,
			absentPersonMode,
		});
	}
	const result = await exportPersonCutoutVideo({
		file,
		settings: MASK_SETTINGS,
		includeAudio: false,
		absentPersonMode,
	});
	return result.blob;
}

function safeFilename({
	mediaItem,
	absentPersonMode,
}: {
	mediaItem: MediaItem;
	absentPersonMode: PersonCutoutAbsentMode;
}): string {
	const id = mediaItem.id.replace(/[^a-zA-Z0-9._-]/g, "_");
	const extension = mediaItem.type === "image" ? "png" : "webm";
	return `effect-person-${id}-${absentPersonMode}.${extension}`;
}

/** Materializes person alpha media once per source/fallback mode for FFmpeg. */
export async function extractEffectPersonSources({
	programsByElementId,
	tracks,
	mediaItems,
	sessionId,
	api = {
		readFile: async (filePath) => {
			const bytes = await platform().files.readFile(filePath);
			return bytes ? new Uint8Array(bytes) : null;
		},
		saveTemp: (data, filename, targetSessionId) =>
			platform().video.saveTemp(data, filename, targetSessionId),
	},
	fetchSource = fetch,
	generatePersonResource = defaultGeneratePersonResource,
}: {
	programsByElementId: ReadonlyMap<string, EffectRenderProgram>;
	tracks: readonly TimelineTrack[];
	mediaItems: readonly MediaItem[];
	sessionId: string;
	api?: EffectPersonSourceAPI;
	fetchSource?: typeof fetch;
	generatePersonResource?: GeneratePersonResource;
}): Promise<ReadonlyMap<string, EffectPersonSourceInput[]>> {
	const references = collectPersonStageReferences({ programsByElementId });
	if (references.length === 0) return new Map();
	const materializedBySource = new Map<
		string,
		Promise<EffectPersonSourceInput>
	>();

	const resolveReference = async ({
		reference,
	}: {
		reference: PersonStageReference;
	}): Promise<{ elementId: string; source: EffectPersonSourceInput }> => {
		const element = mediaElementById({
			tracks,
			elementId: reference.elementId,
		});
		if (!element) {
			throw new Error(
				`Person effect target is not a media element: ${reference.elementId}`
			);
		}
		const mediaItem = mediaItems.find((item) => item.id === element.mediaId);
		if (
			!mediaItem ||
			(mediaItem.type !== "video" && mediaItem.type !== "image")
		) {
			throw new Error(`Person effect media is unavailable: ${element.mediaId}`);
		}
		const mediaType: "image" | "video" = mediaItem.type;
		const absentPersonMode = absentModeForStage({ stage: reference.stage });
		const cacheKey = `${mediaItem.id}:${absentPersonMode}`;
		let materialized = materializedBySource.get(cacheKey);
		if (!materialized) {
			materialized = (async () => {
				const file = await resolveMediaFile({ mediaItem, api, fetchSource });
				const blob = await generatePersonResource({
					file,
					type: mediaType,
					absentPersonMode,
				});
				const path = await api.saveTemp(
					new Uint8Array(await blob.arrayBuffer()),
					safeFilename({ mediaItem, absentPersonMode }),
					sessionId
				);
				return {
					stageIndex: reference.stageIndex,
					path,
					animated: mediaType === "video",
				};
			})();
			materializedBySource.set(cacheKey, materialized);
		}
		const source = await materialized;
		return {
			elementId: reference.elementId,
			source: { ...source, stageIndex: reference.stageIndex },
		};
	};

	const resolved = await Promise.all(
		references.map((reference) => resolveReference({ reference }))
	);
	const sourcesByElementId = new Map<string, EffectPersonSourceInput[]>();
	for (const item of resolved) {
		const sources = sourcesByElementId.get(item.elementId) ?? [];
		sources.push(item.source);
		sourcesByElementId.set(item.elementId, sources);
	}
	return sourcesByElementId;
}

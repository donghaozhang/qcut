import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";

const MAX_CONCURRENT_ANALYSIS_REQUESTS = 2;

export const AUDIO_RECOMMENDATION_VISION_METADATA_KEY =
	"audioRecommendationVision";

export interface AudioProjectVisionEvent {
	start: number;
	end: number;
	label: string;
	tags: string[];
}

export interface AudioProjectVisionAnalysis {
	version: 1;
	sourceSignature: string;
	analyzedAt: string;
	events: AudioProjectVisionEvent[];
}

export interface VideoAnalysisResult {
	success: boolean;
	markdown?: string;
	json?: unknown;
	error?: string;
}

export type ProjectVideoAnalyzer = (
	projectId: string,
	options: {
		source: { type: "media"; mediaId: string };
		analysisType: "timeline";
		model: "gemini-2.5-flash";
		format: "json";
	}
) => Promise<VideoAnalysisResult>;

type UpdateMediaItem = (
	projectId: string,
	id: string,
	updates: Partial<Omit<MediaItem, "id">>
) => Promise<boolean>;

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

export function createProjectVideoAnalyzer({
	run,
}: {
	run:
		| ((
				projectId: string,
				options?: Record<string, unknown>
		  ) => Promise<unknown>)
		| undefined;
}): ProjectVideoAnalyzer | undefined {
	if (!run) return undefined;
	return async (projectId, options) => {
		const raw = await run(
			projectId,
			options as unknown as Record<string, unknown>
		);
		const result = asRecord({ value: raw });
		if (!result || typeof result.success !== "boolean") {
			return {
				success: false,
				error: "Video analysis returned an invalid result",
			};
		}
		return {
			success: result.success,
			markdown:
				typeof result.markdown === "string" ? result.markdown : undefined,
			json: result.json,
			error: typeof result.error === "string" ? result.error : undefined,
		};
	};
}

function finiteNumber({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseEvent({
	value,
}: {
	value: unknown;
}): AudioProjectVisionEvent | null {
	const record = asRecord({ value });
	if (!record) return null;
	const rawLabel =
		typeof record.label === "string"
			? record.label
			: typeof record.description === "string"
				? record.description
				: "";
	const label = rawLabel.trim();
	if (!label) return null;
	const start = Math.max(0, finiteNumber({ value: record.start, fallback: 0 }));
	const end = Math.max(
		start,
		finiteNumber({ value: record.end, fallback: start })
	);
	const tags = Array.isArray(record.tags)
		? record.tags
				.filter((tag): tag is string => typeof tag === "string")
				.map((tag) => tag.trim())
				.filter(Boolean)
				.slice(0, 24)
		: [];
	return { start, end, label, tags };
}

function parseJsonText({ value }: { value: string }): unknown {
	const cleaned = value
		.replace(/^```(?:json)?\s*/iu, "")
		.replace(/\s*```$/u, "")
		.trim();
	try {
		return JSON.parse(cleaned);
	} catch {
		return null;
	}
}

function eventValues({ value }: { value: unknown }): unknown[] {
	const parsed = typeof value === "string" ? parseJsonText({ value }) : value;
	if (Array.isArray(parsed)) return parsed;
	const record = asRecord({ value: parsed });
	if (!record) return [];
	for (const key of ["events", "timeline", "scenes", "data"] as const) {
		if (Array.isArray(record[key])) return record[key];
	}
	return [];
}

export function parseAudioProjectVisionEvents({
	value,
}: {
	value: unknown;
}): AudioProjectVisionEvent[] {
	return eventValues({ value })
		.map((event) => parseEvent({ value: event }))
		.filter((event): event is AudioProjectVisionEvent => event !== null)
		.slice(0, 200);
}

export function audioVisionSourceSignature({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): string {
	return [
		mediaItem.file.size,
		mediaItem.file.lastModified,
		mediaItem.duration ?? 0,
	].join(":");
}

export function getAudioProjectVisionAnalysis({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): AudioProjectVisionAnalysis | null {
	const metadata = asRecord({ value: mediaItem.metadata });
	const stored = asRecord({
		value: metadata?.[AUDIO_RECOMMENDATION_VISION_METADATA_KEY],
	});
	if (
		stored?.version !== 1 ||
		typeof stored.sourceSignature !== "string" ||
		typeof stored.analyzedAt !== "string" ||
		stored.sourceSignature !== audioVisionSourceSignature({ mediaItem })
	) {
		return null;
	}
	const events = parseAudioProjectVisionEvents({ value: stored.events });
	if (events.length === 0) return null;
	return {
		version: 1,
		sourceSignature: stored.sourceSignature,
		analyzedAt: stored.analyzedAt,
		events,
	};
}

export function audioProjectVisionContext({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): string[] {
	const analysis = getAudioProjectVisionAnalysis({ mediaItem });
	if (!analysis) return [];
	return analysis.events.flatMap((event) => [event.label, ...event.tags]);
}

export function getReferencedProjectVideoMedia({
	mediaItems,
	tracks,
}: {
	mediaItems: readonly MediaItem[];
	tracks: readonly TimelineTrack[];
}): MediaItem[] {
	const referencedMediaIds = new Set(
		tracks
			.filter((track) => track.type === "media")
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "media")
			.map((element) => element.mediaId)
	);
	return mediaItems.filter(
		(mediaItem) =>
			mediaItem.type === "video" && referencedMediaIds.has(mediaItem.id)
	);
}

function eventsFromResult({
	result,
}: {
	result: VideoAnalysisResult;
}): AudioProjectVisionEvent[] {
	const fromJson = parseAudioProjectVisionEvents({ value: result.json });
	if (fromJson.length > 0) return fromJson;
	return parseAudioProjectVisionEvents({ value: result.markdown });
}

export async function analyzeProjectAudioVisuals({
	projectId,
	mediaItems,
	tracks,
	analyzeVideo,
	updateMediaItem,
	force = false,
	now = () => new Date(),
}: {
	projectId: string;
	mediaItems: readonly MediaItem[];
	tracks: readonly TimelineTrack[];
	analyzeVideo: ProjectVideoAnalyzer;
	updateMediaItem: UpdateMediaItem;
	force?: boolean;
	now?: () => Date;
}): Promise<{
	total: number;
	analyzed: number;
	cached: number;
	eventCount: number;
}> {
	const videoMedia = getReferencedProjectVideoMedia({ mediaItems, tracks });
	const analyzeReferencedVideo = async ({
		mediaItem,
	}: {
		mediaItem: MediaItem;
	}): Promise<{ analysis: AudioProjectVisionAnalysis; cached: boolean }> => {
		const cached = getAudioProjectVisionAnalysis({ mediaItem });
		if (cached && !force) return { analysis: cached, cached: true };
		const result = await analyzeVideo(projectId, {
			source: { type: "media", mediaId: mediaItem.id },
			analysisType: "timeline",
			model: "gemini-2.5-flash",
			format: "json",
		});
		if (!result.success) {
			throw new Error(result.error || "Video analysis failed");
		}
		const events = eventsFromResult({ result });
		if (events.length === 0) {
			throw new Error("Video analysis returned no timeline events");
		}
		const analysis: AudioProjectVisionAnalysis = {
			version: 1,
			sourceSignature: audioVisionSourceSignature({ mediaItem }),
			analyzedAt: now().toISOString(),
			events,
		};
		const saved = await updateMediaItem(projectId, mediaItem.id, {
			metadata: {
				...mediaItem.metadata,
				[AUDIO_RECOMMENDATION_VISION_METADATA_KEY]: analysis,
			},
		});
		if (!saved) throw new Error("Video analysis could not be saved");
		return { analysis, cached: false };
	};

	// Analyze with bounded provider concurrency, letting every item settle so
	// failures are reported explicitly instead of leaving invisible partial
	// state behind a rejected batch.
	const results: ({
		analysis: AudioProjectVisionAnalysis;
		cached: boolean;
	} | null)[] = videoMedia.map(() => null);
	const failures: string[] = [];
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(MAX_CONCURRENT_ANALYSIS_REQUESTS, videoMedia.length) },
		async () => {
			while (nextIndex < videoMedia.length) {
				const index = nextIndex;
				nextIndex += 1;
				const mediaItem = videoMedia[index];
				try {
					results[index] = await analyzeReferencedVideo({ mediaItem });
				} catch (error) {
					failures.push(
						`${mediaItem.name}: ${
							error instanceof Error ? error.message : String(error)
						}`
					);
				}
			}
		}
	);
	await Promise.all(workers);
	const completed = results.filter(
		(
			result
		): result is { analysis: AudioProjectVisionAnalysis; cached: boolean } =>
			result !== null
	);
	if (failures.length > 0) {
		throw new Error(
			`Video analysis failed for ${failures.length} of ${videoMedia.length} video(s): ${failures.join("; ")}`
		);
	}
	return {
		total: completed.length,
		analyzed: completed.filter((result) => !result.cached).length,
		cached: completed.filter((result) => result.cached).length,
		eventCount: completed.reduce(
			(total, result) => total + result.analysis.events.length,
			0
		),
	};
}

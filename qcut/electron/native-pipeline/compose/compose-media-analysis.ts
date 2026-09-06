import type { EditorApiClient } from "../editor/editor-api-client.js";
import type {
	FrameAnalysisResult,
	SceneDetectionResult,
} from "../../types/claude-api.js";
import type {
	ComposeSnapshot,
	ComposeSnapshotMedia,
} from "./compose-protocol.js";

export interface ComposeAnalysisClip {
	media: ComposeSnapshotMedia;
	visibleDuration: number;
	playbackRate: number;
	muted?: boolean;
	unsupportedTiming?: boolean;
}

export interface ComposeMediaAnalysis {
	beats: ComposeSnapshot["beats"];
	shots: ComposeSnapshot["shots"];
	warnings: string[];
}

interface SourceAnalysis {
	beats: Array<{ timestamp: number; strength?: number }>;
	scenes: SceneDetectionResult["scenes"];
	frames: FrameAnalysisResult["frames"];
}

function validAnalysis({
	value,
	kind,
}: {
	value: unknown;
	kind: string;
}): boolean {
	if (!value || typeof value !== "object") return false;
	const items: unknown = (value as Record<string, unknown>)[kind];
	return (
		Array.isArray(items) &&
		items.every((item: unknown) => {
			if (!item || typeof item !== "object") return false;
			const record = item as Record<string, unknown>;
			return (
				typeof record.timestamp === "number" &&
				(kind !== "frames" ||
					(typeof record.description === "string" &&
						Array.isArray(record.objects) &&
						record.objects.every(
							(object: unknown) => typeof object === "string"
						)))
			);
		})
	);
}

export async function analyzeComposeMedia({
	client,
	projectId,
	clips,
	visual = false,
	signal,
}: {
	client: Pick<EditorApiClient, "post">;
	projectId: string;
	clips: ComposeAnalysisClip[];
	visual?: boolean;
	signal?: AbortSignal;
}): Promise<ComposeMediaAnalysis> {
	const warnings: string[] = [];
	for (const clip of clips.filter(({ unsupportedTiming }) => unsupportedTiming))
		warnings.push(
			`Compose analysis skipped reverse or variable-speed clip ${clip.media.elementId}.`
		);
	clips = clips.filter(({ unsupportedTiming }) => !unsupportedTiming);
	const sources = new Map<string, SourceAnalysis>();
	const ids = [...new Set(clips.map(({ media }) => media.id))];
	const endpoint = `/api/claude/analyze/${encodeURIComponent(projectId)}`;
	const request = async <T>({
		kind,
		mediaId,
		body,
		fallback,
	}: {
		kind: string;
		mediaId: string;
		body?: Record<string, unknown>;
		fallback: T;
	}): Promise<T> => {
		signal?.throwIfAborted();
		try {
			const result = await client.post<T>(
				`${endpoint}/${kind}`,
				{ mediaId, ...body },
				{ signal, timeout: 240_000 }
			);
			if (!validAnalysis({ value: result, kind }))
				throw new Error("Invalid analysis response.");
			return result;
		} catch {
			signal?.throwIfAborted();
			// Server errors can contain private source paths or provider response bodies.
			warnings.push(
				`Compose ${kind} analysis unavailable for media ${mediaId}.`
			);
			return fallback;
		}
	};
	// The current frame extractor shares temporary filenames; serialize source jobs.
	await ids.reduce(async (previous, id) => {
		await previous;
		const instances = clips.filter(({ media }) => media.id === id);
		const media = instances[0].media;
		const beats =
			media.kind !== "image" &&
			instances.some((clip) => !clip.muted && clip.media.hasAudio !== false)
				? await request<{ beats: SourceAnalysis["beats"] }>({
						kind: "beats",
						mediaId: id,
						fallback: { beats: [] },
					})
				: { beats: [] };
		const scenes =
			media.kind === "video"
				? await request<SceneDetectionResult>({
						kind: "scenes",
						mediaId: id,
						body: { aiAnalysis: false },
						fallback: { scenes: [], totalScenes: 0, averageShotDuration: 0 },
					})
				: { scenes: [] };
		const timestamps = [
			...new Set(
				instances.flatMap((clip) => {
					const start = clip.media.trimStart;
					const end = start + clip.visibleDuration * clip.playbackRate;
					return [
						start,
						...scenes.scenes
							.map((scene) => scene.timestamp)
							.filter((time) => time > start && time < end),
					];
				})
			),
		]
			.filter(Number.isFinite)
			.sort((left, right) => left - right)
			.slice(0, 20);
		const frames =
			visual && media.kind !== "audio"
				? await request<FrameAnalysisResult>({
						kind: "frames",
						mediaId: id,
						body: { timestamps },
						fallback: { frames: [], totalFramesAnalyzed: 0 },
					})
				: { frames: [] };
		sources.set(id, {
			beats: beats.beats,
			scenes: scenes.scenes,
			frames: frames.frames,
		});
	}, Promise.resolve());
	const result: ComposeMediaAnalysis = { beats: [], shots: [], warnings };
	for (const clip of clips) {
		const { media, visibleDuration, playbackRate } = clip;
		const source = sources.get(media.id);
		if (!source || visibleDuration <= 0 || playbackRate <= 0) continue;
		const sourceEnd = media.trimStart + visibleDuration * playbackRate;
		const toTimeline = ({ time }: { time: number }) =>
			media.startTime + (time - media.trimStart) / playbackRate;
		if (!clip.muted) {
			for (const [index, beat] of source.beats.entries()) {
				if (
					!Number.isFinite(beat.timestamp) ||
					beat.timestamp < media.trimStart ||
					beat.timestamp >= sourceEnd
				)
					continue;
				result.beats.push({
					id: `${media.elementId}:beat:${index}`,
					timestamp: toTimeline({ time: beat.timestamp }),
					...(typeof beat.strength === "number" &&
					Number.isFinite(beat.strength)
						? { confidence: Math.max(0, Math.min(1, beat.strength)) }
						: {}),
				});
			}
		}
		if (media.kind === "audio") continue;
		const boundaries = [
			...new Set([
				media.trimStart,
				...source.scenes
					.map(({ timestamp }) => timestamp)
					.filter(
						(time) =>
							Number.isFinite(time) &&
							time > media.trimStart &&
							time < sourceEnd
					),
				sourceEnd,
			]),
		].sort((left, right) => left - right);
		for (let index = 0; index < boundaries.length - 1; index += 1) {
			const start = boundaries[index];
			const end = boundaries[index + 1];
			const frame = source.frames.find(
				({ timestamp }) => timestamp >= start && timestamp < end
			);
			const scene = source.scenes.find(({ timestamp }) => timestamp === start);
			const label = frame
				? [frame.description, ...frame.objects, frame.mood, frame.composition]
						.filter(Boolean)
						.join("; ")
						.slice(0, 1000)
				: scene?.description;
			result.shots.push({
				id: `${media.elementId}:shot:${index}`,
				startTime: toTimeline({ time: start }),
				duration: (end - start) / playbackRate,
				...(label ? { label } : {}),
			});
		}
	}
	result.beats.sort((left, right) => left.timestamp - right.timestamp);
	result.shots.sort((left, right) => left.startTime - right.startTime);
	return result;
}

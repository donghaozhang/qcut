import { randomUUID } from "node:crypto";
import { discoverComposeGeneratedMedia } from "./compose-generated-media.js";
import {
	analyzeComposeMedia,
	type ComposeAnalysisClip,
} from "./compose-media-analysis.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import {
	COMPOSE_PROTOCOL_VERSION,
	computeComposeSourceFingerprint,
	type ComposeSnapshot,
	type ComposeSnapshotCaption,
	type ComposeSnapshotMedia,
} from "./compose-protocol.js";
import {
	composeResourceQuery,
	discoverComposeResources,
} from "./compose-resource-broker.js";

type JsonRecord = Record<string, unknown>;

interface TimelineElementRecord extends JsonRecord {
	id?: string;
	type?: string;
	mediaId?: string;
	sourceId?: string;
	content?: string;
	startTime?: number;
	duration?: number;
	trimStart?: number;
	trimEnd?: number;
}

interface TimelineTrackRecord extends JsonRecord {
	id?: string;
	type?: string;
	elements?: TimelineElementRecord[];
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveNumber({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number {
	const candidate = finiteNumber({ value, fallback });
	return candidate > 0 ? candidate : fallback;
}

function visibleDuration({
	element,
}: {
	element: TimelineElementRecord;
}): number {
	const duration = finiteNumber({ value: element.duration, fallback: 0 });
	const trimStart = finiteNumber({ value: element.trimStart, fallback: 0 });
	const trimEnd = finiteNumber({ value: element.trimEnd, fallback: 0 });
	return Math.max(0, duration - trimStart - trimEnd);
}

function mediaKindFor({
	element,
	trackType,
}: {
	element: TimelineElementRecord;
	trackType: string;
}): ComposeSnapshotMedia["kind"] {
	const elementType = typeof element.type === "string" ? element.type : "";
	if (elementType === "audio" || trackType === "audio") return "audio";
	if (elementType === "image") return "image";
	return "video";
}

async function resolveActiveProjectId({
	client,
}: {
	client: EditorApiClient;
}): Promise<string | undefined> {
	const navigator = await client.get<{ activeProjectId?: string | null }>(
		"/api/claude/navigator/projects"
	);
	return navigator.activeProjectId ?? undefined;
}

/**
 * Reads the live editor over the Claude HTTP bridge and produces a
 * ComposeSnapshot. Resource candidates contain public identities and matching
 * metadata only; local paths and private package hashes stay on the machine.
 */
export async function captureComposeSnapshot({
	client,
	projectId,
	snapshotId = randomUUID(),
	createdAt = new Date().toISOString(),
	discoverResources = discoverComposeResources,
	analyzeMedia = analyzeComposeMedia,
	visualAnalysis = false,
	includeAnalysis = true,
	signal,
}: {
	client: EditorApiClient;
	projectId?: string;
	snapshotId?: string;
	createdAt?: string;
	discoverResources?: typeof discoverComposeResources;
	analyzeMedia?: typeof analyzeComposeMedia;
	visualAnalysis?: boolean;
	includeAnalysis?: boolean;
	signal?: AbortSignal;
}): Promise<ComposeSnapshot> {
	const resolvedProjectId =
		projectId ?? (await resolveActiveProjectId({ client }));
	if (!resolvedProjectId) {
		throw new Error(
			"No active QCut project. Open a project or pass --project-id."
		);
	}
	const [timeline, settings] = await Promise.all([
		client.get<JsonRecord>(
			`/api/claude/timeline/${encodeURIComponent(resolvedProjectId)}`
		),
		client.get<JsonRecord>(
			`/api/claude/project/${encodeURIComponent(resolvedProjectId)}/settings`
		),
	]);
	const tracks = Array.isArray(timeline.tracks)
		? (timeline.tracks as TimelineTrackRecord[])
		: [];

	const media: ComposeSnapshotMedia[] = [];
	const analysisClips: ComposeAnalysisClip[] = [];
	const captions: ComposeSnapshotCaption[] = [];
	let timelineEnd = 0;
	for (const [trackIndex, track] of tracks.entries()) {
		if (!isRecord(track)) continue;
		const trackId =
			typeof track.id === "string" && track.id.length > 0
				? track.id
				: `track-${trackIndex}`;
		const trackType = typeof track.type === "string" ? track.type : "media";
		const elements = Array.isArray(track.elements) ? track.elements : [];
		for (const [elementIndex, element] of elements.entries()) {
			if (!isRecord(element)) continue;
			const elementId =
				typeof element.id === "string" && element.id.length > 0
					? element.id
					: `element-${trackIndex}-${elementIndex}`;
			const startTime = finiteNumber({
				value: element.startTime,
				fallback: 0,
			});
			const rate = positiveNumber({ value: element.playbackRate, fallback: 1 });
			const shown = visibleDuration({ element }) / rate;
			timelineEnd = Math.max(timelineEnd, startTime + shown);
			if (
				trackType === "text" ||
				trackType === "captions" ||
				element.type === "text" ||
				element.type === "captions"
			) {
				const text =
					typeof element.content === "string"
						? element.content
						: typeof element.text === "string"
							? element.text
							: "";
				captions.push({
					id: elementId,
					text,
					startTime,
					duration: shown,
					...(typeof element.language === "string"
						? { language: element.language }
						: {}),
				});
				continue;
			}
			const mediaId =
				typeof element.mediaId === "string"
					? element.mediaId
					: element.sourceId;
			if (typeof mediaId !== "string") continue;
			media.push({
				id: mediaId,
				kind: mediaKindFor({ element, trackType }),
				trackId,
				elementId,
				startTime,
				duration: finiteNumber({ value: element.duration, fallback: shown }),
				trimStart: finiteNumber({ value: element.trimStart, fallback: 0 }),
				...(element.trimEnd
					? { trimEnd: finiteNumber({ value: element.trimEnd, fallback: 0 }) }
					: {}),
				...(rate !== 1 ? { playbackRate: rate } : {}),
			});
			analysisClips.push({
				media: media[media.length - 1],
				visibleDuration: shown,
				playbackRate: rate,
				muted:
					track.muted === true ||
					element.muted === true ||
					element.volume === 0,
				unsupportedTiming:
					element.reverse === true ||
					(Array.isArray(element.speedKeyframes) &&
						element.speedKeyframes.length > 0),
			});
		}
	}

	const canvasSize = isRecord(settings.canvasSize) ? settings.canvasSize : {};
	const project = {
		id: resolvedProjectId,
		fps: positiveNumber({ value: settings.fps, fallback: 30 }),
		canvasSize: {
			width: positiveNumber({ value: canvasSize.width, fallback: 1920 }),
			height: positiveNumber({ value: canvasSize.height, fallback: 1080 }),
		},
		duration: timelineEnd > 0 ? timelineEnd : 1,
	};
	const analysis =
		includeAnalysis || visualAnalysis
			? await analyzeMedia({
					client,
					projectId: resolvedProjectId,
					clips: analysisClips,
					visual: visualAnalysis,
					signal,
				})
			: { beats: [], shots: [], warnings: [] as string[] };
	const generatedMedia = await discoverComposeGeneratedMedia({
		client,
		projectId: resolvedProjectId,
	}).catch(() => {
		analysis.warnings.push("Compose generated media discovery unavailable.");
		return [];
	});
	const resourceBroker = await discoverResources({
		query: composeResourceQuery({
			snapshot: { captions, shots: analysis.shots },
		}),
		signal,
		generatedMedia,
	});
	const warnings = [...analysis.warnings, ...resourceBroker.warnings];

	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: snapshotId,
		createdAt,
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media,
			captions,
		}),
		project,
		media,
		captions,
		beats: analysis.beats,
		shots: analysis.shots,
		availableResources: resourceBroker.resources,
		...(warnings.length > 0 ? { resourceWarnings: warnings } : {}),
		capabilities: {
			headlessRender: true,
			editorApply: true,
			editorExport: true,
			...resourceBroker.capabilities,
		},
	};
}

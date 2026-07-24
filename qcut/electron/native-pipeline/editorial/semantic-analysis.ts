import type { PipelineExecutor, PipelineStep } from "../execution/executor.js";
import { ModelRegistry } from "../infra/registry.js";
import { extractJpegDataUrls } from "./media-process.js";
import type {
	FramePosition,
	MediaProbe,
	MotionDirection,
	SemanticScene,
	SourceSemantics,
} from "./types.js";

const MOTION_DIRECTIONS = new Set<MotionDirection>([
	"static",
	"left",
	"right",
	"up",
	"down",
	"up-left",
	"up-right",
	"down-left",
	"down-right",
	"mixed",
]);
const FRAME_POSITIONS = new Set<FramePosition>([
	"top-left",
	"top",
	"top-right",
	"left",
	"center",
	"right",
	"bottom-left",
	"bottom",
	"bottom-right",
]);

function toRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function stringArray({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseModelJson({ value }: { value: unknown }): unknown {
	if (typeof value !== "string") return value;
	const cleaned = value
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	return JSON.parse(cleaned);
}

function normalizeSemanticScene({
	value,
	duration,
}: {
	value: unknown;
	duration: number;
}): SemanticScene | undefined {
	const record = toRecord({ value });
	if (!record) return;
	const start =
		typeof record.start === "number" ? record.start : Number(record.start);
	const end = typeof record.end === "number" ? record.end : Number(record.end);
	if (
		!Number.isFinite(start) ||
		!Number.isFinite(end) ||
		start < 0 ||
		end <= start
	) {
		return;
	}
	const description =
		typeof record.description === "string" ? record.description.trim() : "";
	const motionDirection =
		typeof record.motionDirection === "string" &&
		MOTION_DIRECTIONS.has(record.motionDirection as MotionDirection)
			? (record.motionDirection as MotionDirection)
			: undefined;
	const subjectPosition =
		typeof record.subjectPosition === "string" &&
		FRAME_POSITIONS.has(record.subjectPosition as FramePosition)
			? (record.subjectPosition as FramePosition)
			: undefined;
	return {
		start: Math.min(duration, Math.max(0, start)),
		end: Math.min(duration, Math.max(0, end)),
		description,
		tags: stringArray({ value: record.tags }),
		motionDirection,
		subjectPosition,
	};
}

function normalizeSemantics({
	value,
	duration,
	model,
}: {
	value: unknown;
	duration: number;
	model: string;
}): SourceSemantics {
	const record = toRecord({ value });
	if (!record) {
		throw new Error("Semantic analysis did not return a JSON object");
	}
	const scenes = Array.isArray(record.scenes)
		? record.scenes.flatMap((scene: unknown) => {
				const normalized = normalizeSemanticScene({ value: scene, duration });
				return normalized ? [normalized] : [];
			})
		: [];
	return {
		summary: typeof record.summary === "string" ? record.summary.trim() : "",
		tags: stringArray({ value: record.tags }),
		locations: stringArray({ value: record.locations }),
		timeOfDay:
			typeof record.timeOfDay === "string"
				? record.timeOfDay.trim()
				: undefined,
		subjects: stringArray({ value: record.subjects }),
		scenes,
		model,
	};
}

function sampleEvenly({
	values,
	limit,
}: {
	values: number[];
	limit: number;
}): number[] {
	if (values.length <= limit) return values;
	if (limit === 1) return [values[Math.floor(values.length / 2)]];
	return Array.from({ length: limit }, (_, index) => {
		const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
		return values[sourceIndex];
	});
}

function buildSemanticSampleTimes({
	duration,
	sceneBoundaries,
	maxFrames = 12,
}: {
	duration: number;
	sceneBoundaries: number[];
	maxFrames?: number;
}): number[] {
	const boundedMaxFrames = Math.max(1, Math.floor(maxFrames));
	const boundaries = [
		...new Set([
			0,
			...sceneBoundaries.filter(
				(value) => Number.isFinite(value) && value > 0 && value < duration
			),
			duration,
		]),
	].sort((left, right) => left - right);
	const sceneCenters = boundaries.slice(0, -1).map((start, index) => {
		const end = boundaries[index + 1] ?? duration;
		return (start + end) / 2;
	});
	const minimumFrames = Math.min(6, boundedMaxFrames);
	const uniformTimes = Array.from(
		{ length: minimumFrames },
		(_, index) => (duration * (index + 0.5)) / minimumFrames
	);
	const candidates = [
		...new Set(
			[...sceneCenters, ...uniformTimes].map((time) =>
				Number(Math.min(duration - 0.001, Math.max(0, time)).toFixed(3))
			)
		),
	].sort((left, right) => left - right);
	return sampleEvenly({ values: candidates, limit: boundedMaxFrames });
}

export async function analyzeSourceSemantics({
	path,
	probe,
	sceneBoundaries = [],
	model,
	executor,
	signal,
	onProgress,
}: {
	path: string;
	probe: MediaProbe;
	sceneBoundaries?: number[];
	model: string;
	executor: PipelineExecutor;
	signal: AbortSignal;
	onProgress?: (percent: number, message: string) => void;
}): Promise<SourceSemantics> {
	if (!ModelRegistry.has(model)) throw new Error(`Unknown model '${model}'`);
	const modelDefinition = ModelRegistry.get(model);
	const sampleTimes =
		modelDefinition.providerBackend === "openrouter"
			? buildSemanticSampleTimes({
					duration: probe.duration,
					sceneBoundaries,
				})
			: [];
	const prompt = `Analyze this source video for editorial selection. Return ONLY valid JSON:
{
  "summary": "concise factual visual summary",
  "tags": ["objects", "places", "actions", "moods"],
  "locations": ["recognized or strongly inferred locations"],
  "timeOfDay": "day|golden-hour|dusk|night|unknown",
  "subjects": ["main visible subjects"],
  "scenes": [{
    "start": 0.0,
    "end": 3.2,
    "description": "what is visibly happening",
    "tags": ["searchable concepts"],
    "subjectPosition": "top-left|top|top-right|left|center|right|bottom-left|bottom|bottom-right",
    "motionDirection": "static|left|right|up|down|up-left|up-right|down-left|down-right|mixed"
  }]
}
Use source seconds, cover the full ${probe.duration.toFixed(3)} second video, and distinguish subject motion from a static composition. Do not invent a named place when visual evidence is weak.${
		sampleTimes.length > 0
			? ` The ordered reference frames correspond to source seconds: ${sampleTimes.join(", ")}. Anchor scene ranges to those timestamps; local scene detection will refine exact boundaries.`
			: ""
	}`;
	const step: PipelineStep = {
		type: "image_understanding",
		model,
		params: {
			prompt,
			analysis_type: "editorial_index",
			max_tokens: 6000,
		},
		enabled: true,
		retryCount: 0,
	};
	const images =
		sampleTimes.length > 0
			? await extractJpegDataUrls({
					path,
					times: sampleTimes,
					signal,
				})
			: undefined;
	const result = await executor.executeStep(
		step,
		images ? { images } : { videoUrl: path },
		{
			signal,
			onProgress,
		}
	);
	if (!result.success) {
		throw new Error(result.error || "Semantic analysis failed");
	}
	const parsed = parseModelJson({ value: result.text ?? result.data });
	return normalizeSemantics({ value: parsed, duration: probe.duration, model });
}

export const semanticAnalysisInternals = {
	buildSemanticSampleTimes,
	normalizeSemantics,
	parseModelJson,
	sampleEvenly,
};

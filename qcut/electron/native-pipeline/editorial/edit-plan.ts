import { promises as fs } from "node:fs";
import { basename, resolve } from "node:path";
import {
	EDIT_DECISION_LIST_VERSION,
	MEDIA_INDEX_VERSION,
	type EditDecision,
	type EditDecisionList,
	type FramePosition,
	type IndexedMediaSource,
	type IndexedRange,
	type IndexedScene,
	type MediaIndex,
	type MotionDirection,
	type QCutTimelineManifest,
	type ScriptBeat,
} from "./types.js";

interface CandidateContext {
	source: IndexedMediaSource;
	scene: IndexedScene;
	range: IndexedRange;
	corpus: string;
}

interface ShotSlot {
	id: string;
	beat: ScriptBeat;
	start: number;
	end: number;
	duration: number;
}

const POSITION_POINTS: Record<FramePosition, { x: number; y: number }> = {
	"top-left": { x: 0.17, y: 0.17 },
	top: { x: 0.5, y: 0.17 },
	"top-right": { x: 0.83, y: 0.17 },
	left: { x: 0.17, y: 0.5 },
	center: { x: 0.5, y: 0.5 },
	right: { x: 0.83, y: 0.5 },
	"bottom-left": { x: 0.17, y: 0.83 },
	bottom: { x: 0.5, y: 0.83 },
	"bottom-right": { x: 0.83, y: 0.83 },
};

const MOTION_VECTORS: Record<MotionDirection, { x: number; y: number }> = {
	static: { x: 0, y: 0 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	"up-left": { x: -0.7, y: -0.7 },
	"up-right": { x: 0.7, y: -0.7 },
	"down-left": { x: -0.7, y: 0.7 },
	"down-right": { x: 0.7, y: 0.7 },
	mixed: { x: 0, y: 0 },
};

function round({
	value,
	digits = 3,
}: {
	value: number;
	digits?: number;
}): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function toRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export function parseMediaIndex({ value }: { value: unknown }): MediaIndex {
	const record = toRecord({ value });
	if (!record || record.version !== MEDIA_INDEX_VERSION) {
		throw new Error(`Expected media index version ${MEDIA_INDEX_VERSION}`);
	}
	if (!Array.isArray(record.sources) || record.sources.length === 0) {
		throw new Error("Media index has no sources");
	}
	return record as unknown as MediaIndex;
}

export async function readMediaIndex({
	path,
}: {
	path: string;
}): Promise<MediaIndex> {
	const parsed = JSON.parse(
		await fs.readFile(resolve(path), "utf8")
	) as unknown;
	return parseMediaIndex({ value: parsed });
}

function candidateCorpus({
	source,
	scene,
}: {
	source: IndexedMediaSource;
	scene: IndexedScene;
}): string {
	return [
		source.filename,
		source.semantics?.summary,
		source.semantics?.timeOfDay,
		...(source.semantics?.tags ?? []),
		...(source.semantics?.locations ?? []),
		...(source.semantics?.subjects ?? []),
		scene.description,
		...scene.tags,
	]
		.filter((value): value is string => Boolean(value))
		.join(" ")
		.toLowerCase();
}

function flattenCandidates({
	index,
}: {
	index: MediaIndex;
}): CandidateContext[] {
	return index.sources.flatMap((source) =>
		source.scenes.flatMap((scene) =>
			scene.candidates.map((range) => ({
				source,
				scene,
				range,
				corpus: candidateCorpus({ source, scene }),
			}))
		)
	);
}

function expandBeatSlots({
	beats,
	maxShotDuration,
}: {
	beats: ScriptBeat[];
	maxShotDuration: number;
}): ShotSlot[] {
	const slots: ShotSlot[] = [];
	for (const beat of beats) {
		const shotCount = Math.max(1, Math.ceil(beat.duration / maxShotDuration));
		for (let index = 0; index < shotCount; index++) {
			const start =
				index === 0
					? round({ value: beat.start })
					: (slots[slots.length - 1]?.end ?? round({ value: beat.start }));
			const end = round({
				value:
					index === shotCount - 1
						? beat.end
						: beat.start + (beat.duration * (index + 1)) / shotCount,
			});
			slots.push({
				id: `${beat.id}-${index + 1}`,
				beat,
				start,
				end,
				duration: round({ value: end - start }),
			});
		}
	}
	return slots;
}

function semanticScore({
	keywords,
	corpus,
}: {
	keywords: string[];
	corpus: string;
}): { score: number; matches: string[] } {
	const meaningful = keywords.filter((keyword) => keyword.length >= 2);
	const matches = meaningful.filter((keyword) => corpus.includes(keyword));
	return {
		score:
			meaningful.length === 0
				? 0
				: Math.min(1, matches.length / Math.min(5, meaningful.length)),
		matches: [...new Set(matches)].slice(0, 5),
	};
}

function continuityScore({
	previous,
	candidate,
}: {
	previous?: EditDecision;
	candidate: CandidateContext;
}): number {
	if (!previous) return 0.5;
	const previousMotion = MOTION_VECTORS[previous.motionDirection];
	const nextMotion = MOTION_VECTORS[candidate.range.metrics.motionDirection];
	const previousMagnitude = Math.hypot(previousMotion.x, previousMotion.y);
	const nextMagnitude = Math.hypot(nextMotion.x, nextMotion.y);
	const motionScore =
		previousMagnitude === 0 || nextMagnitude === 0
			? 0.65
			: (previousMotion.x * nextMotion.x + previousMotion.y * nextMotion.y) /
					(previousMagnitude * nextMagnitude) /
					2 +
				0.5;
	const previousPosition = POSITION_POINTS[previous.subjectPosition];
	const nextPosition = POSITION_POINTS[candidate.range.metrics.subjectPosition];
	const positionDistance = Math.hypot(
		previousPosition.x - nextPosition.x,
		previousPosition.y - nextPosition.y
	);
	const compositionScore = Math.max(0, 1 - positionDistance / 1.1);
	return motionScore * 0.65 + compositionScore * 0.35;
}

function selectCandidate({
	slot,
	candidates,
	previous,
	sourceUse,
	rangeUse,
}: {
	slot: ShotSlot;
	candidates: CandidateContext[];
	previous?: EditDecision;
	sourceUse: Map<string, number>;
	rangeUse: Map<string, number>;
}): { candidate: CandidateContext; score: number; matches: string[] } {
	const viable = candidates.filter(
		(candidate) => candidate.range.duration + 0.05 >= slot.duration
	);
	const pool = viable.length > 0 ? viable : candidates;
	const ranked = pool.map((candidate) => {
		const semantic = semanticScore({
			keywords: slot.beat.keywords,
			corpus: candidate.corpus,
		});
		const continuity = continuityScore({ previous, candidate });
		const repeatedSource = sourceUse.get(candidate.source.id) ?? 0;
		const repeatedRange = rangeUse.get(candidate.range.id) ?? 0;
		const immediateRepeat = previous?.sourceId === candidate.source.id ? 1 : 0;
		const score =
			semantic.score * 0.46 +
			candidate.range.score * 0.33 +
			continuity * 0.21 -
			repeatedSource * 0.035 -
			repeatedRange * 0.3 -
			immediateRepeat * 0.12;
		return { candidate, score, matches: semantic.matches };
	});
	ranked.sort(
		(left, right) =>
			right.score - left.score ||
			left.candidate.source.filename.localeCompare(
				right.candidate.source.filename
			) ||
			left.candidate.range.start - right.candidate.range.start
	);
	const selected = ranked[0];
	if (!selected) throw new Error(`No indexed range can cover ${slot.id}`);
	return selected;
}

function buildDecision({
	slot,
	selected,
	index,
	transitionDuration,
}: {
	slot: ShotSlot;
	selected: ReturnType<typeof selectCandidate>;
	index: number;
	transitionDuration: number;
}): EditDecision {
	const extraDuration = Math.max(
		0,
		selected.candidate.range.duration - slot.duration
	);
	const start = round({
		value: selected.candidate.range.start + extraDuration / 2,
	});
	const end = round({ value: start + slot.duration });
	const matched =
		selected.matches.length > 0
			? `matched ${selected.matches.join(", ")}`
			: "best semantic fallback";
	const continuity =
		index === 0
			? "opening composition"
			: `${selected.candidate.range.metrics.motionDirection} screen motion`;
	return {
		id: `clip-${String(index + 1).padStart(2, "0")}`,
		source: selected.candidate.source.filename,
		sourceId: selected.candidate.source.id,
		start,
		end,
		timelineStart: slot.start,
		timelineEnd: slot.end,
		beat: slot.beat.id,
		beatText: slot.beat.text,
		reason: `${matched}; ${selected.candidate.range.reason}; ${continuity}`,
		score: round({ value: selected.score, digits: 4 }),
		motionDirection: selected.candidate.range.metrics.motionDirection,
		subjectPosition: selected.candidate.range.metrics.subjectPosition,
		transition:
			index > 0 && transitionDuration > 0
				? { type: "dissolve", duration: transitionDuration }
				: undefined,
	};
}

function buildDecisions({
	index,
	beats,
	transitionDuration,
}: {
	index: MediaIndex;
	beats: ScriptBeat[];
	transitionDuration: number;
}): EditDecision[] {
	const candidates = flattenCandidates({ index });
	if (candidates.length === 0) throw new Error("Media index has no candidates");
	const maxShotDuration = Math.max(
		2,
		Math.min(
			index.options.candidateDuration,
			Math.max(...candidates.map((candidate) => candidate.range.duration))
		)
	);
	const slots = expandBeatSlots({ beats, maxShotDuration });
	const sourceUse = new Map<string, number>();
	const rangeUse = new Map<string, number>();
	const decisions: EditDecision[] = [];
	for (const [slotIndex, slot] of slots.entries()) {
		const selected = selectCandidate({
			slot,
			candidates,
			previous: decisions[decisions.length - 1],
			sourceUse,
			rangeUse,
		});
		const decision = buildDecision({
			slot,
			selected,
			index: slotIndex,
			transitionDuration,
		});
		decisions.push(decision);
		sourceUse.set(
			selected.candidate.source.id,
			(sourceUse.get(selected.candidate.source.id) ?? 0) + 1
		);
		rangeUse.set(
			selected.candidate.range.id,
			(rangeUse.get(selected.candidate.range.id) ?? 0) + 1
		);
	}
	return decisions;
}

export function createTimelineManifest({
	index,
	edl,
	narrationDuration,
}: {
	index: MediaIndex;
	edl: EditDecisionList;
	narrationDuration?: number;
}): QCutTimelineManifest {
	const sourceById = new Map(
		index.sources.map((source) => [source.id, source])
	);
	const usedSourceIds = [...new Set(edl.clips.map((clip) => clip.sourceId))];
	const media = usedSourceIds.map((sourceId) => {
		const source = sourceById.get(sourceId);
		if (!source) throw new Error(`EDL references unknown source '${sourceId}'`);
		return {
			alias: source.id,
			path: source.source,
			filename: source.filename,
		};
	});
	const elements = edl.clips.map((clip) => {
		const source = sourceById.get(clip.sourceId);
		if (!source)
			throw new Error(`EDL references unknown source '${clip.sourceId}'`);
		const timelineDuration = round({
			value: clip.timelineEnd - clip.timelineStart,
			digits: 6,
		});
		return {
			alias: clip.id,
			type: "media" as const,
			media: source.id,
			sourceName: source.filename,
			startTime: clip.timelineStart,
			duration: source.probe.duration,
			trimStart: clip.start,
			trimEnd: round({
				value: Math.max(
					0,
					source.probe.duration - clip.start - timelineDuration
				),
				digits: 6,
			}),
			playbackRate: 1,
		};
	});
	const tracks: QCutTimelineManifest["tracks"] = [
		{
			alias: "main-video",
			name: "Editorial Plan",
			type: "media",
			elements,
		},
	];
	if (edl.narration) {
		const narrationAlias = "narration";
		const sourceDuration = narrationDuration ?? edl.duration;
		media.push({
			alias: narrationAlias,
			path: edl.narration,
			filename: basename(edl.narration),
		});
		tracks.push({
			alias: "narration-track",
			name: "Narration",
			type: "audio",
			elements: [
				{
					alias: "narration-audio",
					type: "media",
					media: narrationAlias,
					sourceName: basename(edl.narration),
					startTime: 0,
					duration: sourceDuration,
					trimStart: 0,
					trimEnd: Math.max(0, sourceDuration - edl.duration),
					playbackRate: 1,
				},
			],
		});
	}
	return {
		replace: true,
		media,
		tracks,
		transitions: edl.clips.slice(1).flatMap((clip, index) =>
			clip.transition
				? [
						{
							track: "main-video",
							from: edl.clips[index].id,
							to: clip.id,
							type: clip.transition.type,
							duration: clip.transition.duration,
						},
					]
				: []
		),
	};
}

export async function createEditPlan({
	index,
	indexPath,
	scriptPath,
	narration,
	language,
	beats,
	duration,
	transitionDuration,
	outputDir,
	narrationDuration,
	warnings = [],
}: {
	index: MediaIndex;
	indexPath: string;
	scriptPath?: string;
	narration?: string;
	language: string;
	beats: ScriptBeat[];
	duration: number;
	transitionDuration: number;
	outputDir: string;
	narrationDuration?: number;
	warnings?: string[];
}): Promise<{
	edl: EditDecisionList;
	manifest: QCutTimelineManifest;
	edlPath: string;
	manifestPath: string;
}> {
	const clips = buildDecisions({ index, beats, transitionDuration });
	const edl: EditDecisionList = {
		version: EDIT_DECISION_LIST_VERSION,
		createdAt: new Date().toISOString(),
		index: resolve(indexPath),
		script: scriptPath ? resolve(scriptPath) : undefined,
		narration: narration ? resolve(narration) : undefined,
		language,
		duration,
		beats,
		clips,
		warnings,
	};
	const manifest = createTimelineManifest({ index, edl, narrationDuration });
	const targetDir = resolve(outputDir);
	await fs.mkdir(targetDir, { recursive: true });
	const edlPath = resolve(targetDir, "edl.json");
	const manifestPath = resolve(targetDir, "timeline.json");
	await Promise.all([
		fs.writeFile(edlPath, `${JSON.stringify(edl, null, 2)}\n`),
		fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
	]);
	return { edl, manifest, edlPath, manifestPath };
}

export const editPlanInternals = {
	buildDecisions,
	candidateCorpus,
	continuityScore,
	expandBeatSlots,
	semanticScore,
	selectCandidate,
};

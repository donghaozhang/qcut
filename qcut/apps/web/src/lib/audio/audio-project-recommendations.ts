import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { SoundEffect } from "@/types/sounds";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import {
	audioProjectVisionContext,
	getAudioProjectVisionAnalysis,
	getReferencedProjectVideoMedia,
} from "./audio-project-vision";

export type ProjectAudioSignal =
	| "cinematic"
	| "dialogue"
	| "dynamic"
	| "emotional"
	| "graduation"
	| "healing"
	| "kpop"
	| "nature"
	| "project"
	| "transitions"
	| "travel"
	| "tutorial"
	| "winter";

export interface ProjectSfxCue {
	time: number;
	sound: SoundEffect;
	reason: "cut" | "transition";
}

export interface ProjectAudioRecommendations {
	sounds: SoundEffect[];
	music: SoundEffect[];
	soundEffects: SoundEffect[];
	signals: ProjectAudioSignal[];
	cues: ProjectSfxCue[];
	captionCount: number;
	visualClipCount: number;
	visionAnalyzedCount: number;
}

interface SignalRule {
	signal: Exclude<
		ProjectAudioSignal,
		"dialogue" | "dynamic" | "project" | "transitions"
	>;
	pattern: RegExp;
	soundTerms: readonly string[];
}

const SIGNAL_RULES: readonly SignalRule[] = [
	{
		signal: "travel",
		pattern:
			/travel|trip|journey|road|vacation|outdoor|beach|旅行|旅拍|公路|户外|海边|vlog/i,
		soundTerms: ["travel", "vlog", "road-trip", "outdoor", "light"],
	},
	{
		signal: "graduation",
		pattern: /graduation|campus|school|farewell|毕业|校园|青春|告别|回忆/i,
		soundTerms: ["graduation", "memory", "farewell", "nostalgic"],
	},
	{
		signal: "winter",
		pattern: /winter|snow|christmas|冬天|冬日|雪|圣诞/i,
		soundTerms: ["winter", "snow", "peaceful", "night"],
	},
	{
		signal: "healing",
		pattern: /healing|calm|relax|sleep|cozy|治愈|放松|安静|温暖|助眠/i,
		soundTerms: ["healing", "calm", "ambient", "peaceful", "warm"],
	},
	{
		signal: "emotional",
		pattern: /emotional|memory|love|sad|reflective|情绪|感动|爱情|伤感|回忆/i,
		soundTerms: ["emotional", "reflective", "nostalgic", "memory"],
	},
	{
		signal: "nature",
		pattern: /nature|forest|rain|bird|ocean|自然|森林|雨|鸟|海浪/i,
		soundTerms: ["nature", "forest", "rain", "birds", "ambient"],
	},
	{
		signal: "tutorial",
		pattern: /tutorial|guide|review|demo|教程|讲解|测评|演示|知识/i,
		soundTerms: ["tutorial", "ui", "click", "notification", "documentary"],
	},
	{
		signal: "kpop",
		pattern: /k-?pop|fashion|dance|韩流|女团|男团|时尚|舞蹈/i,
		soundTerms: ["kpop", "fashion", "dance", "social", "confident"],
	},
	{
		signal: "cinematic",
		pattern: /cinematic|trailer|epic|movie|电影|预告|史诗|大片/i,
		soundTerms: ["cinematic", "trailer", "dramatic", "impact", "title"],
	},
] as const;

const DYNAMIC_SOUND_TERMS = [
	"dynamic",
	"beat",
	"energetic",
	"impact",
	"whoosh",
	"transition",
];
const DIALOGUE_SOUND_TERMS = [
	"ambient",
	"instrumental",
	"room-tone",
	"dialogue",
	"documentary",
];
const TRANSITION_SOUND_TERMS = ["whoosh", "transition", "motion", "riser"];

function metadataText({
	metadata,
}: {
	metadata: MediaItem["metadata"];
}): string[] {
	if (!metadata) return [];
	return Object.values(metadata as Record<string, unknown>).flatMap((value) => {
		if (typeof value === "string") return [value];
		if (Array.isArray(value)) {
			return value.filter((item): item is string => typeof item === "string");
		}
		return [];
	});
}

function elementText({ element }: { element: TimelineElement }): string[] {
	if (element.type === "text") return [element.content, element.name];
	if (element.type === "captions") return [element.text, element.name];
	if (element.type === "markdown") {
		return [element.markdownContent, element.name];
	}
	return [element.name];
}

function effectiveElementDuration({
	element,
}: {
	element: TimelineElement;
}): number {
	return element.type === "media"
		? getMediaTimelineDuration(element)
		: Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

function soundSearchText({ sound }: { sound: SoundEffect }): string {
	return [
		sound.name,
		sound.localizedName,
		sound.description,
		sound.localizedDescription,
		...sound.tags,
		...(sound.moods ?? []),
		...(sound.scenes ?? []),
	]
		.filter(Boolean)
		.join(" ")
		.toLocaleLowerCase();
}

function matchingTerms({
	signal,
}: {
	signal: ProjectAudioSignal;
}): readonly string[] {
	if (signal === "dynamic") return DYNAMIC_SOUND_TERMS;
	if (signal === "dialogue") return DIALOGUE_SOUND_TERMS;
	if (signal === "transitions") return TRANSITION_SOUND_TERMS;
	if (signal === "project") return [];
	return SIGNAL_RULES.find((rule) => rule.signal === signal)?.soundTerms ?? [];
}

function scoreSound({
	sound,
	signals,
}: {
	sound: SoundEffect;
	signals: readonly ProjectAudioSignal[];
}): number {
	const searchText = soundSearchText({ sound });
	const semanticScore = signals.reduce((score, signal) => {
		const matches = matchingTerms({ signal }).filter((term) =>
			searchText.includes(term)
		).length;
		return score + matches * 4;
	}, 0);
	const dialogueMusicBonus =
		sound.kind === "music" && signals.includes("dialogue") && sound.loopable
			? 3
			: 0;
	const transitionSfxBonus =
		sound.kind === "sound-effect" &&
		signals.includes("transitions") &&
		searchText.includes("whoosh")
			? 6
			: 0;
	const popularityScore = Math.log10(Math.max(1, sound.downloads)) / 4;
	return (
		semanticScore + dialogueMusicBonus + transitionSfxBonus + popularityScore
	);
}

function rankedSounds({
	catalog,
	kind,
	signals,
	limit,
}: {
	catalog: readonly SoundEffect[];
	kind: "music" | "sound-effect";
	signals: readonly ProjectAudioSignal[];
	limit: number;
}): SoundEffect[] {
	return catalog
		.filter((sound) => sound.kind === kind)
		.map((sound) => ({ sound, score: scoreSound({ sound, signals }) }))
		.sort(
			(left, right) =>
				right.score - left.score ||
				right.sound.downloads - left.sound.downloads ||
				left.sound.id - right.sound.id
		)
		.slice(0, limit)
		.map(({ sound }) => sound);
}

function visualClipData({ tracks }: { tracks: readonly TimelineTrack[] }): {
	clips: TimelineElement[];
	transitionTargetIds: Set<string>;
} {
	const mediaTracks = tracks.filter((track) => track.type === "media");
	return {
		clips: mediaTracks
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "media")
			.sort((left, right) => left.startTime - right.startTime),
		transitionTargetIds: new Set(
			mediaTracks.flatMap((track) =>
				(track.transitions ?? []).map((transition) => transition.toElementId)
			)
		),
	};
}

function buildCueTimes({
	clips,
	transitionTargetIds,
	isFastEdit,
}: {
	clips: readonly TimelineElement[];
	transitionTargetIds: ReadonlySet<string>;
	isFastEdit: boolean;
}): Array<{ reason: ProjectSfxCue["reason"]; time: number }> {
	const candidates = clips.slice(1).flatMap((clip, index) => {
		const previous = clips[index];
		const previousEnd =
			previous.startTime + effectiveElementDuration({ element: previous });
		const touchesPrevious = Math.abs(previousEnd - clip.startTime) <= 0.2;
		const explicitTransition = transitionTargetIds.has(clip.id);
		if (!explicitTransition && (!isFastEdit || !touchesPrevious)) return [];
		return [
			{
				time: clip.startTime,
				reason: explicitTransition ? ("transition" as const) : ("cut" as const),
			},
		];
	});
	return candidates
		.filter(
			(candidate, index) =>
				index === 0 || candidate.time - candidates[index - 1].time >= 0.75
		)
		.slice(0, 8);
}

function cueSound({
	catalog,
	dynamic,
	index,
}: {
	catalog: readonly SoundEffect[];
	dynamic: boolean;
	index: number;
}): SoundEffect | undefined {
	const preferredName =
		dynamic && index % 3 === 2 ? "Cinematic Impact" : "Air Whoosh";
	return (
		catalog.find(
			(sound) => sound.kind === "sound-effect" && sound.name === preferredName
		) ?? catalog.find((sound) => sound.kind === "sound-effect")
	);
}

export function buildProjectAudioRecommendations({
	catalog,
	mediaItems,
	projectName,
	tracks,
}: {
	catalog: readonly SoundEffect[];
	mediaItems: readonly MediaItem[];
	projectName: string;
	tracks: readonly TimelineTrack[];
}): ProjectAudioRecommendations {
	const timelineElements = tracks.flatMap((track) => track.elements);
	const captionCount = timelineElements.filter(
		(element) => element.type === "captions"
	).length;
	const referencedVideoMedia = getReferencedProjectVideoMedia({
		mediaItems,
		tracks,
	});
	// Only timeline-referenced media may contribute context; unused library
	// assets would otherwise bias recommendations for unrelated edits.
	const referencedMediaIds = new Set(
		timelineElements.flatMap((element) =>
			element.type === "media" ? [element.mediaId] : []
		)
	);
	const contextText = [
		projectName,
		...timelineElements.flatMap((element) => elementText({ element })),
		...mediaItems
			.filter((item) => referencedMediaIds.has(item.id))
			.flatMap((item) => [
				item.name,
				...metadataText({ metadata: item.metadata }),
			]),
		...referencedVideoMedia.flatMap((mediaItem) =>
			audioProjectVisionContext({ mediaItem })
		),
	].join(" ");
	const { clips, transitionTargetIds } = visualClipData({ tracks });
	const occupiedAudioTimes = tracks
		.filter((track) => track.type === "audio")
		.flatMap((track) => track.elements.map((element) => element.startTime));
	const averageVisualDuration =
		clips.length === 0
			? 0
			: clips.reduce(
					(total, clip) => total + effectiveElementDuration({ element: clip }),
					0
				) / clips.length;
	const isFastEdit = clips.length >= 3 && averageVisualDuration <= 3.5;
	const signals: ProjectAudioSignal[] = SIGNAL_RULES.filter((rule) =>
		rule.pattern.test(contextText)
	).map((rule) => rule.signal);
	if (captionCount > 0) signals.push("dialogue");
	if (isFastEdit) signals.push("dynamic");
	if (transitionTargetIds.size > 0) signals.push("transitions");
	const uniqueSignals = [...new Set(signals)];
	if (uniqueSignals.length === 0) uniqueSignals.push("project");

	const music = rankedSounds({
		catalog,
		kind: "music",
		signals: uniqueSignals,
		limit: 5,
	});
	const soundEffects = rankedSounds({
		catalog,
		kind: "sound-effect",
		signals: uniqueSignals,
		limit: 5,
	});
	const cues = buildCueTimes({
		clips,
		transitionTargetIds,
		isFastEdit,
	})
		.filter(
			({ time }) =>
				!occupiedAudioTimes.some(
					(occupiedTime) => Math.abs(occupiedTime - time) <= 0.1
				)
		)
		.flatMap(({ reason, time }, index) => {
			const sound = cueSound({ catalog, dynamic: isFastEdit, index });
			return sound ? [{ reason, time, sound }] : [];
		});

	return {
		sounds: [...music, ...soundEffects],
		music,
		soundEffects,
		signals: uniqueSignals,
		cues,
		captionCount,
		visualClipCount: clips.length,
		visionAnalyzedCount: referencedVideoMedia.filter(
			(mediaItem) => getAudioProjectVisionAnalysis({ mediaItem }) !== null
		).length,
	};
}

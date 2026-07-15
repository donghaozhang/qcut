import type { PersistedTranscription } from "@qcut/editor-core";
import type { TextTemplateCategoryId } from "@/lib/text/text-template-registry";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

export type SmartTextCategoryId = Extract<
	TextTemplateCategoryId,
	"summary" | "key-point" | "chapter" | "subtitle-title" | "rewrite"
>;

export type SmartTextSourceKind =
	| "caption"
	| "text"
	| "markdown"
	| "transcription";

export interface SmartTextSegment {
	text: string;
	startTime: number;
	endTime: number;
	source: SmartTextSourceKind;
}

export interface SmartTextSuggestion {
	content: string;
	sourceText: string;
	startTime: number;
	source: SmartTextSourceKind;
}

const SMART_TEXT_CATEGORY_IDS = new Set<TextTemplateCategoryId>([
	"summary",
	"key-point",
	"chapter",
	"subtitle-title",
	"rewrite",
]);

const FILLER_WORDS = [
	"然后",
	"就是",
	"其实",
	"这个",
	"那个",
	"大家",
	"我们",
	"你们",
	"basically",
	"actually",
	"really",
	"just",
	"like",
];

const EMPHASIS_TERMS = [
	"重点",
	"关键",
	"核心",
	"结论",
	"方法",
	"步骤",
	"问题",
	"风险",
	"增长",
	"效率",
	"important",
	"key",
	"result",
	"problem",
	"solution",
	"growth",
];

export function isSmartTextCategory({
	categoryId,
}: {
	categoryId: TextTemplateCategoryId;
}): boolean {
	return SMART_TEXT_CATEGORY_IDS.has(categoryId);
}

export function getSmartTextCategoryId({
	categoryId,
}: {
	categoryId: TextTemplateCategoryId;
}): SmartTextCategoryId | null {
	return isSmartTextCategory({ categoryId })
		? (categoryId as SmartTextCategoryId)
		: null;
}

export function collectSmartTextSegments({
	tracks,
	transcriptions,
}: {
	tracks: readonly TimelineTrack[];
	transcriptions: readonly PersistedTranscription[];
}): SmartTextSegment[] {
	const timelineSegments = tracks.flatMap((track) =>
		track.elements.flatMap((element) =>
			getElementSmartTextSegments({ element })
		)
	);
	const transcriptionSegments = transcriptions.flatMap((transcription) =>
		getTranscriptionSmartTextSegments({ transcription })
	);
	return dedupeSmartTextSegments({
		segments: [...timelineSegments, ...transcriptionSegments],
	});
}

export function generateSmartTextSuggestions({
	categoryId,
	tracks,
	transcriptions,
	maxSuggestions = 20,
}: {
	categoryId: SmartTextCategoryId;
	tracks: readonly TimelineTrack[];
	transcriptions: readonly PersistedTranscription[];
	maxSuggestions?: number;
}): SmartTextSuggestion[] {
	const segments = collectSmartTextSegments({ tracks, transcriptions });
	if (segments.length === 0) return [];

	if (categoryId === "summary") {
		return buildSummarySuggestions({ segments, maxSuggestions });
	}
	if (categoryId === "key-point") {
		return buildKeyPointSuggestions({ segments, maxSuggestions });
	}
	if (categoryId === "chapter") {
		return buildChapterSuggestions({ segments, maxSuggestions });
	}
	if (categoryId === "subtitle-title") {
		return buildSubtitleTitleSuggestions({ segments, maxSuggestions });
	}
	return buildRewriteSuggestions({ segments, maxSuggestions });
}

function getElementSmartTextSegments({
	element,
}: {
	element: TimelineElement;
}): SmartTextSegment[] {
	if (element.type === "captions") {
		return [
			createSegment({
				text: element.text,
				startTime: element.startTime,
				endTime: element.startTime + element.duration,
				source: "caption",
			}),
		].filter(isPresentSegment);
	}
	if (element.type === "text") {
		return [
			createSegment({
				text: element.content,
				startTime: element.startTime,
				endTime: element.startTime + element.duration,
				source: "text",
			}),
		].filter(isPresentSegment);
	}
	if (element.type === "markdown") {
		return [
			createSegment({
				text: stripMarkdown({ text: element.markdownContent }),
				startTime: element.startTime,
				endTime: element.startTime + element.duration,
				source: "markdown",
			}),
		].filter(isPresentSegment);
	}
	return [];
}

function getTranscriptionSmartTextSegments({
	transcription,
}: {
	transcription: PersistedTranscription;
}): SmartTextSegment[] {
	const segments =
		transcription.segments.length > 0
			? transcription.segments
			: [{ text: transcription.text, start: 0, end: transcription.duration }];
	return segments
		.map((segment) =>
			createSegment({
				text: segment.text,
				startTime: segment.start,
				endTime: segment.end,
				source: "transcription",
			})
		)
		.filter(isPresentSegment);
}

function createSegment({
	text,
	startTime,
	endTime,
	source,
}: {
	text: string;
	startTime: number;
	endTime: number;
	source: SmartTextSourceKind;
}): SmartTextSegment | null {
	const normalizedText = normalizeText({ text });
	if (!normalizedText) return null;
	return {
		text: normalizedText,
		startTime: Number.isFinite(startTime) ? startTime : 0,
		endTime: Number.isFinite(endTime) ? endTime : startTime,
		source,
	};
}

function isPresentSegment(
	segment: SmartTextSegment | null
): segment is SmartTextSegment {
	return segment !== null;
}

function dedupeSmartTextSegments({
	segments,
}: {
	segments: readonly SmartTextSegment[];
}): SmartTextSegment[] {
	const seen = new Set<string>();
	const uniqueSegments: SmartTextSegment[] = [];
	const sortedSegments = [...segments].sort(
		(a, b) =>
			a.startTime - b.startTime ||
			getSourcePriority({ source: a.source }) -
				getSourcePriority({ source: b.source }) ||
			a.endTime - b.endTime
	);
	for (const segment of sortedSegments) {
		const normalizedText = normalizeForKey({ text: segment.text });
		const key = `${Math.round(segment.startTime * 10)}:${normalizedText}`;
		if (seen.has(key)) continue;
		seen.add(key);
		uniqueSegments.push(segment);
	}
	return uniqueSegments;
}

function getSourcePriority({
	source,
}: {
	source: SmartTextSourceKind;
}): number {
	if (source === "caption") return 0;
	if (source === "text") return 1;
	if (source === "markdown") return 2;
	return 3;
}

function buildSummarySuggestions({
	segments,
	maxSuggestions,
}: {
	segments: readonly SmartTextSegment[];
	maxSuggestions: number;
}): SmartTextSuggestion[] {
	const rankedSentences = rankSentences({ segments });
	const topSentences = rankedSentences.slice(0, 4);
	const summaryText = truncateText({
		text: topSentences.map((segment) => segment.text).join("，"),
		maxLength: 34,
	});
	const firstSuggestion = createSuggestion({
		prefix: "核心：",
		text: summaryText,
		sourceSegment: topSentences[0] ?? segments[0],
		maxLength: 40,
	});
	const segmentSuggestions = rankedSentences.map((segment) =>
		createSuggestion({
			prefix: "摘要：",
			text: segment.text,
			sourceSegment: segment,
			maxLength: 34,
		})
	);
	return limitSuggestions({
		suggestions: [firstSuggestion, ...segmentSuggestions],
		maxSuggestions,
	});
}

function buildKeyPointSuggestions({
	segments,
	maxSuggestions,
}: {
	segments: readonly SmartTextSegment[];
	maxSuggestions: number;
}): SmartTextSuggestion[] {
	return limitSuggestions({
		suggestions: rankSentences({ segments }).map((segment) =>
			createSuggestion({
				prefix: "重点：",
				text: segment.text,
				sourceSegment: segment,
				maxLength: 30,
			})
		),
		maxSuggestions,
	});
}

function buildChapterSuggestions({
	segments,
	maxSuggestions,
}: {
	segments: readonly SmartTextSegment[];
	maxSuggestions: number;
}): SmartTextSuggestion[] {
	const chapterCount = Math.min(5, Math.max(2, Math.ceil(segments.length / 3)));
	const chapterSize = Math.ceil(segments.length / chapterCount);
	const chapterSegments = segments.filter(
		(_segment, index) => index % chapterSize === 0
	);
	return limitSuggestions({
		suggestions: chapterSegments.map((segment, index) =>
			createSuggestion({
				prefix: `第 ${index + 1} 章：`,
				text: buildCompactTitle({ text: segment.text }),
				sourceSegment: segment,
				maxLength: 22,
			})
		),
		maxSuggestions,
	});
}

function buildSubtitleTitleSuggestions({
	segments,
	maxSuggestions,
}: {
	segments: readonly SmartTextSegment[];
	maxSuggestions: number;
}): SmartTextSuggestion[] {
	return limitSuggestions({
		suggestions: segments.map((segment) =>
			createSuggestion({
				prefix: "",
				text: buildCompactTitle({ text: segment.text }),
				sourceSegment: segment,
				maxLength: 18,
			})
		),
		maxSuggestions,
	});
}

function buildRewriteSuggestions({
	segments,
	maxSuggestions,
}: {
	segments: readonly SmartTextSegment[];
	maxSuggestions: number;
}): SmartTextSuggestion[] {
	const rewritePrefixes = [
		"先看结论：",
		"一句话：",
		"记住这个：",
		"重点来了：",
	];
	const rankedSentences = rankSentences({ segments });
	return limitSuggestions({
		suggestions: rankedSentences.map((segment, index) =>
			createSuggestion({
				prefix: rewritePrefixes[index % rewritePrefixes.length],
				text: segment.text,
				sourceSegment: segment,
				maxLength: 32,
			})
		),
		maxSuggestions,
	});
}

function rankSentences({
	segments,
}: {
	segments: readonly SmartTextSegment[];
}): SmartTextSegment[] {
	return [...segments].sort(
		(a, b) =>
			getSentenceScore({ segment: b }) - getSentenceScore({ segment: a }) ||
			a.startTime - b.startTime
	);
}

function getSentenceScore({ segment }: { segment: SmartTextSegment }): number {
	const text = segment.text.toLocaleLowerCase();
	const length = Array.from(text).length;
	const lengthScore = Math.min(length, 42) / 42;
	const numberScore = /\d/.test(text) ? 0.2 : 0;
	const emphasisScore = EMPHASIS_TERMS.some((term) => text.includes(term))
		? 0.35
		: 0;
	const sourceScore = segment.source === "caption" ? 0.2 : 0;
	return lengthScore + numberScore + emphasisScore + sourceScore;
}

function createSuggestion({
	prefix,
	text,
	sourceSegment,
	maxLength,
}: {
	prefix: string;
	text: string;
	sourceSegment: SmartTextSegment;
	maxLength: number;
}): SmartTextSuggestion {
	const compactText = truncateText({
		text: removeFillerWords({ text }),
		maxLength: Math.max(1, maxLength - Array.from(prefix).length),
	});
	return {
		content: `${prefix}${compactText}`,
		sourceText: sourceSegment.text,
		startTime: sourceSegment.startTime,
		source: sourceSegment.source,
	};
}

function limitSuggestions({
	suggestions,
	maxSuggestions,
}: {
	suggestions: readonly SmartTextSuggestion[];
	maxSuggestions: number;
}): SmartTextSuggestion[] {
	const seen = new Set<string>();
	const uniqueSuggestions: SmartTextSuggestion[] = [];
	for (const suggestion of suggestions) {
		const key = normalizeForKey({ text: suggestion.content });
		if (!key || seen.has(key)) continue;
		seen.add(key);
		uniqueSuggestions.push(suggestion);
		if (uniqueSuggestions.length >= maxSuggestions) break;
	}
	return uniqueSuggestions;
}

function buildCompactTitle({ text }: { text: string }): string {
	const sentence = splitSentences({ text })[0] ?? text;
	const compactSentence = removeFillerWords({ text: sentence });
	const title = compactSentence.replace(/^[，。！？、,.!?\s]+/, "");
	return truncateText({ text: title, maxLength: 14 });
}

function splitSentences({ text }: { text: string }): string[] {
	return text
		.split(/[。！？!?；;\n]+/)
		.map((sentence) => normalizeText({ text: sentence }))
		.filter(Boolean);
}

function removeFillerWords({ text }: { text: string }): string {
	let result = text;
	for (const word of FILLER_WORDS) {
		result = result.replace(
			new RegExp(`\\b${escapeRegExp({ value: word })}\\b`, "gi"),
			""
		);
		result = result.replaceAll(word, "");
	}
	return normalizeText({ text: result });
}

function stripMarkdown({ text }: { text: string }): string {
	return text
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[#>*_-]+/g, " ");
}

function normalizeText({ text }: { text: string }): string {
	return text.replace(/\s+/g, " ").trim();
}

function normalizeForKey({ text }: { text: string }): string {
	return normalizeText({ text }).toLocaleLowerCase();
}

function truncateText({
	text,
	maxLength,
}: {
	text: string;
	maxLength: number;
}): string {
	const characters = Array.from(normalizeText({ text }));
	if (characters.length <= maxLength) return characters.join("");
	return `${characters.slice(0, Math.max(1, maxLength - 1)).join("")}…`;
}

function escapeRegExp({ value }: { value: string }): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

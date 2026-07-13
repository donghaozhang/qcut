import type { TranscriptionSegment } from "@/types/captions";
export {
	CAPTION_STYLE_PRESETS,
	type CaptionStylePreset,
} from "./caption-style-presets";

export interface CaptionQualityFlag {
	id: string;
	label: string;
	severity: "info" | "warning" | "danger";
}

export interface BatchReplaceRule {
	find: string;
	replace: string;
	caseSensitive: boolean;
}

export interface CaptionTextTransformOptions {
	punctuationMode: "keep" | "remove-end" | "add-periods";
	maxCharsPerLine: number;
	compressToChars: number;
	removeFillers: boolean;
}

export type CaptionPostProcessAction =
	| "polish"
	| "resegment"
	| "localize"
	| "highlight-quotes"
	| "remove-fillers";

export interface CaptionPostProcessResult {
	segments: TranscriptionSegment[];
	changedCount: number;
}

export interface CaptionTextHighlight {
	text: string;
	kind: "normal" | "hotword" | "suspicious" | "filler";
}

export interface CaptionRewrite {
	id: number;
	text: string;
}

const FILLER_PATTERNS = [
	/\b(um+|uh+|er+|ah+)\b/gi,
	/\b(you know|kind of|sort of)\b/gi,
	/(嗯+|呃+|啊+|这个|那个|就是说|然后呢)/g,
];
const TOKEN_PATTERN =
	/(\s+|\?{2,}|!{2,}|…+|[A-Za-z][\w'-]*|[\u4e00-\u9fff]{1,4}|[0-9]+|.)/gu;
const SUSPICIOUS_TOKEN_PATTERN =
	/([A-Za-z])\1{2,}|(.)\2{3,}|�|\?{2,}|…{2,}|呃{2,}|嗯{2,}/u;

export function getSegmentConfidence({
	segment,
}: {
	segment: TranscriptionSegment;
}): number {
	const confidence = 1 - Math.max(0, Math.min(1, segment.no_speech_prob));
	if (segment.avg_logprob < -1.2) return Math.max(0, confidence - 0.25);
	if (segment.compression_ratio > 2.6) return Math.max(0, confidence - 0.15);
	return confidence;
}

export function getQualityFlags({
	segment,
	hotWords,
}: {
	segment: TranscriptionSegment;
	hotWords: string[];
}): CaptionQualityFlag[] {
	const flags: CaptionQualityFlag[] = [];
	const confidence = getSegmentConfidence({ segment });
	const duration = segment.end - segment.start;
	const trimmedText = segment.text.trim();
	const charsPerSecond = trimmedText.length / Math.max(duration, 0.1);
	const normalizedHotWords = hotWords
		.map((word) => word.trim())
		.filter((word) => word.length > 0);

	if (confidence < 0.72) {
		flags.push({
			id: "low-confidence",
			label: "低置信度",
			severity: confidence < 0.5 ? "danger" : "warning",
		});
	}

	if (duration < 0.45) {
		flags.push({ id: "too-short", label: "时长过短", severity: "warning" });
	}

	if (charsPerSecond > 12) {
		flags.push({ id: "too-dense", label: "字数偏密", severity: "warning" });
	}

	if (trimmedText.length > 42) {
		flags.push({ id: "too-long", label: "单句偏长", severity: "info" });
	}

	if (segment.compression_ratio > 2.6) {
		flags.push({ id: "repetition", label: "疑似重复", severity: "warning" });
	}

	if (
		normalizedHotWords.length > 0 &&
		/[A-Za-z][\w-]*|[一-龥]{2,}/.test(trimmedText)
	) {
		const containsHotWord = normalizedHotWords.some((word) =>
			trimmedText.toLowerCase().includes(word.toLowerCase())
		);
		if (!containsHotWord) {
			flags.push({ id: "no-hotword", label: "需核对专名", severity: "info" });
		}
	}

	return flags;
}

export function getCaptionTextHighlights({
	hotWords,
	text,
}: {
	hotWords: string[];
	text: string;
}): CaptionTextHighlight[] {
	const normalizedHotWords = hotWords
		.map((word) => word.trim())
		.filter((word) => word.length > 0);
	if (normalizedHotWords.length === 0) {
		return tokenizeCaptionText({ text }).map((token) => ({
			text: token,
			kind: getTokenHighlightKind({ token, hotWords: [] }),
		}));
	}

	const hotWordPattern = new RegExp(
		`(${normalizedHotWords.map(escapeRegExp).join("|")})`,
		"giu"
	);

	return text
		.split(hotWordPattern)
		.filter((part) => part.length > 0)
		.flatMap((part) => {
			const isHotWord = normalizedHotWords.some(
				(word) => word.toLowerCase() === part.toLowerCase()
			);
			if (isHotWord) return [{ text: part, kind: "hotword" as const }];
			return tokenizeCaptionText({ text: part }).map((token) => ({
				text: token,
				kind: getTokenHighlightKind({ token, hotWords: normalizedHotWords }),
			}));
		});
}

function tokenizeCaptionText({ text }: { text: string }): string[] {
	return Array.from(text.matchAll(TOKEN_PATTERN)).map((match) => match[0]);
}

function getTokenHighlightKind({
	hotWords,
	token,
}: {
	hotWords: string[];
	token: string;
}): CaptionTextHighlight["kind"] {
	if (/^\s+$/u.test(token)) return "normal";
	if (hotWords.some((word) => word.toLowerCase() === token.toLowerCase())) {
		return "hotword";
	}
	if (
		FILLER_PATTERNS.some((pattern) => {
			pattern.lastIndex = 0;
			return pattern.test(token);
		})
	) {
		return "filler";
	}
	if (SUSPICIOUS_TOKEN_PATTERN.test(token)) return "suspicious";
	return "normal";
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyBatchReplace({
	segments,
	rule,
}: {
	segments: TranscriptionSegment[];
	rule: BatchReplaceRule;
}): TranscriptionSegment[] {
	if (!rule.find) return segments;

	const escapedFind = rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const flags = rule.caseSensitive ? "g" : "gi";
	const pattern = new RegExp(escapedFind, flags);

	return segments.map((segment) => ({
		...segment,
		text: segment.text.replace(pattern, rule.replace),
	}));
}

export function applyCaptionRewrites({
	rewrites,
	segments,
}: {
	rewrites: CaptionRewrite[];
	segments: TranscriptionSegment[];
}): CaptionPostProcessResult {
	const rewriteMap = new Map<number, string>();
	for (const rewrite of rewrites) {
		rewriteMap.set(rewrite.id, rewrite.text);
	}

	let changedCount = 0;
	const nextSegments = segments.map((segment) => {
		const nextText = rewriteMap.get(segment.id);
		if (nextText === undefined || nextText === segment.text) return segment;
		changedCount += 1;
		return { ...segment, text: nextText };
	});

	return { segments: nextSegments, changedCount };
}

export function parseCaptionRewriteResponse({
	content,
}: {
	content: string;
}): CaptionRewrite[] {
	const jsonText = extractJsonArray({ content });
	const parsed: unknown = JSON.parse(jsonText);
	if (!Array.isArray(parsed)) {
		throw new Error("Caption rewrite response must be a JSON array");
	}

	return parsed.flatMap((item): CaptionRewrite[] => {
		if (
			typeof item === "object" &&
			item !== null &&
			"id" in item &&
			"text" in item &&
			typeof item.id === "number" &&
			typeof item.text === "string"
		) {
			return [{ id: item.id, text: item.text }];
		}

		return [];
	});
}

function extractJsonArray({ content }: { content: string }): string {
	const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/u);
	if (fencedMatch?.[1]) return fencedMatch[1].trim();

	const startIndex = content.indexOf("[");
	const endIndex = content.lastIndexOf("]");
	if (startIndex < 0 || endIndex <= startIndex) {
		throw new Error("Caption rewrite response did not include JSON");
	}

	return content.slice(startIndex, endIndex + 1);
}

export function transformCaptionText({
	text,
	options,
}: {
	text: string;
	options: CaptionTextTransformOptions;
}): string {
	let nextText = text.trim().replace(/\s+/g, " ");

	if (options.removeFillers) {
		for (const pattern of FILLER_PATTERNS) {
			nextText = nextText.replace(pattern, "");
		}
		nextText = nextText.replace(/\s{2,}/g, " ").trim();
	}

	if (options.punctuationMode === "remove-end") {
		nextText = nextText.replace(/[。！？.!?]+$/u, "");
	}

	if (
		options.punctuationMode === "add-periods" &&
		nextText.length > 0 &&
		!/[。！？.!?]$/u.test(nextText)
	) {
		nextText = /[\u4e00-\u9fff]/u.test(nextText)
			? `${nextText}。`
			: `${nextText}.`;
	}

	if (
		options.compressToChars > 0 &&
		nextText.length > options.compressToChars
	) {
		nextText = `${nextText.slice(0, Math.max(0, options.compressToChars - 1))}…`;
	}

	return splitCaptionLines({
		text: nextText,
		maxCharsPerLine: options.maxCharsPerLine,
	});
}

export function splitCaptionLines({
	text,
	maxCharsPerLine,
}: {
	text: string;
	maxCharsPerLine: number;
}): string {
	if (maxCharsPerLine <= 0 || text.length <= maxCharsPerLine) return text;

	const words = text.includes(" ") ? text.split(" ") : [...text];
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const separator = text.includes(" ") && currentLine ? " " : "";
		const candidate = `${currentLine}${separator}${word}`;
		if (candidate.length <= maxCharsPerLine || currentLine.length === 0) {
			currentLine = candidate;
			continue;
		}

		lines.push(currentLine);
		currentLine = word;
	}

	if (currentLine) lines.push(currentLine);
	return lines.join("\n");
}

export function transformSegments({
	segments,
	options,
}: {
	segments: TranscriptionSegment[];
	options: CaptionTextTransformOptions;
}): TranscriptionSegment[] {
	return segments.map((segment) => ({
		...segment,
		text: transformCaptionText({ text: segment.text, options }),
	}));
}

export function applyCaptionPostProcess({
	action,
	segments,
	targetLanguage,
}: {
	action: CaptionPostProcessAction;
	segments: TranscriptionSegment[];
	targetLanguage?: string;
}): CaptionPostProcessResult {
	switch (action) {
		case "polish":
			return mapChangedSegments({
				segments,
				transform: (text) => polishCaptionText({ text }),
			});
		case "remove-fillers":
			return mapChangedSegments({
				segments,
				transform: (text) =>
					transformCaptionText({
						text,
						options: {
							punctuationMode: "keep",
							maxCharsPerLine: 0,
							compressToChars: 0,
							removeFillers: true,
						},
					}),
			});
		case "resegment":
			return resegmentForRhythm({ segments });
		case "localize":
			return createLocalizationDraft({
				segments,
				targetLanguage: targetLanguage || "target",
			});
		case "highlight-quotes":
			return highlightQuoteCandidates({ segments });
		default:
			return { segments, changedCount: 0 };
	}
}

export function polishCaptionText({ text }: { text: string }): string {
	let nextText = text
		.trim()
		.replace(/\s+/g, " ")
		.replace(/\s+([,.;:!?])/g, "$1")
		.replace(/([，。！？、])\s+/g, "$1");

	if (/^[a-z]/.test(nextText)) {
		nextText = `${nextText[0].toUpperCase()}${nextText.slice(1)}`;
	}

	return nextText.replace(/[。！？.!?]+$/u, "");
}

function mapChangedSegments({
	segments,
	transform,
}: {
	segments: TranscriptionSegment[];
	transform: (text: string) => string;
}): CaptionPostProcessResult {
	let changedCount = 0;
	const nextSegments = segments.map((segment) => {
		const nextText = transform(segment.text);
		if (nextText !== segment.text) changedCount += 1;
		return { ...segment, text: nextText };
	});

	return { segments: nextSegments, changedCount };
}

export function resegmentForRhythm({
	segments,
	maxChars = 28,
	maxDuration = 3.2,
}: {
	segments: TranscriptionSegment[];
	maxChars?: number;
	maxDuration?: number;
}): CaptionPostProcessResult {
	let changedCount = 0;
	const nextSegments: TranscriptionSegment[] = [];

	for (const segment of segments) {
		const shouldSplit =
			segment.text.trim().length > maxChars ||
			segment.end - segment.start > maxDuration;

		if (!shouldSplit) {
			nextSegments.push(segment);
			continue;
		}

		const [firstSegment, secondSegment] = splitSegmentAtTextMidpoint({
			segment,
		});
		nextSegments.push(firstSegment, secondSegment);
		changedCount += 1;
	}

	return {
		segments: nextSegments.map((segment, index) => ({
			...segment,
			id: index + 1,
		})),
		changedCount,
	};
}

function createLocalizationDraft({
	segments,
	targetLanguage,
}: {
	segments: TranscriptionSegment[];
	targetLanguage: string;
}): CaptionPostProcessResult {
	return {
		segments: segments.map((segment) => ({
			...segment,
			text: `${segment.text}\n[${targetLanguage}] ${segment.text}`,
		})),
		changedCount: segments.length,
	};
}

function highlightQuoteCandidates({
	segments,
}: {
	segments: TranscriptionSegment[];
}): CaptionPostProcessResult {
	const scoredSegments = segments
		.map((segment) => ({
			id: segment.id,
			score: getQuoteCandidateScore({ text: segment.text }),
		}))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 5);
	const quoteIds = new Set(scoredSegments.map((item) => item.id));
	let changedCount = 0;

	return {
		segments: segments.map((segment) => {
			if (!quoteIds.has(segment.id) || /^【.*】$/u.test(segment.text.trim())) {
				return segment;
			}

			changedCount += 1;
			return { ...segment, text: `【${segment.text.trim()}】` };
		}),
		changedCount,
	};
}

function getQuoteCandidateScore({ text }: { text: string }): number {
	const trimmedText = text.trim();
	let score = 0;
	if (trimmedText.length >= 12 && trimmedText.length <= 48) score += 2;
	if (/[？?！!]/u.test(trimmedText)) score += 1;
	if (
		/because|why|secret|never|always|must|关键|核心|本质|不要|必须/u.test(
			trimmedText
		)
	) {
		score += 2;
	}
	if (trimmedText.length > 60) score -= 2;
	return score;
}

export function splitSegmentAtTextMidpoint({
	segment,
}: {
	segment: TranscriptionSegment;
}): [TranscriptionSegment, TranscriptionSegment] {
	const text = segment.text.trim();
	const midpoint = Math.max(1, Math.floor(text.length / 2));
	const splitIndex = findNearestSplitIndex({ text, midpoint });
	const duration = segment.end - segment.start;
	const splitTime = segment.start + duration / 2;

	return [
		{
			...segment,
			text: text.slice(0, splitIndex).trim(),
			end: splitTime,
		},
		{
			...segment,
			id: segment.id + 0.5,
			text: text.slice(splitIndex).trim(),
			start: splitTime,
			seek: splitTime * 1000,
		},
	];
}

function findNearestSplitIndex({
	text,
	midpoint,
}: {
	text: string;
	midpoint: number;
}): number {
	const separators = ["，", ",", "。", ".", " ", "、"];
	for (let offset = 0; offset < text.length; offset++) {
		const left = midpoint - offset;
		const right = midpoint + offset;
		if (left > 0 && separators.includes(text[left])) return left + 1;
		if (right < text.length && separators.includes(text[right]))
			return right + 1;
	}
	return midpoint;
}

export function mergeAdjacentSegments({
	segments,
	segmentId,
}: {
	segments: TranscriptionSegment[];
	segmentId: number;
}): TranscriptionSegment[] {
	const index = segments.findIndex((segment) => segment.id === segmentId);
	if (index < 0 || index >= segments.length - 1) return segments;

	const currentSegment = segments[index];
	const nextSegment = segments[index + 1];
	const mergedSegment: TranscriptionSegment = {
		...currentSegment,
		end: nextSegment.end,
		text: `${currentSegment.text.trim()} ${nextSegment.text.trim()}`.trim(),
		no_speech_prob: Math.max(
			currentSegment.no_speech_prob,
			nextSegment.no_speech_prob
		),
	};

	return [
		...segments.slice(0, index),
		mergedSegment,
		...segments.slice(index + 2),
	].map((segment, segmentIndex) => ({ ...segment, id: segmentIndex + 1 }));
}

export function splitSegment({
	segments,
	segmentId,
}: {
	segments: TranscriptionSegment[];
	segmentId: number;
}): TranscriptionSegment[] {
	const index = segments.findIndex((segment) => segment.id === segmentId);
	if (index < 0) return segments;

	const [firstSegment, secondSegment] = splitSegmentAtTextMidpoint({
		segment: segments[index],
	});

	return [
		...segments.slice(0, index),
		firstSegment,
		secondSegment,
		...segments.slice(index + 1),
	].map((segment, segmentIndex) => ({ ...segment, id: segmentIndex + 1 }));
}

export function createPlainTextExport({
	segments,
	includeTimestamps,
}: {
	segments: TranscriptionSegment[];
	includeTimestamps: boolean;
}): string {
	return segments
		.map((segment) => {
			if (!includeTimestamps) return segment.text.trim();
			return `[${formatClockTime({ seconds: segment.start })} - ${formatClockTime(
				{
					seconds: segment.end,
				}
			)}] ${segment.text.trim()}`;
		})
		.join("\n");
}

export function formatClockTime({ seconds }: { seconds: number }): string {
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	const tenths = Math.floor((seconds % 1) * 10);
	return `${minutes.toString().padStart(2, "0")}:${secs
		.toString()
		.padStart(2, "0")}.${tenths}`;
}

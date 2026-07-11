import type { TranscriptionSegment } from "@/types/captions";
import type { SubtitleStyle } from "@/types/timeline";

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

export interface CaptionStylePreset {
	id: string;
	name: string;
	description: string;
	platform: string;
	style: SubtitleStyle;
}

const FILLER_PATTERNS = [
	/\b(um+|uh+|er+|ah+)\b/gi,
	/\b(you know|kind of|sort of)\b/gi,
	/(嗯+|呃+|啊+|这个|那个|就是说|然后呢)/g,
];

const DEFAULT_STYLE_BASE: SubtitleStyle = {
	fontFamily: "Arial",
	fontSize: 48,
	fontColor: "#ffffff",
	fontOpacity: 1,
	bold: true,
	italic: false,
	underline: false,
	outlineColor: "#000000",
	outlineWidth: 3,
	shadowColor: "#000000",
	shadowOffset: { x: 1, y: 1 },
	backgroundColor: "#000000",
	bgOpacity: 0,
	position: { align: "bottom", x: 50, y: 86 },
	lineSpacing: 1.25,
	karaokeMode: "none",
	highlightColor: "#ffde00",
	upcomingColor: "#ffffff",
	highlightScale: 1.12,
};

export const CAPTION_STYLE_PRESETS: CaptionStylePreset[] = [
	{
		id: "talking-head-bold",
		name: "口播大字",
		description: "高对比粗体，适合竖屏口播",
		platform: "Douyin / Reels",
		style: {
			...DEFAULT_STYLE_BASE,
			fontSize: 58,
			fontColor: "#ffffff",
			outlineWidth: 5,
			position: { align: "bottom", x: 50, y: 82 },
		},
	},
	{
		id: "knowledge-highlight",
		name: "知识高亮",
		description: "黄色关键词风格，适合教程和讲解",
		platform: "Bilibili / YouTube",
		style: {
			...DEFAULT_STYLE_BASE,
			fontSize: 46,
			fontColor: "#f8fafc",
			highlightColor: "#22d3ee",
			karaokeMode: "word-highlight",
		},
	},
	{
		id: "bilingual-clean",
		name: "双语干净",
		description: "更小字号和更低位置，留给双行字幕",
		platform: "YouTube Shorts",
		style: {
			...DEFAULT_STYLE_BASE,
			fontSize: 38,
			outlineWidth: 3,
			lineSpacing: 1.15,
			position: { align: "bottom", x: 50, y: 88 },
		},
	},
	{
		id: "karaoke-lyrics",
		name: "歌词卡拉 OK",
		description: "逐词高亮，适合歌词和节奏字幕",
		platform: "Music / Lyrics",
		style: {
			...DEFAULT_STYLE_BASE,
			fontSize: 44,
			fontColor: "#fef3c7",
			highlightColor: "#fb7185",
			karaokeMode: "karaoke",
		},
	},
	{
		id: "variety-pop",
		name: "综艺弹幕感",
		description: "大描边和亮色，适合反应类短视频",
		platform: "Xiaohongshu",
		style: {
			...DEFAULT_STYLE_BASE,
			fontSize: 54,
			fontColor: "#a7f3d0",
			outlineColor: "#111827",
			outlineWidth: 6,
			shadowOffset: { x: 2, y: 2 },
		},
	},
];

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

	if (options.compressToChars > 0 && nextText.length > options.compressToChars) {
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
		if (right < text.length && separators.includes(text[right])) return right + 1;
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
			return `[${formatClockTime({ seconds: segment.start })} - ${formatClockTime({
				seconds: segment.end,
			})}] ${segment.text.trim()}`;
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

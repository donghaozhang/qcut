import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import {
	extractWordTimestamps,
	type WordTimestamp,
} from "../output/srt-generator.js";
import type { NarrationWord, ScriptBeat } from "./types.js";

const CONCEPT_ALIASES: Record<string, string[]> = {
	river: ["river", "waterfront", "riverfront", "yarra", "河", "河岸", "雅拉"],
	tram: ["tram", "streetcar", "电车", "有轨电车"],
	dusk: ["dusk", "twilight", "sunset", "golden hour", "黄昏", "日落"],
	city: ["city", "urban", "downtown", "城市", "市区"],
	skyline: ["skyline", "cityscape", "天际线", "城市轮廓"],
	laneway: ["laneway", "alley", "street art", "巷", "涂鸦"],
	park: ["park", "garden", "greenery", "公园", "花园"],
	architecture: ["architecture", "building", "facade", "建筑", "建筑物"],
};

function slug({ value }: { value: string }): string {
	return (
		value
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 40) || "beat"
	);
}

function tokenize({ text }: { text: string }): string[] {
	const normalized = text.toLowerCase();
	const latin = normalized.match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
	const cjkRuns =
		normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g) ?? [];
	const cjk = cjkRuns.flatMap((run) => {
		const characters = [...run];
		const bigrams = characters
			.slice(0, -1)
			.map((character, index) => `${character}${characters[index + 1]}`);
		return [run, ...bigrams, ...characters];
	});
	return [...new Set([...latin, ...cjk])];
}

export function extractEditorialKeywords({ text }: { text: string }): string[] {
	const tokens = tokenize({ text });
	const concepts = Object.entries(CONCEPT_ALIASES).flatMap(
		([concept, aliases]) =>
			aliases.some((alias) => text.toLowerCase().includes(alias.toLowerCase()))
				? [concept, ...aliases]
				: []
	);
	return [
		...new Set([...tokens, ...concepts].map((item) => item.toLowerCase())),
	];
}

function textWeight({ text }: { text: string }): number {
	const cjkCharacters =
		text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
	const latinWords = text.match(/[a-z0-9][a-z0-9'-]*/gi)?.length ?? 0;
	return Math.max(1, cjkCharacters + latinWords * 1.7);
}

function splitScript({ script }: { script: string }): Array<{
	label?: string;
	text: string;
}> {
	const blocks = script
		.trim()
		.split(/\n\s*\n+/)
		.map((block) => block.trim())
		.filter(Boolean);
	const paragraphs = blocks.flatMap((block) => {
		const lines = block
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		const labelledLines = lines.every((line) =>
			/^[A-Z][A-Z0-9_-]{1,30}\s*[:：]/.test(line)
		);
		return labelledLines ? lines : [lines.join(" ")];
	});
	const segments = paragraphs.flatMap((paragraph) => {
		const labelled = paragraph.match(
			/^\s*([A-Z][A-Z0-9_-]{1,30})\s*[:：]\s*(.+)$/s
		);
		if (labelled) return [{ label: labelled[1], text: labelled[2].trim() }];
		return paragraph
			.split(/(?<=[。！？!?；;])\s*/)
			.map((text) => text.trim())
			.filter(Boolean)
			.map((text) => ({ text }));
	});
	return segments.length > 0 ? segments : [{ text: script.trim() }];
}

function timingTokens({ text }: { text: string }): string[] {
	const cjkCharacters =
		text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? [];
	const latinWords = text.match(/[a-z0-9][a-z0-9'-]*/gi) ?? [];
	return cjkCharacters.length > latinWords.length ? cjkCharacters : latinWords;
}

function estimateWords({
	text,
	start,
	end,
}: {
	text: string;
	start: number;
	end: number;
}): NarrationWord[] {
	const tokens = timingTokens({ text });
	if (tokens.length === 0) return [];
	const duration = (end - start) / tokens.length;
	return tokens.map((token, index) => ({
		text: token,
		start: Number((start + index * duration).toFixed(3)),
		end: Number((start + (index + 1) * duration).toFixed(3)),
		estimated: true,
	}));
}

function allocateWithoutWords({
	segments,
	duration,
}: {
	segments: Array<{ label?: string; text: string }>;
	duration: number;
}): ScriptBeat[] {
	const weights = segments.map((segment) => textWeight({ text: segment.text }));
	const totalWeight = weights.reduce((sum, value) => sum + value, 0);
	let cursor = 0;
	return segments.map((segment, index) => {
		const end =
			index === segments.length - 1
				? duration
				: cursor + (duration * weights[index]) / totalWeight;
		const beat: ScriptBeat = {
			id:
				segment.label?.toUpperCase() ||
				`${slug({ value: segment.text })}-${index + 1}`,
			text: segment.text,
			start: Number(cursor.toFixed(3)),
			end: Number(end.toFixed(3)),
			duration: Number((end - cursor).toFixed(3)),
			keywords: extractEditorialKeywords({ text: segment.text }),
			words: estimateWords({ text: segment.text, start: cursor, end }),
		};
		cursor = end;
		return beat;
	});
}

function allocateWithWords({
	segments,
	words,
	duration,
}: {
	segments: Array<{ label?: string; text: string }>;
	words: NarrationWord[];
	duration: number;
}): ScriptBeat[] {
	const beatWeights = segments.map((segment) =>
		textWeight({ text: segment.text })
	);
	const totalBeatWeight = beatWeights.reduce((sum, value) => sum + value, 0);
	const wordWeights = words.map((word) => textWeight({ text: word.text }));
	const totalWordWeight = wordWeights.reduce((sum, value) => sum + value, 0);
	let wordIndex = 0;
	let consumedWordWeight = 0;
	let targetBeatWeight = 0;
	return segments.map((segment, index) => {
		const firstWordIndex = wordIndex;
		targetBeatWeight += beatWeights[index];
		const targetWordWeight =
			index === segments.length - 1
				? totalWordWeight
				: (targetBeatWeight / totalBeatWeight) * totalWordWeight;
		while (
			wordIndex < words.length - 1 &&
			consumedWordWeight + wordWeights[wordIndex] <= targetWordWeight
		) {
			consumedWordWeight += wordWeights[wordIndex];
			wordIndex += 1;
		}
		const selectedWords = words.slice(
			firstWordIndex,
			index === segments.length - 1
				? words.length
				: Math.max(firstWordIndex + 1, wordIndex)
		);
		const previousEnd =
			index === 0 ? 0 : (words[Math.max(0, firstWordIndex - 1)]?.end ?? 0);
		const start = previousEnd;
		const spokenEnd = selectedWords[selectedWords.length - 1]?.end ?? start;
		const end =
			index === segments.length - 1 ? Math.max(spokenEnd, duration) : spokenEnd;
		return {
			id:
				segment.label?.toUpperCase() ||
				`${slug({ value: segment.text })}-${index + 1}`,
			text: segment.text,
			start: Number(start.toFixed(3)),
			end: Number(end.toFixed(3)),
			duration: Number(Math.max(0, end - start).toFixed(3)),
			keywords: extractEditorialKeywords({ text: segment.text }),
			words: selectedWords,
		};
	});
}

export function buildScriptBeats({
	script,
	duration,
	words = [],
}: {
	script: string;
	duration: number;
	words?: NarrationWord[];
}): ScriptBeat[] {
	if (!script.trim()) throw new Error("Narration script is empty");
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Narration duration must be greater than zero");
	}
	const segments = splitScript({ script });
	return words.length > 0
		? allocateWithWords({ segments, words, duration })
		: allocateWithoutWords({ segments, duration });
}

function parseSrtTimestamp({ value }: { value: string }): number {
	const match = value.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
	if (!match) return Number.NaN;
	return (
		Number(match[1]) * 3600 +
		Number(match[2]) * 60 +
		Number(match[3]) +
		Number(`0.${match[4]}`)
	);
}

function splitTimedText({
	text,
	start,
	end,
}: {
	text: string;
	start: number;
	end: number;
}): NarrationWord[] {
	const trimmed = text.trim();
	const containsCjk = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(trimmed);
	const tokens =
		containsCjk && !/\s/.test(trimmed) ? [...trimmed] : trimmed.split(/\s+/);
	if (tokens.length === 0) return [];
	const tokenDuration = (end - start) / tokens.length;
	return tokens.map((token, index) => ({
		text: token,
		start: start + index * tokenDuration,
		end: start + (index + 1) * tokenDuration,
	}));
}

function parseSrtWords({ value }: { value: string }): NarrationWord[] {
	return value
		.replace(/\r/g, "")
		.split(/\n{2,}/)
		.flatMap((block) => {
			const lines = block.split("\n").filter(Boolean);
			const timingIndex = lines.findIndex((line) => line.includes("-->"));
			if (timingIndex < 0) return [];
			const [startText, endText] = lines[timingIndex].split("-->");
			const start = parseSrtTimestamp({ value: startText });
			const end = parseSrtTimestamp({ value: endText });
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
				return [];
			}
			return splitTimedText({
				text: lines.slice(timingIndex + 1).join(" "),
				start,
				end,
			});
		});
}

function normalizeWords({
	words,
}: {
	words: WordTimestamp[];
}): NarrationWord[] {
	return words
		.filter(
			(word) =>
				word.word.trim() &&
				Number.isFinite(word.start) &&
				Number.isFinite(word.end) &&
				word.start >= 0 &&
				word.end > word.start
		)
		.map((word) => ({
			text: word.word.trim(),
			start: word.start,
			end: word.end,
		}))
		.sort((left, right) => left.start - right.start);
}

export async function readNarrationWords({
	path,
}: {
	path: string;
}): Promise<NarrationWord[]> {
	const value = await fs.readFile(resolve(path), "utf8");
	if (/\.srt$/i.test(path) || value.includes("-->")) {
		return parseSrtWords({ value });
	}
	const parsed = JSON.parse(value) as unknown;
	const words = extractWordTimestamps(parsed);
	return normalizeWords({ words: words ?? [] });
}

export function detectScriptLanguage({ script }: { script: string }): string {
	const cjkCount =
		script.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
	const latinCount = script.match(/[a-z]/gi)?.length ?? 0;
	return cjkCount > latinCount * 0.25 ? "zh" : "en";
}

export async function readScriptInput({
	value,
}: {
	value: string;
}): Promise<{ text: string; path?: string }> {
	const absolute = resolve(value);
	try {
		const stat = await fs.stat(absolute);
		if (stat.isFile()) {
			return { text: await fs.readFile(absolute, "utf8"), path: absolute };
		}
	} catch {
		// Treat non-file input as inline script text.
	}
	return { text: value };
}

export const narrationInternals = {
	allocateWithWords,
	allocateWithoutWords,
	parseSrtTimestamp,
	parseSrtWords,
	splitScript,
	textWeight,
	tokenize,
};

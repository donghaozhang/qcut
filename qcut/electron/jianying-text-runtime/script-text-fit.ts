import { asJianyingRecord } from "../jianying-text-package-metadata.js";
import { splitJianyingTextGraphemes } from "./graphemes.js";

const RICH_TEXT_SLOT_PATTERN = /\[([^\]]*)\]/g;
const WIDE_CHARACTER_PATTERN =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;
const MARK_CHARACTER_PATTERN = /^\p{Mark}$/u;
const NARROW_ASCII_CHARACTERS = new Set(".,:;!'\"`|ilIjtfr()[]{}");
const WIDE_ASCII_CHARACTERS = new Set("MW@#%&");

function asciiAdvance({ character }: { character: string }) {
	if (/\s/.test(character)) return character === "\t" ? 1.4 : 0.35;
	if (NARROW_ASCII_CHARACTERS.has(character)) return 0.35;
	if (WIDE_ASCII_CHARACTERS.has(character)) return 0.9;
	return 0.6;
}

function characterAdvance({ character }: { character: string }) {
	if (WIDE_CHARACTER_PATTERN.test(character)) return 1;
	const normalized = character.normalize("NFKD").replace(/\p{Mark}/gu, "");
	if (/^[\x00-\x7f]+$/.test(normalized)) {
		return Array.from(normalized).reduce(
			(total, character) => total + asciiAdvance({ character }),
			0
		);
	}
	return 1;
}

function isZeroWidthCharacter({ character }: { character: string }) {
	const codePoint = character.codePointAt(0) ?? 0;
	return (
		MARK_CHARACTER_PATTERN.test(character) ||
		codePoint === 0xfe0e ||
		codePoint === 0xfe0f ||
		(codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
	);
}

function lineWidth({ line }: { line: string }) {
	let width = 0;
	let joinsPrevious = false;
	for (const character of splitJianyingTextGraphemes({ text: line })) {
		if (character === "\u200d") {
			joinsPrevious = true;
			continue;
		}
		if (isZeroWidthCharacter({ character })) continue;
		if (joinsPrevious) {
			joinsPrevious = false;
			continue;
		}
		width += characterAdvance({ character });
	}
	return width;
}

function richTextSlotMetrics({ richText }: { richText: string }) {
	const text = Array.from(
		richText.matchAll(RICH_TEXT_SLOT_PATTERN),
		(match) => match[1] ?? ""
	).join("");
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	return {
		lineCount: lines.length,
		width: Math.max(0, ...lines.map((line) => lineWidth({ line }))),
	};
}

function requiredFitScale({
	originalRichText,
	editedRichText,
}: {
	originalRichText: string;
	editedRichText: string;
}) {
	const original = richTextSlotMetrics({ richText: originalRichText });
	const edited = richTextSlotMetrics({ richText: editedRichText });
	if (original.width <= 0 || edited.width <= 0) return 1;
	return Math.min(
		1,
		original.width / edited.width,
		original.lineCount / edited.lineCount
	);
}

export function fitJianyingScriptTextWidget({
	widget,
	originalRichText,
	editedRichText,
}: {
	widget: unknown;
	originalRichText: string;
	editedRichText: string;
}) {
	const fitScale = requiredFitScale({ originalRichText, editedRichText });
	if (fitScale >= 1) return 1;
	const scale = asJianyingRecord(widget)?.scale;
	if (
		!Array.isArray(scale) ||
		typeof scale[0] !== "number" ||
		!Number.isFinite(scale[0]) ||
		typeof scale[1] !== "number" ||
		!Number.isFinite(scale[1])
	) {
		return 1;
	}
	scale[0] *= fitScale;
	scale[1] *= fitScale;
	return fitScale;
}

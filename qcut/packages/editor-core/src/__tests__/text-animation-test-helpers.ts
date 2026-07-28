import type { TextElement } from "../types/timeline.js";
import {
	segmentText,
	TEXT_ANIMATION_SCHEMA_VERSION,
	type TextAnimationEffect,
	type TextAnimationLayout,
	type TextAnimationOrder,
	type TextAnimationPhaseBase,
	type TextAnimationsV1,
} from "../text-animation/index.js";

export function createElement({
	overrides = {},
}: {
	overrides?: Partial<TextElement>;
} = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Text",
		content: "AB",
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		duration: 2,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

export function createPhase({
	effect,
	unit = "all",
	order = "forward",
	staggerRatio = 0,
	target = "textAndBackground",
	duration = 1,
	delay = 0,
}: {
	effect: TextAnimationEffect;
	unit?: TextAnimationPhaseBase["sequence"]["unit"];
	order?: TextAnimationOrder;
	staggerRatio?: number;
	target?: TextAnimationPhaseBase["target"];
	duration?: number;
	delay?: number;
}): TextAnimationPhaseBase {
	return {
		timing: { duration, delay, easing: "linear" },
		sequence: { unit, order, staggerRatio, seed: 1234 },
		target,
		effect,
	};
}

export function createAnimation({
	entrance,
	exit,
	loop,
}: {
	entrance?: TextAnimationPhaseBase;
	exit?: TextAnimationPhaseBase;
	loop?: TextAnimationsV1["loop"];
}): TextAnimationsV1 {
	return {
		schemaVersion: TEXT_ANIMATION_SCHEMA_VERSION,
		...(entrance ? { entrance } : {}),
		...(exit ? { exit } : {}),
		...(loop ? { loop } : {}),
	};
}

export function createLayout({
	content,
}: {
	content: string;
}): TextAnimationLayout {
	const graphemes = segmentText({ content, unit: "grapheme" });
	return {
		bounds: { x: -50, y: -20, width: 100, height: 40 },
		fontSize: 20,
		graphemes: graphemes.map((segment, index) => ({
			index,
			start: segment.start,
			end: segment.end,
			lineIndex: 0,
			bounds: { x: index * 20, y: 0, width: 20, height: 24 },
		})),
	};
}

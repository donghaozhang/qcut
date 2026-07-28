import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	segmentText,
	type CompiledTextAnimation,
	type TextAnimationFrameState,
	type TextAnimationLayout,
} from "@qcut/editor-core/text-animation";
import type { TextElement } from "@/types/timeline";
import {
	applyTextAnimationPreset,
	type TextAnimationPresetDefinition,
} from "./text-animation-presets";

export const TEXT_ANIMATION_PREVIEW_TEXT = "ABC123";
export const TEXT_ANIMATION_PREVIEW_FONT_SIZE = 15;
export const TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH = 9;
export const TEXT_ANIMATION_PREVIEW_HEIGHT = 20;

const PREVIEW_FPS = 60;
const PREVIEW_TAIL_SECONDS = 1;

export interface TextAnimationPresetPreview {
	compiled: CompiledTextAnimation;
	layout: TextAnimationLayout;
	graphemes: readonly string[];
	phase: TextAnimationPresetDefinition["phase"];
}

function createPreviewLayout(): {
	layout: TextAnimationLayout;
	graphemes: readonly string[];
} {
	const segments = segmentText({
		content: TEXT_ANIMATION_PREVIEW_TEXT,
		unit: "grapheme",
	});
	const width = segments.length * TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH;
	return {
		graphemes: segments.map((segment) => segment.text),
		layout: {
			bounds: {
				x: 0,
				y: 0,
				width,
				height: TEXT_ANIMATION_PREVIEW_HEIGHT,
			},
			fontSize: TEXT_ANIMATION_PREVIEW_FONT_SIZE,
			graphemes: segments.map((segment, index) => ({
				index,
				start: segment.start,
				end: segment.end,
				lineIndex: 0,
				bounds: {
					x: index * TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
					y: 0,
					width: TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
					height: TEXT_ANIMATION_PREVIEW_HEIGHT,
				},
			})),
		},
	};
}

function createPreviewElement({
	preset,
}: {
	preset: TextAnimationPresetDefinition;
}): TextElement {
	const textAnimations = applyTextAnimationPreset({
		animations: undefined,
		preset,
	});
	const phase = textAnimations[preset.phase];
	const activeSeconds = phase
		? phase.timing.delay + phase.timing.duration
		: preset.defaultDuration;

	return {
		id: `text-animation-preset-preview:${preset.phase}:${preset.id}`,
		name: preset.id,
		type: "text",
		content: TEXT_ANIMATION_PREVIEW_TEXT,
		duration: activeSeconds + PREVIEW_TAIL_SECONDS,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		x: 0,
		y: 0,
		width:
			TEXT_ANIMATION_PREVIEW_TEXT.length * TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
		height: TEXT_ANIMATION_PREVIEW_HEIGHT,
		rotation: 0,
		opacity: 1,
		fontSize: TEXT_ANIMATION_PREVIEW_FONT_SIZE,
		fontFamily: "monospace",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "left",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		textAnimations,
	};
}

export function createTextAnimationPresetPreview({
	preset,
}: {
	preset: TextAnimationPresetDefinition;
}): TextAnimationPresetPreview {
	const { layout, graphemes } = createPreviewLayout();
	return {
		compiled: compileTextAnimation({
			element: createPreviewElement({ preset }),
			fps: PREVIEW_FPS,
		}),
		layout,
		graphemes,
		phase: preset.phase,
	};
}

export function evaluateTextAnimationPresetPreview({
	preview,
	progress,
}: {
	preview: TextAnimationPresetPreview;
	progress: number;
}): TextAnimationFrameState {
	const compiledPhase = preview.compiled[preview.phase];
	const normalizedProgress = Math.min(
		1 - Number.EPSILON,
		Math.max(0, Number.isFinite(progress) ? progress : 0)
	);
	const frame = compiledPhase
		? Math.min(
				compiledPhase.endFrame - 1,
				compiledPhase.startFrame +
					Math.floor(normalizedProgress * compiledPhase.durationFrames)
			)
		: preview.compiled.visibleStartFrame;

	return evaluateTextAnimationFrame({
		compiled: preview.compiled,
		frame,
		layout: preview.layout,
	});
}

import type { CreateTextElement } from "@/types/timeline";
import {
	buildTextFont,
	createTextWidthMeasurer,
	measureTextLineWidth,
	type TextWidthMeasurer,
} from "./text-measurement";

export type { TextWidthMeasurer } from "./text-measurement";

const MIN_TEXT_BOX_SIZE = 40;
const TEXT_BOX_EDGE_GAP = 2;

const clamp = ({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function getCurveDepth({
	curve,
	width,
}: {
	curve: number;
	width: number;
}): number {
	const span = (Math.min(180, Math.abs(curve)) * Math.PI) / 180;
	if (span < 0.01) return 0;
	const radius = width / span;
	return radius * (1 - Math.cos(span / 2));
}

export function fitTextElementBoxToContent({
	element,
	measureTextWidth,
}: {
	element: CreateTextElement;
	measureTextWidth?: TextWidthMeasurer;
}): CreateTextElement {
	if (!element.content.trim()) return element;

	const fontSize = clamp({ value: element.fontSize, min: 8, max: 300 });
	const lineHeight = clamp({
		value: element.lineHeight ?? 1.2,
		min: 0.5,
		max: 5,
	});
	const letterSpacing = clamp({
		value: element.letterSpacing ?? 0,
		min: -20,
		max: 100,
	});
	const padding = clamp({
		value: element.backgroundPadding ?? 12,
		min: 0,
		max: 200,
	});
	const strokeWidth = clamp({
		value: element.strokeWidth ?? 0,
		min: 0,
		max: 40,
	});
	const currentWidth = clamp({
		value: element.width ?? 640,
		min: MIN_TEXT_BOX_SIZE,
		max: 7680,
	});
	const currentHeight = clamp({
		value: element.height ?? 180,
		min: MIN_TEXT_BOX_SIZE,
		max: 4320,
	});
	const font = buildTextFont({
		fontFamily: element.fontFamily,
		fontSize,
		fontStyle: element.fontStyle,
		fontWeight: element.fontWeight,
	});
	const textWidthMeasurer =
		measureTextWidth ?? createTextWidthMeasurer({ fontSize });
	const lines = element.content.replaceAll("\r\n", "\n").split("\n");
	const lineWidths = lines.map((line) =>
		measureTextLineWidth({
			font,
			letterSpacing,
			measureTextWidth: textWidthMeasurer,
			text: line,
		})
	);
	const contentWidth = Math.max(...lineWidths, 0);
	const visualInset = Math.max(padding, strokeWidth + TEXT_BOX_EDGE_GAP);
	const boxOutset = 2 * visualInset;
	const fittedWidth = Math.ceil(contentWidth + boxOutset);
	const curveDepth = getCurveDepth({
		curve: element.curve ?? 0,
		width: contentWidth,
	});
	const fittedHeight = Math.ceil(
		lines.length * fontSize * lineHeight + curveDepth + boxOutset
	);

	// Preserve intentionally constrained boxes whose content already wraps.
	if (fittedWidth > currentWidth || fittedHeight > currentHeight)
		return element;

	return {
		...element,
		width: Math.max(MIN_TEXT_BOX_SIZE, fittedWidth),
		height: Math.max(MIN_TEXT_BOX_SIZE, fittedHeight),
	};
}

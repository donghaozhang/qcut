import type { JianyingTextRuntimeContentBounds } from "../jianying-text-runtime-contract.js";
import {
	jianyingTextFitMargin,
	nextJianyingTextFitValue,
} from "./alpha-fit.js";

function horizontallyFits({
	bounds,
	canvasWidth,
}: {
	bounds: JianyingTextRuntimeContentBounds;
	canvasWidth: number;
}) {
	const margin = jianyingTextFitMargin({ dimension: canvasWidth });
	return (
		bounds.x >= margin && bounds.x + bounds.width - 1 < canvasWidth - margin
	);
}

export function nextJianyingScriptCanvasWidth({
	canvasWidth,
	canvasHeight,
	targetWidth,
	bounds,
}: {
	canvasWidth: number;
	canvasHeight: number;
	targetWidth: number;
	bounds: JianyingTextRuntimeContentBounds | null;
}) {
	const nextWidth = nextJianyingTextFitValue({
		value: canvasWidth,
		bounds,
		frameWidth: canvasWidth,
		frameHeight: canvasHeight,
		fitHorizontal: false,
	});
	if (nextWidth !== null) {
		const integerWidth = Math.max(1, Math.floor(nextWidth));
		return integerWidth < canvasWidth ? integerWidth : null;
	}
	if (
		bounds &&
		canvasWidth === targetWidth &&
		!horizontallyFits({ bounds, canvasWidth })
	) {
		const margin = jianyingTextFitMargin({ dimension: targetWidth });
		return Math.max(1, targetWidth - margin * 2);
	}
	return null;
}

export function centerJianyingScriptContentBounds({
	bounds,
	sourceWidth,
	targetWidth,
}: {
	bounds: JianyingTextRuntimeContentBounds | null;
	sourceWidth: number;
	targetWidth: number;
}) {
	if (!bounds) return null;
	return {
		...bounds,
		x: bounds.x + Math.floor((targetWidth - sourceWidth) / 2),
	};
}

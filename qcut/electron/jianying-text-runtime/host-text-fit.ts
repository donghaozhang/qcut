import type { JianyingTextRuntimePackageKind } from "../jianying-text-runtime-contract.js";
import { nextJianyingTextFitValue } from "./alpha-fit.js";

export interface JianyingHostTextAlphaBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export function shouldFitJianyingHostText({
	packageKind,
}: {
	packageKind: JianyingTextRuntimePackageKind;
}) {
	return packageKind === "TextStyle" || packageKind === "InfoSticker";
}

export function measureJianyingHostTextAlphaBounds({
	bytes,
	width,
	height,
}: {
	bytes: Buffer;
	width: number;
	height: number;
}): JianyingHostTextAlphaBounds | null {
	if (bytes.length !== width * height * 4) {
		throw new Error("Jianying host-text probe has an invalid RGBA frame size.");
	}
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (bytes[(y * width + x) * 4 + 3] === 0) continue;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}
	if (maxX < 0 || maxY < 0) return null;
	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
}

export function nextJianyingHostTextFontSize({
	fontSize,
	bounds,
	width,
	height,
}: {
	fontSize: number;
	bounds: JianyingHostTextAlphaBounds | null;
	width: number;
	height: number;
}) {
	return nextJianyingTextFitValue({
		value: fontSize,
		bounds: bounds
			? {
					x: bounds.minX,
					y: bounds.minY,
					width: bounds.width,
					height: bounds.height,
				}
			: null,
		frameWidth: width,
		frameHeight: height,
	});
}

import fs from "fs";

import type { TextRasterLayer } from "./types";
import type { PreparedVisualLayer } from "./visual-layer-compositor";

export interface ResolvedTextRasterLayer extends TextRasterLayer {
	inputIndex: number;
	sourceIndex: number;
}

interface TextRasterVisualFilters {
	filterSteps: string[];
	preparedLayers: PreparedVisualLayer[];
}

function imageSequenceFirstFramePath({ pattern }: { pattern: string }): string {
	const match = /%0?(\d*)d/.exec(pattern);
	if (!match) {
		throw new Error(
			`Text raster image sequence path must contain an image2 frame pattern: ${pattern}`
		);
	}
	const width = match[1] ? Number.parseInt(match[1], 10) : 1;
	return pattern.replace(match[0], "0".padStart(width, "0"));
}

export function appendTextRasterInputs({
	args,
	layers,
	startInputIndex,
}: {
	args: string[];
	layers: readonly TextRasterLayer[];
	startInputIndex: number;
}): ResolvedTextRasterLayer[] {
	return layers.map((layer, sourceIndex) => {
		if (
			!Number.isFinite(layer.startTime) ||
			!Number.isFinite(layer.endTime) ||
			layer.startTime < 0 ||
			layer.endTime <= layer.startTime
		) {
			throw new Error(
				`Invalid text raster timing for ${layer.elementId}: ${layer.startTime}-${layer.endTime}`
			);
		}
		if (!Number.isFinite(layer.x) || !Number.isFinite(layer.y)) {
			throw new Error(
				`Invalid text raster position for ${layer.elementId}: ${layer.x},${layer.y}`
			);
		}

		if (layer.source.kind === "image-sequence") {
			if (
				!Number.isFinite(layer.source.frameRate) ||
				layer.source.frameRate <= 0
			) {
				throw new Error(
					`Invalid text raster frame rate for ${layer.elementId}: ${layer.source.frameRate}`
				);
			}
			const firstFramePath = imageSequenceFirstFramePath({
				pattern: layer.source.path,
			});
			if (!fs.existsSync(firstFramePath)) {
				throw new Error(
					`Text raster image sequence not found: ${firstFramePath}`
				);
			}
			args.push(
				"-framerate",
				String(layer.source.frameRate),
				"-start_number",
				"0",
				"-i",
				layer.source.path
			);
		} else {
			if (!fs.existsSync(layer.source.path)) {
				throw new Error(`Text raster video not found: ${layer.source.path}`);
			}
			args.push("-i", layer.source.path);
		}

		return {
			...layer,
			inputIndex: startInputIndex + sourceIndex,
			sourceIndex,
		};
	});
}

export function buildTextRasterVisualFilters({
	layers,
	fps,
}: {
	layers: readonly ResolvedTextRasterLayer[];
	fps: number;
}): TextRasterVisualFilters {
	const filterSteps: string[] = [];
	const preparedLayers: PreparedVisualLayer[] = [];

	for (const [index, layer] of layers.entries()) {
		const preparedLabel = `visual_text_raster_${index}`;
		const visibleDuration = Number(
			(layer.endTime - layer.startTime).toFixed(6)
		);
		filterSteps.push(
			`[${layer.inputIndex}:v]fps=${fps},setsar=1,format=rgba,` +
				`trim=duration=${visibleDuration},settb=AVTB,` +
				`setpts=PTS-STARTPTS+${layer.startTime}/TB[${preparedLabel}]`
		);
		preparedLayers.push({
			inputLabel: preparedLabel,
			kind: "text",
			trackOrder: layer.trackOrder,
			elementOrder: layer.elementOrder,
			sourceOrder: layer.sourceIndex,
			legacyOrder: 4,
			blendMode: layer.blendMode,
			startTime: layer.startTime,
			endTime: layer.endTime,
			x: layer.x,
			y: layer.y,
		});
	}

	return { filterSteps, preparedLayers };
}

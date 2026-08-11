import {
	appendTextRasterInputs,
	buildTextRasterVisualFilters,
} from "../../../ffmpeg/text-raster-input.js";
import type { TextRasterLayer } from "../../../ffmpeg/types.js";
import { composePreparedVisualLayers } from "../../../ffmpeg/visual-layer-compositor.js";
import type { ResolvedExportSettings } from "./types.js";
import { parseBitrateForKbps } from "./utils.js";

export function buildTextRasterOverlayPassArgs({
	sourcePath,
	outputPath,
	layers,
	settings,
}: {
	sourcePath: string;
	outputPath: string;
	layers: readonly TextRasterLayer[];
	settings: ResolvedExportSettings;
}): string[] {
	if (layers.length === 0) {
		throw new Error("Text raster overlay pass requires at least one layer.");
	}
	const args = ["-y", "-i", sourcePath];
	const resolvedLayers = appendTextRasterInputs({
		args,
		layers,
		startInputIndex: 1,
	});
	const rasterVisuals = buildTextRasterVisualFilters({
		layers: resolvedLayers,
		fps: settings.fps,
	});
	const baseLabel = "text_raster_base";
	const composed = composePreparedVisualLayers({
		baseLabel,
		layers: rasterVisuals.preparedLayers,
		labelPrefix: "text_raster",
		canvasWidth: settings.width,
		canvasHeight: settings.height,
	});
	const filterSteps = [
		`[0:v]settb=AVTB,setpts=PTS-STARTPTS[${baseLabel}]`,
		...rasterVisuals.filterSteps,
		...composed.filterSteps,
	];
	args.push(
		"-filter_complex",
		filterSteps.join(";"),
		"-map",
		`[${composed.outputLabel}]`,
		"-map",
		"0:a?",
		"-c:v",
		settings.codec,
		"-preset",
		"medium",
		"-b:v",
		parseBitrateForKbps({ bitrate: settings.bitrate }),
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"copy",
		"-movflags",
		"+faststart",
		outputPath
	);
	return args;
}

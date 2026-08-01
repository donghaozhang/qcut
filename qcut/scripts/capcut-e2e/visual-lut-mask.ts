import type { ImageGeometry } from "./visual-alpha.js";
import {
	compareRgbBuffers,
	DEFAULT_VISUAL_RMSE_THRESHOLD,
	type RgbErrorMetrics,
} from "./visual-metrics.js";

export interface LutMaskProbeDefinition {
	id: "center" | "inside-right" | "outside-right" | "outside-corner";
	region: "inside" | "outside";
	x: number;
	y: number;
}

export interface LutMaskProbeResult {
	candidateRgba: readonly [number, number, number, number];
	expectedRgba: readonly [number, number, number, number];
	id: LutMaskProbeDefinition["id"];
	pass: boolean;
	pixel: { x: number; y: number };
	region: LutMaskProbeDefinition["region"];
	rgbMetrics: RgbErrorMetrics | null;
	rule: "inside-rgb-rmse" | "outside-transparent-or-black";
}

export interface LutMaskProbeComparison {
	candidateGeometry: ImageGeometry;
	dimensionsMatch: boolean;
	expectedGeometry: ImageGeometry;
	pass: boolean;
	probes: LutMaskProbeResult[];
	rmseThreshold: number;
}

export const LUT_MASK_PROBES: readonly LutMaskProbeDefinition[] = [
	{ id: "center", region: "inside", x: 0.5, y: 0.5 },
	{ id: "inside-right", region: "inside", x: 0.75, y: 0.5 },
	{ id: "outside-right", region: "outside", x: 0.9, y: 0.5 },
	{ id: "outside-corner", region: "outside", x: 0.05, y: 0.05 },
];

export function buildLutMaskExpectedArgs({
	outputPath,
	sourcePath,
}: {
	outputPath: string;
	sourcePath: string;
}): string[] {
	const ellipseAlpha =
		"if(lte(pow((X-W/2)/(W*0.325),2)+pow((Y-H/2)/(H*0.325),2),1),255,0)";
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		sourcePath,
		"-vf",
		`format=rgba,lutrgb=r=negval:g=negval:b=negval,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${ellipseAlpha}'`,
		"-frames:v",
		"1",
		"-c:v",
		"png",
		"-pix_fmt",
		"rgba",
		"-compression_level",
		"9",
		"-threads",
		"1",
		"-y",
		outputPath,
	];
}

function validateRgba({
	geometry,
	label,
	pixels,
}: {
	geometry: ImageGeometry;
	label: string;
	pixels: Uint8Array;
}): void {
	if (pixels.length !== geometry.width * geometry.height * 4) {
		throw new Error(`${label} RGBA buffer does not match its geometry.`);
	}
}

function readRgbaPixel({
	geometry,
	pixels,
	x,
	y,
}: {
	geometry: ImageGeometry;
	pixels: Uint8Array;
	x: number;
	y: number;
}): readonly [number, number, number, number] {
	const offset = (y * geometry.width + x) * 4;
	return [
		pixels[offset] ?? 0,
		pixels[offset + 1] ?? 0,
		pixels[offset + 2] ?? 0,
		pixels[offset + 3] ?? 0,
	];
}

function compareProbe({
	candidateRgba,
	definition,
	expectedRgba,
	geometry,
	rmseThreshold,
}: {
	candidateRgba: readonly [number, number, number, number];
	definition: LutMaskProbeDefinition;
	expectedRgba: readonly [number, number, number, number];
	geometry: ImageGeometry;
	rmseThreshold: number;
}): LutMaskProbeResult {
	const pixel = {
		x: Math.round(definition.x * (geometry.width - 1)),
		y: Math.round(definition.y * (geometry.height - 1)),
	};
	if (definition.region === "outside") {
		const isTransparent = candidateRgba[3] <= rmseThreshold;
		const isBlack = Math.max(...candidateRgba.slice(0, 3)) <= rmseThreshold;
		return {
			candidateRgba,
			expectedRgba,
			id: definition.id,
			pass: expectedRgba[3] === 0 && (isTransparent || isBlack),
			pixel,
			region: definition.region,
			rgbMetrics: null,
			rule: "outside-transparent-or-black",
		};
	}
	const comparison = compareRgbBuffers({
		actual: Uint8Array.from(candidateRgba.slice(0, 3)),
		expected: Uint8Array.from(expectedRgba.slice(0, 3)),
		rmseThreshold,
	});
	return {
		candidateRgba,
		expectedRgba,
		id: definition.id,
		pass: expectedRgba[3] > 0 && candidateRgba[3] > 0 && comparison.pass,
		pixel,
		region: definition.region,
		rgbMetrics: comparison.metrics,
		rule: "inside-rgb-rmse",
	};
}

export function compareLutMaskProbes({
	candidateGeometry,
	candidatePixels,
	expectedGeometry,
	expectedPixels,
	rmseThreshold = DEFAULT_VISUAL_RMSE_THRESHOLD,
}: {
	candidateGeometry: ImageGeometry;
	candidatePixels: Uint8Array;
	expectedGeometry: ImageGeometry;
	expectedPixels: Uint8Array;
	rmseThreshold?: number;
}): LutMaskProbeComparison {
	validateRgba({
		geometry: expectedGeometry,
		label: "Expected LUT/mask",
		pixels: expectedPixels,
	});
	validateRgba({
		geometry: candidateGeometry,
		label: "Captured LUT/mask",
		pixels: candidatePixels,
	});
	const dimensionsMatch =
		expectedGeometry.width === candidateGeometry.width &&
		expectedGeometry.height === candidateGeometry.height;
	const probes = LUT_MASK_PROBES.map((definition) => {
		const x = Math.round(definition.x * (expectedGeometry.width - 1));
		const y = Math.round(definition.y * (expectedGeometry.height - 1));
		return compareProbe({
			candidateRgba: readRgbaPixel({
				geometry: candidateGeometry,
				pixels: candidatePixels,
				x,
				y,
			}),
			definition,
			expectedRgba: readRgbaPixel({
				geometry: expectedGeometry,
				pixels: expectedPixels,
				x,
				y,
			}),
			geometry: expectedGeometry,
			rmseThreshold,
		});
	});
	return {
		candidateGeometry,
		dimensionsMatch,
		expectedGeometry,
		pass: dimensionsMatch && probes.every(({ pass }) => pass),
		probes,
		rmseThreshold,
	};
}

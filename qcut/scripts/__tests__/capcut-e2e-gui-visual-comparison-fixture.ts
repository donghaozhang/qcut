import { CAPCUT_E2E_FIXTURE_SPEC } from "../capcut-e2e/spec.js";
import {
	compareLutMaskProbes,
	LUT_MASK_PROBES,
} from "../capcut-e2e/visual-lut-mask.js";

export function buildFixtureDissolveComparison() {
	const { height, width } = CAPCUT_E2E_FIXTURE_SPEC;
	const comparisonRoi =
		CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration.comparisonRoi;
	const pixelCount = comparisonRoi.width * comparisonRoi.height;
	return {
		actualGeometry: { height, width },
		dimensionsMatch: true,
		expectedGeometry: { height, width },
		metrics: {
			channelSampleCount: pixelCount * 3,
			mae: 0,
			max: 0,
			p95: 0,
			pixelCount,
			rmse: 0,
		},
		pass: true,
		rmseThreshold: 8 as const,
	};
}

export function buildForgedLutMaskComparison() {
	const geometry = {
		height: CAPCUT_E2E_FIXTURE_SPEC.height,
		width: CAPCUT_E2E_FIXTURE_SPEC.width,
	};
	const pixels = new Uint8Array(geometry.width * geometry.height * 4);
	for (const definition of LUT_MASK_PROBES) {
		const x = Math.round(definition.x * (geometry.width - 1));
		const y = Math.round(definition.y * (geometry.height - 1));
		pixels.set(
			definition.region === "inside" ? [200, 150, 100, 255] : [0, 0, 0, 0],
			(y * geometry.width + x) * 4
		);
	}
	return compareLutMaskProbes({
		candidateGeometry: geometry,
		candidatePixels: pixels.slice(),
		expectedGeometry: geometry,
		expectedPixels: pixels,
	});
}

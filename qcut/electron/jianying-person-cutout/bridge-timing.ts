const TIMING_PREFIX = "qcut-person-cutout-timing ";

export interface PersonCutoutBridgeTiming {
	alphaResizeMicros: number;
	cacheWriteMicros: number;
	frameCount: number;
	gruInferenceMicros: number;
	inputReadMicros: number;
	nativeCanaryFrames: number;
	nativeCanaryMicros: number;
	outputFlushMicros: number;
	postprocessMicros: number;
	processingMicros: number;
	rgbaToBgrMicros: number;
	setupMicros: number;
	teardownMicros: number;
	totalMicros: number;
	visionInferenceMicros: number;
	wallMicros: number;
}

const TIMING_FIELDS = {
	alphaResizeMicros: "alpha_resize_us",
	cacheWriteMicros: "cache_write_us",
	frameCount: "frames",
	gruInferenceMicros: "gru_infer_us",
	inputReadMicros: "input_read_us",
	postprocessMicros: "postprocess_us",
	processingMicros: "processing_us",
	rgbaToBgrMicros: "rgba_to_bgr_us",
	setupMicros: "setup_us",
	totalMicros: "total_us",
	visionInferenceMicros: "vision_infer_us",
} as const;

function readCompatibleTimingField({
	fallbackField,
	field,
	value,
}: {
	fallbackField?: string;
	field: string;
	value: Record<string, unknown>;
}) {
	return (
		readNonNegativeInteger({ field, value }) ??
		(fallbackField
			? readNonNegativeInteger({ field: fallbackField, value })
			: null)
	);
}

function readNonNegativeInteger({
	field,
	value,
}: {
	field: string;
	value: Record<string, unknown>;
}) {
	const candidate = value[field];
	return typeof candidate === "number" &&
		Number.isSafeInteger(candidate) &&
		candidate >= 0
		? candidate
		: null;
}

export function parsePersonCutoutBridgeTiming({
	line,
}: {
	line: string;
}): PersonCutoutBridgeTiming | null {
	if (!line.startsWith(TIMING_PREFIX)) return null;
	try {
		const parsed: unknown = JSON.parse(line.slice(TIMING_PREFIX.length));
		if (!parsed || typeof parsed !== "object") return null;
		const value = parsed as Record<string, unknown>;
		if (value.schema !== 1) return null;
		const entries = Object.entries(TIMING_FIELDS).map(
			([key, field]) => [key, readNonNegativeInteger({ field, value })] as const
		);
		if (entries.some(([, fieldValue]) => fieldValue === null)) return null;
		const requiredTiming = Object.fromEntries(entries) as Omit<
			PersonCutoutBridgeTiming,
			| "nativeCanaryFrames"
			| "nativeCanaryMicros"
			| "outputFlushMicros"
			| "teardownMicros"
			| "wallMicros"
		>;
		const nativeCanaryFrames = readCompatibleTimingField({
			fallbackField: "native_validation_frames",
			field: "native_canary_frames",
			value,
		});
		const nativeCanaryMicros = readCompatibleTimingField({
			fallbackField: "native_validation_us",
			field: "native_canary_us",
			value,
		});
		if (nativeCanaryFrames === null || nativeCanaryMicros === null) return null;
		const timing: PersonCutoutBridgeTiming = {
			...requiredTiming,
			nativeCanaryFrames,
			nativeCanaryMicros,
			outputFlushMicros:
				readNonNegativeInteger({ field: "output_flush_us", value }) ?? 0,
			teardownMicros:
				readNonNegativeInteger({ field: "teardown_us", value }) ?? 0,
			wallMicros:
				readNonNegativeInteger({ field: "wall_us", value }) ??
				requiredTiming.totalMicros,
		};
		return timing.frameCount > 0 &&
			timing.processingMicros <= timing.totalMicros &&
			timing.totalMicros <= timing.wallMicros
			? timing
			: null;
	} catch {
		return null;
	}
}

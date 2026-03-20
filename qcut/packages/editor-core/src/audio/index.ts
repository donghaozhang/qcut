export type {
	Beat,
	BeatDetectionConfig,
	BeatDetectionResult,
	ResolvedBeatDetectionConfig,
} from "./beat-types.js";

export { analyzeFromSamples, resolveConfig } from "./beat-detection-engine.js";

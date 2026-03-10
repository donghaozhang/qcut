/**
 * AutoClip — Subtitle-based video clip extraction pipeline.
 *
 * @module electron/native-pipeline/autoclip
 */

export { runAutoclip, parseAutoclipOptions } from "./autoclip-runner.js";
export type { AutoclipOptions } from "./autoclip-runner.js";
export {
	parseSrt,
	parseVtt,
	parseSubtitleFile,
	chunkByInterval,
} from "./srt-parser.js";
export type { SrtEntry, SrtChunk } from "./srt-parser.js";
export type { OutlineTopic } from "./steps/step-outline.js";
export type { TimelineSegment } from "./steps/step-timeline.js";
export type { ScoredSegment } from "./steps/step-scoring.js";
export type { CutResult } from "./steps/step-cut.js";

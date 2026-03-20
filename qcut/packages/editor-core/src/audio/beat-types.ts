// Adapted from OpenReel Video (MIT License)

/**
 * Beat detection types — platform-agnostic, no browser dependencies.
 *
 * @module @qcut/editor-core/audio/beat-types
 */

/** A single detected beat */
export interface Beat {
	/** Time in seconds */
	timestamp: number;
	/** Beat strength (0-1) */
	strength: number;
	/** Sequential index in the beat array */
	index: number;
	/** Whether this is a downbeat (first beat of a measure) */
	isDownbeat: boolean;
}

/** Configuration for the beat detection algorithm */
export interface BeatDetectionConfig {
	/** Window size in samples for RMS calculation (default: 1024) */
	windowSize?: number;
	/** Smoothing factor for energy envelope (0-1, default: 0.8) */
	smoothingFactor?: number;
	/** Threshold multiplier for peak detection (default: 1.5) */
	thresholdMultiplier?: number;
	/** Minimum time between beats in seconds (default: 0.2) */
	minBeatInterval?: number;
	/** Beats per measure for downbeat detection (default: 4) */
	beatsPerMeasure?: number;
}

/** Result of beat detection analysis */
export interface BeatDetectionResult {
	/** Detected BPM (beats per minute) */
	bpm: number;
	/** Confidence score (0-1) */
	confidence: number;
	/** All detected beats */
	beats: Beat[];
	/** Downbeat timestamps (every Nth beat based on beatsPerMeasure) */
	downbeats: number[];
	/** Total audio duration in seconds */
	duration: number;
}

/** Resolved config with all defaults applied */
export interface ResolvedBeatDetectionConfig {
	windowSize: number;
	smoothingFactor: number;
	thresholdMultiplier: number;
	minBeatInterval: number;
	beatsPerMeasure: number;
}

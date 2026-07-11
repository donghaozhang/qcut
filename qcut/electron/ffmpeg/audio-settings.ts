export type AudioKeyframeProperty =
	| "volumeDb"
	| "fadeIn"
	| "fadeOut"
	| "pan"
	| "denoiseAmount"
	| "voiceClarity"
	| "voiceWarmth"
	| "voicePresence"
	| "pitchSemitones"
	| "eqLowGainDb"
	| "eqMidGainDb"
	| "eqHighGainDb"
	| "compressorThresholdDb"
	| "compressorRatio"
	| "reverbMix"
	| "echoMix";

export interface AudioPropertyKeyframe {
	id: string;
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export interface AudioSettings {
	enabled: boolean;
	volumeDb: number;
	fadeIn: number;
	fadeOut: number;
	panEnabled: boolean;
	pan: number;
	loudness: {
		enabled: boolean;
		targetLufs: number;
		truePeakDb: number;
		loudnessRange: number;
		measuredLufs?: number;
		measuredTruePeakDb?: number;
	};
	denoise: {
		enabled: boolean;
		amount: number;
		noiseFloorDb: number;
		mode?: "realtime" | "ai";
		status?: "idle" | "processing" | "ready" | "error";
		processedMediaId?: string;
		error?: string;
	};
	voiceEnhance: {
		enabled: boolean;
		clarity: number;
		warmth: number;
		presence: number;
	};
	pitch: { enabled: boolean; semitones: number; preserveFormants: boolean };
	equalizer: {
		enabled: boolean;
		lowGainDb: number;
		midGainDb: number;
		highGainDb: number;
	};
	compressor: {
		enabled: boolean;
		thresholdDb: number;
		ratio: number;
		attackMs: number;
		releaseMs: number;
		makeupGainDb: number;
	};
	limiter: { enabled: boolean; ceilingDb: number; releaseMs: number };
	reverb: { enabled: boolean; mix: number; roomSize: number; damping: number };
	echo: { enabled: boolean; mix: number; delayMs: number; feedback: number };
	telephone: { enabled: boolean; mix: number };
	keyframes?: Partial<Record<AudioKeyframeProperty, AudioPropertyKeyframe[]>>;
}

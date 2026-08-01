export const CAPCUT_E2E_FIXTURE_SPEC = {
	audio: {
		channels: 1,
		clipAFrequencyHz: 440,
		clipBFrequencyHz: 660,
		sampleRateHz: 48_000,
	},
	clipDurationSeconds: 3,
	cjkProofText: "剪映真实导入测试",
	fileNames: {
		calibrationOrdinalAdjacent: "calibration-ordinal-n046.png",
		calibrationOrdinalReference: "calibration-ordinal-n045.png",
		calibrationRoiAAdjacent: "calibration-roi-a-n046.png",
		calibrationRoiAEnd: "calibration-roi-a-n089.png",
		calibrationRoiAReference: "calibration-roi-a-n045.png",
		calibrationRoiASeam: "calibration-roi-a-n083.png",
		calibrationRoiAStart: "calibration-roi-a-n000.png",
		calibrationRoiBAdjacent: "calibration-roi-b-n136.png",
		calibrationRoiBEnd: "calibration-roi-b-n179.png",
		calibrationRoiBReference: "calibration-roi-b-n135.png",
		calibrationRoiBSeam: "calibration-roi-b-n097.png",
		calibrationRoiBStart: "calibration-roi-b-n090.png",
		cjkProof: "cjk-font-proof.png",
		manifest: "manifest.json",
		sourceAudio: "source-audio.wav",
		sourceFrameA: "source-frame-a.png",
		sourceFrameB: "source-frame-b.png",
		sourceVideo: "source-video.mp4",
	},
	fps: 30,
	height: 720,
	labels: {
		clipA: "CLIP A",
		clipB: "CLIP B",
		ordinal: "GLOBAL FRAME",
		safety: "SOURCE PIXELS ARE ASCII ONLY",
		title: "SOURCE VIDEO",
	},
	plateMode: "frozen-first-frame",
	patterns: {
		clipA: "testsrc2",
		clipB: "smptebars",
	},
	schemaVersion: 2,
	sourceFrameCalibration: {
		comparisonRoi: { height: 624, width: 1280, x: 0, y: 96 },
		invarianceSamples: {
			clipAFrameIndices: [0, 45, 46, 83, 89],
			clipBFrameIndices: [90, 97, 135, 136, 179],
			method: "ffmpeg-crop-png-sha256",
			ordinalFrameIndices: [45, 46],
		},
		method: "ffmpeg-select-zero-based-frame-index",
		ordinalStrip: { height: 96, width: 1280, x: 0, y: 0 },
		sourceFrameAIndex: 45,
		sourceFrameATimestampMicroseconds: 1_500_000,
		sourceFrameBIndex: 135,
		sourceFrameBTimestampMicroseconds: 4_500_000,
	},
	width: 1280,
} as const;

export type CapCutE2eFixtureSpec = typeof CAPCUT_E2E_FIXTURE_SPEC;

export function getAsciiFixtureText({
	spec = CAPCUT_E2E_FIXTURE_SPEC,
}: {
	spec?: CapCutE2eFixtureSpec;
} = {}): string {
	return Object.values(spec.labels).join(" ");
}

export function assertAsciiOnly({
	label,
	value,
}: {
	label: string;
	value: string;
}): void {
	if (!/^[\x20-\x7e]+$/.test(value)) {
		throw new Error(`${label} must contain printable ASCII only.`);
	}
}

export function validateFixtureSpec({
	spec = CAPCUT_E2E_FIXTURE_SPEC,
}: {
	spec?: CapCutE2eFixtureSpec;
} = {}): void {
	if (spec.schemaVersion !== 2) {
		throw new Error(`Unsupported fixture schema: ${spec.schemaVersion}`);
	}
	if (
		spec.width <= 0 ||
		spec.height <= 0 ||
		spec.fps <= 0 ||
		spec.clipDurationSeconds <= 0
	) {
		throw new Error(
			"Fixture dimensions, frame rate, and duration must be positive."
		);
	}
	if (
		spec.audio.channels !== 1 ||
		spec.audio.sampleRateHz !== 48_000 ||
		spec.audio.clipAFrequencyHz !== 440 ||
		spec.audio.clipBFrequencyHz !== 660
	) {
		throw new Error("Fixture audio must be mono 48 kHz with 440/660 Hz clips.");
	}
	if (
		spec.patterns.clipA !== "testsrc2" ||
		spec.patterns.clipB !== "smptebars"
	) {
		throw new Error(
			"Fixture video must use the locked testsrc2/SMPTE patterns."
		);
	}
	if (spec.plateMode !== "frozen-first-frame") {
		throw new Error("Fixture comparison plates must be temporally invariant.");
	}
	const calibration = spec.sourceFrameCalibration;
	const frameDurationMicroseconds = 1_000_000 / spec.fps;
	if (
		calibration.method !== "ffmpeg-select-zero-based-frame-index" ||
		calibration.sourceFrameAIndex !== 45 ||
		calibration.sourceFrameBIndex !== 135 ||
		calibration.sourceFrameATimestampMicroseconds !==
			calibration.sourceFrameAIndex * frameDurationMicroseconds ||
		calibration.sourceFrameBTimestampMicroseconds !==
			calibration.sourceFrameBIndex * frameDurationMicroseconds
	) {
		throw new Error(
			"Fixture source-frame calibration is not locked to 45/135."
		);
	}
	const { comparisonRoi, ordinalStrip } = calibration;
	if (
		ordinalStrip.x !== 0 ||
		ordinalStrip.y !== 0 ||
		ordinalStrip.width !== spec.width ||
		ordinalStrip.height <= 0 ||
		comparisonRoi.x !== 0 ||
		comparisonRoi.y !== ordinalStrip.height ||
		comparisonRoi.width !== spec.width ||
		comparisonRoi.height !== spec.height - ordinalStrip.height
	) {
		throw new Error(
			"Fixture comparison ROI must exactly exclude the ordinal strip."
		);
	}
	const samples = calibration.invarianceSamples;
	if (
		samples.method !== "ffmpeg-crop-png-sha256" ||
		JSON.stringify(samples.clipAFrameIndices) !==
			JSON.stringify([0, 45, 46, 83, 89]) ||
		JSON.stringify(samples.clipBFrameIndices) !==
			JSON.stringify([90, 97, 135, 136, 179]) ||
		samples.ordinalFrameIndices[0] !== calibration.sourceFrameAIndex ||
		samples.ordinalFrameIndices[1] !== calibration.sourceFrameAIndex + 1
	) {
		throw new Error(
			"Fixture invariance samples must use adjacent locked frames."
		);
	}
	for (const [key, value] of Object.entries(spec.labels)) {
		assertAsciiOnly({ label: `Fixture label ${key}`, value });
	}
	if (spec.cjkProofText !== "剪映真实导入测试") {
		throw new Error("The CJK proof text must cover the regression phrase.");
	}
}

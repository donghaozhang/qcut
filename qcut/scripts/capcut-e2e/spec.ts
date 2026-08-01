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
		safety: "SOURCE PIXELS ARE ASCII ONLY",
		title: "SOURCE VIDEO",
	},
	patterns: {
		clipA: "testsrc2",
		clipB: "smptebars",
	},
	schemaVersion: 1,
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
	if (spec.schemaVersion !== 1) {
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
	for (const [key, value] of Object.entries(spec.labels)) {
		assertAsciiOnly({ label: `Fixture label ${key}`, value });
	}
	if (spec.cjkProofText !== "剪映真实导入测试") {
		throw new Error("The CJK proof text must cover the regression phrase.");
	}
}

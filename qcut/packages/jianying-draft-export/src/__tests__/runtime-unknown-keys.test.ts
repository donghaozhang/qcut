import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	MediaAudioSettings,
	MediaColorSettings,
	SubtitleStyle,
	TimelineTrackAudioSettings,
} from "@qcut/editor-core";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { afterEach, describe, expect, it } from "vitest";
import {
	StandaloneJianyingDraftExportSession,
	StandaloneJianyingDraftRequestValidationError,
} from "../index.js";

const temporaryDirectories: string[] = [];
const TRUSTED_FFPROBE_PATH = "/trusted/qcut/ffprobe-8";

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-runtime-keys-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createAudioBusEffects() {
	return {
		compressor: {
			attackMs: 10,
			enabled: false,
			makeupGainDb: 0,
			ratio: 3,
			releaseMs: 120,
			thresholdDb: -18,
		},
		limiter: { ceilingDb: -1, enabled: false, releaseMs: 50 },
		parametricEqualizer: {
			bands: [
				{
					enabled: true,
					frequencyHz: 120,
					gainDb: 0,
					id: "low",
					q: 0.7,
					type: "low-shelf" as const,
				},
			],
			enabled: false,
			highCutHz: 20_000,
			lowCutHz: 20,
		},
	};
}

function createTrackAudio(): TimelineTrackAudioSettings {
	return {
		autoCrossfade: {
			curve: "equal-power",
			defaultDuration: 0.5,
			enabled: false,
		},
		busId: "master",
		ducking: {
			attackMs: 80,
			enabled: false,
			reductionDb: -12,
			releaseMs: 350,
			sourceTrackIds: [],
			thresholdDb: -30,
		},
		effects: createAudioBusEffects(),
		gainDb: 0,
		pan: 0,
		solo: false,
	};
}

function createMediaAudio(): MediaAudioSettings {
	return {
		channelMode: "stereo",
		compressor: createAudioBusEffects().compressor,
		cover: { enabled: false, status: "idle" },
		denoise: {
			amount: 0,
			enabled: false,
			mode: "realtime",
			noiseFloorDb: -50,
			status: "idle",
		},
		echo: {
			delayMs: 220,
			enabled: false,
			feedback: 25,
			mix: 15,
		},
		enabled: true,
		equalizer: {
			enabled: false,
			highGainDb: 0,
			lowGainDb: 0,
			midGainDb: 0,
		},
		fadeIn: 0,
		fadeOut: 0,
		keyframes: {
			volumeDb: [
				{
					easing: "linear",
					frame: 0,
					id: "audio-keyframe",
					value: 0,
				},
			],
		},
		limiter: createAudioBusEffects().limiter,
		loudness: {
			analysisStatus: "idle",
			enabled: false,
			loudnessRange: 11,
			targetLufs: -16,
			truePeakDb: -1.5,
		},
		lyrics: {
			speakerNames: { speaker: "Narrator" },
			status: "idle",
			text: "",
			words: [],
		},
		pan: 0,
		panEnabled: false,
		parametricEqualizer: createAudioBusEffects().parametricEqualizer,
		pitch: {
			enabled: false,
			preserveFormants: true,
			semitones: 0,
		},
		repair: {
			deClick: { amount: 25, enabled: false },
			deClip: { amount: 30, enabled: false },
			deEsser: { amount: 35, enabled: false, frequencyHz: 6500 },
			deHum: { enabled: false, frequencyHz: 50, harmonics: 4 },
			dePlosive: { amount: 35, enabled: false },
			deReverb: { amount: 30, enabled: false },
			noiseGate: {
				attackMs: 5,
				enabled: false,
				releaseMs: 120,
				thresholdDb: -42,
			},
		},
		reverb: {
			damping: 50,
			enabled: false,
			mix: 20,
			roomSize: 40,
		},
		separation: {
			enabled: false,
			status: "idle",
			stemGains: { vocals: 0 },
			stemMediaIds: { vocals: "stem-vocals" },
		},
		telephone: { enabled: false, mix: 100 },
		voiceConversion: {
			enabled: false,
			sourceStem: "vocals",
			status: "idle",
		},
		voiceEnhance: {
			clarity: 0,
			enabled: false,
			presence: 0,
			warmth: 0,
		},
		volumeDb: 0,
	};
}

function createSecondaryCurve() {
	return { points: [], samples: [] };
}

function createMediaColor(): MediaColorSettings {
	const range = { hue: 0, luminance: 0, saturation: 0 };
	const wheel = { luminance: 0, x: 0, y: 0 };
	return {
		basic: {
			blacks: 0,
			brightness: 0,
			contrast: 0,
			enabled: true,
			exposure: 0,
			fade: 0,
			grain: 0,
			highlights: 0,
			saturation: 0,
			shadows: 0,
			sharpness: 0,
			temperature: 0,
			tint: 0,
			vibrance: 0,
			vignette: 0,
			whites: 0,
		},
		curveShapeKeyframes: {},
		curves: {
			blue: [],
			enabled: false,
			green: [],
			master: [],
			mix: 100,
			red: [],
		},
		enabled: true,
		filter: { intensity: 100, presetId: "none", presetVersion: 1 },
		hsl: {
			enabled: false,
			ranges: {
				blue: { ...range },
				cyan: { ...range },
				green: { ...range },
				magenta: { ...range },
				orange: { ...range },
				purple: { ...range },
				red: { ...range },
				yellow: { ...range },
			},
		},
		keyframes: {
			"basic.exposure": [
				{
					easing: "linear",
					frame: 0,
					id: "color-keyframe",
					value: 0,
				},
			],
		},
		lut: {
			enabled: false,
			intensity: 100,
			name: "None",
			presetId: "none",
			skinProtection: 0,
		},
		management: {
			enabled: false,
			inputSpace: "auto",
			outputSpace: "rec709",
			peakNits: 100,
			toneMapping: "aces",
			workingSpace: "rec709-linear",
		},
		mask: { enabled: false, invert: false, maskIds: [] },
		secondaryCurves: {
			enabled: false,
			hueVsHue: createSecondaryCurve(),
			hueVsLuminance: createSecondaryCurve(),
			hueVsSaturation: createSecondaryCurve(),
			luminanceVsSaturation: createSecondaryCurve(),
			mix: 100,
			saturationVsSaturation: createSecondaryCurve(),
		},
		smart: {
			autoTone: true,
			autoWhiteBalance: true,
			enabled: false,
			intensity: 100,
			status: "idle",
		},
		wheels: {
			balance: 0,
			enabled: false,
			highlights: { ...wheel },
			midtones: { ...wheel },
			mode: "tonal",
			offset: { ...wheel },
			shadows: { ...wheel },
			strength: 100,
		},
	};
}

function createSubtitleStyle(): SubtitleStyle {
	return {
		animationDelay: 0,
		animationDuration: 0.3,
		animationType: "none",
		backgroundColor: "#000000",
		bgOpacity: 0,
		bold: false,
		fontColor: "#ffffff",
		fontFamily: "Arial",
		fontOpacity: 1,
		fontSize: 48,
		italic: false,
		letterSpacing: 0,
		lineSpacing: 1,
		outlineColor: "#000000",
		outlineWidth: 0,
		position: { align: "bottom", x: 0, y: 90 },
		shadowColor: "#000000",
		shadowOffset: { x: 0, y: 0 },
		textAlign: "center",
		underline: false,
	};
}

function createNormalizedSnapshot({
	sourcePath,
}: {
	sourcePath: string;
}): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				height: 720,
				id: "image",
				name: "proof.png",
				sourcePath,
				type: "image",
				width: 1280,
			},
		],
		project: {
			audioMix: {
				buses: [],
				master: {
					effects: createAudioBusEffects(),
					gainDb: 0,
					id: "master",
					muted: false,
					name: "Master",
					pan: 0,
					solo: false,
				},
			},
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 720,
			id: "project",
			name: "Normalized renderer snapshot",
			sceneId: "scene",
			width: 1280,
		},
		schemaVersion: 1,
		timelineDurationByElementId: { caption: 2, media: 2, text: 2 },
		tracks: [
			{
				audio: createTrackAudio(),
				audioCrossfades: [],
				elements: [
					{
						audio: createMediaAudio(),
						audioDenoise: 0,
						audioFadeIn: 0,
						audioFadeOut: 0,
						audioNormalize: false,
						audioPan: 0,
						chromaKey: {
							blend: 0,
							cleanup: 0,
							color: "#00ff00",
							enabled: false,
							keyframes: {},
							shadow: 0,
							similarity: 0,
							spill: 0,
						},
						color: createMediaColor(),
						crop: { bottom: 0, left: 0, right: 0, top: 0 },
						customCutout: {
							applyStrokes: false,
							enabled: false,
							status: "idle",
							strokes: [],
						},
						duration: 2,
						enhancements: {
							beauty: 0,
							clarity: 0,
							denoise: 0,
							relight: 0,
							stabilization: 0,
							upscale: 1,
						},
						fitMode: "cover",
						flipHorizontal: false,
						flipVertical: false,
						freezeFrameDuration: 0,
						id: "media",
						keyframes: {},
						maintainAspectRatio: true,
						mask: {
							centerX: 0.5,
							centerY: 0.5,
							enabled: false,
							feather: 0,
							height: 1,
							invert: false,
							rotation: 0,
							type: "none",
							width: 1,
						},
						masks: [],
						mediaId: "image",
						name: "proof.png",
						opacity: 1,
						perspective: {
							bottomLeftX: 0,
							bottomLeftY: 1,
							bottomRightX: 1,
							bottomRightY: 1,
							topLeftX: 0,
							topLeftY: 0,
							topRightX: 1,
							topRightY: 0,
						},
						playbackRate: 1,
						reverse: false,
						rotation: 0,
						scaleX: 1,
						scaleY: 1,
						startTime: 0,
						trimEnd: 0,
						trimStart: 0,
						type: "media",
						x: 0,
						y: 0,
					},
				],
				id: "media-track",
				isMain: true,
				name: "Main",
				order: 0,
				transitions: [],
				type: "media",
			},
			{
				elements: [
					{
						backgroundColor: "transparent",
						color: "#ffffff",
						content: "QCut",
						duration: 2,
						fontFamily: "Arial",
						fontSize: 64,
						fontStyle: "normal",
						fontWeight: "normal",
						id: "text",
						name: "Title",
						opacity: 1,
						rotation: 0,
						startTime: 0,
						textAlign: "center",
						textDecoration: "none",
						trimEnd: 0,
						trimStart: 0,
						type: "text",
						x: 0,
						y: 0,
					},
				],
				id: "text-track",
				name: "Text",
				type: "text",
			},
			{
				elements: [
					{
						duration: 2,
						id: "caption",
						language: "en",
						name: "Caption",
						source: "manual",
						startTime: 0,
						style: createSubtitleStyle(),
						text: "Real plan input",
						trimEnd: 0,
						trimStart: 0,
						type: "captions",
					},
				],
				id: "caption-track",
				name: "Captions",
				type: "captions",
			},
		],
	};
}

async function expectUnknownKeyRejection({
	expectedPath,
	mutate,
	outputParentDirectory,
	snapshot,
}: {
	expectedPath: string;
	mutate: (snapshot: QCutDraftExportSnapshotV1) => void;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
}): Promise<void> {
	const malformed = structuredClone(snapshot);
	mutate(malformed);
	const session = new StandaloneJianyingDraftExportSession({
		ffprobePath: TRUSTED_FFPROBE_PATH,
	});
	await expect(
		session.plan({
			input: {
				draftName: "Unknown key",
				outputParentDirectory,
				snapshot: malformed,
				targetPlatform: "macos",
			},
		})
	).rejects.toMatchObject({
		issues: [{ path: expectedPath }],
		name: "StandaloneJianyingDraftRequestValidationError",
	});
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("snapshot runtime property allowlists", () => {
	it("accepts a normalized renderer plan with deeply nested editor state", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const sourcePath = join(outputParentDirectory, "proof.png");
		await writeFile(sourcePath, "runtime validation only");
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});

		const plan = await session.plan({
			input: {
				draftName: "Normalized snapshot",
				outputParentDirectory,
				snapshot: createNormalizedSnapshot({ sourcePath }),
				targetPlatform: "macos",
			},
		});

		expect(plan.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	it("rejects top-level and deeply nested property typos", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const sourcePath = join(outputParentDirectory, "proof.png");
		await writeFile(sourcePath, "runtime validation only");
		const snapshot = createNormalizedSnapshot({ sourcePath });
		const cases: {
			expectedPath: string;
			mutate: (value: QCutDraftExportSnapshotV1) => void;
		}[] = [
			{
				expectedPath: "$.snapshot",
				mutate: (value) => {
					Object.assign(value, { trackz: [] });
				},
			},
			{
				expectedPath: "$.snapshot.project",
				mutate: (value) => {
					Object.assign(value.project, { frameRate: 30 });
				},
			},
			{
				expectedPath: "$.snapshot.media[0]",
				mutate: (value) => {
					Object.assign(value.media[0], { sourcePat: "/typo" });
				},
			},
			{
				expectedPath: "$.snapshot.tracks[0]",
				mutate: (value) => {
					Object.assign(value.tracks[0], { lockd: true });
				},
			},
			{
				expectedPath: "$.snapshot.tracks[0].elements[0]",
				mutate: (value) => {
					Object.assign(value.tracks[0]?.elements[0], { opactiy: 1 });
				},
			},
			{
				expectedPath: "$.snapshot.tracks[0].elements[0].audio.compressor",
				mutate: (value) => {
					const element = value.tracks[0]?.elements[0];
					if (!element || element.type !== "media" || !element.audio) {
						throw new Error("Expected normalized media audio.");
					}
					Object.assign(element.audio.compressor, { threshholdDb: -18 });
				},
			},
			{
				expectedPath: "$.snapshot.tracks[0].elements[0].color.basic",
				mutate: (value) => {
					const element = value.tracks[0]?.elements[0];
					if (!element || element.type !== "media" || !element.color) {
						throw new Error("Expected normalized media color.");
					}
					Object.assign(element.color.basic, { saturaton: 0 });
				},
			},
			{
				expectedPath: "$.snapshot.tracks[0].elements[0].keyframes",
				mutate: (value) => {
					const element = value.tracks[0]?.elements[0];
					if (!element || element.type !== "media") {
						throw new Error("Expected normalized media element.");
					}
					element.keyframes = { opactiy: [] } as never;
				},
			},
			{
				expectedPath: "$.snapshot.tracks[2].elements[0].style.position",
				mutate: (value) => {
					const element = value.tracks[2]?.elements[0];
					if (!element || element.type !== "captions" || !element.style) {
						throw new Error("Expected styled caption.");
					}
					Object.assign(element.style.position, { aling: "bottom" });
				},
			},
		];

		for (const testCase of cases) {
			await expectUnknownKeyRejection({
				...testCase,
				outputParentDirectory,
				snapshot,
			});
		}
	});

	it("uses the request validation error type for unknown properties", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const snapshot = {
			...createNormalizedSnapshot({
				sourcePath: join(outputParentDirectory, "missing.png"),
			}),
			unknownSnapshotField: true,
		};
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});

		await expect(
			session.plan({
				input: {
					draftName: "Unknown snapshot property",
					outputParentDirectory,
					snapshot,
					targetPlatform: "macos",
				},
			})
		).rejects.toBeInstanceOf(StandaloneJianyingDraftRequestValidationError);
	});

	it("validates LUT cube dimensions and channel values at the IPC boundary", async () => {
		const outputParentDirectory = await createTemporaryDirectory();
		const sourcePath = join(outputParentDirectory, "proof.png");
		await writeFile(sourcePath, "runtime validation only");
		const snapshot = createNormalizedSnapshot({ sourcePath });
		const element = snapshot.tracks[0]?.elements[0];
		if (!element || element.type !== "media" || !element.color) {
			throw new Error("Expected normalized media color.");
		}
		element.color.lut = {
			cube: {
				domainMax: [1, 1, 1],
				domainMin: [0, 0, 0],
				size: 2,
				values: [0],
			},
			enabled: true,
			intensity: 80,
			name: "IPC LUT",
			presetId: "ipc-lut",
			skinProtection: 0,
		};
		const session = new StandaloneJianyingDraftExportSession({
			ffprobePath: TRUSTED_FFPROBE_PATH,
		});

		await expect(
			session.plan({
				input: {
					draftName: "Malformed LUT",
					outputParentDirectory,
					snapshot,
					targetPlatform: "macos",
				},
			})
		).rejects.toMatchObject({
			issues: [
				{
					path: "$.snapshot.tracks[0].elements[0].color.lut.cube.values",
				},
			],
			name: "StandaloneJianyingDraftRequestValidationError",
		});

		element.color.lut.cube.size = 33;
		await expect(
			session.plan({
				input: {
					draftName: "Oversized LUT",
					outputParentDirectory,
					snapshot,
					targetPlatform: "macos",
				},
			})
		).rejects.toMatchObject({
			issues: [
				{
					path: "$.snapshot.tracks[0].elements[0].color.lut.cube.size",
				},
			],
		});
	});
});

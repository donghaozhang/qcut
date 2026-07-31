import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "../jianying-draft/index.js";
import type {
	QCutDraftExportMedia,
	QCutDraftExportSnapshotV1,
} from "../jianying-draft/types.js";
import type {
	MediaAudioSettings,
	MediaElement,
	TimelineTrack,
} from "../types/timeline.js";

const videoMedia: QCutDraftExportMedia = {
	duration: 10,
	height: 1080,
	id: "video-1",
	name: "clip.mov",
	sourcePath: "/source/clip.mov",
	type: "video",
	width: 1920,
};

const audioMedia: QCutDraftExportMedia = {
	duration: 4,
	id: "audio-1",
	name: "voice.wav",
	sourcePath: "C:\\source\\voice.wav",
	type: "audio",
};

function createMediaElement({
	duration,
	id,
	mediaId,
	name,
	startTime = 0,
}: {
	duration: number;
	id: string;
	mediaId: string;
	name: string;
	startTime?: number;
}): MediaElement {
	return {
		duration,
		id,
		mediaId,
		name,
		startTime,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createTrack({
	element,
	id,
	order,
	type = "media",
}: {
	element: MediaElement;
	id: string;
	order: number;
	type?: TimelineTrack["type"];
}): TimelineTrack {
	return {
		elements: [element],
		id,
		name: id,
		order,
		type,
	};
}

function createSnapshot({
	media,
	timelineDurationByElementId,
	tracks,
}: {
	media: QCutDraftExportMedia[];
	timelineDurationByElementId: Record<string, number>;
	tracks: TimelineTrack[];
}): QCutDraftExportSnapshotV1 {
	return {
		media,
		project: {
			backgroundColor: "#00000000",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Metadata Test",
			sceneId: "scene-1",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId,
		tracks,
	};
}

function createDefaultAudioSettings(): MediaAudioSettings {
	return {
		channelMode: "stereo",
		compressor: {
			attackMs: 10,
			enabled: false,
			makeupGainDb: 0,
			ratio: 4,
			releaseMs: 100,
			thresholdDb: -18,
		},
		cover: { enabled: false, status: "idle" },
		denoise: { amount: 0, enabled: false, noiseFloorDb: -50 },
		echo: { delayMs: 220, enabled: false, feedback: 25, mix: 15 },
		enabled: true,
		equalizer: {
			enabled: false,
			highGainDb: 0,
			lowGainDb: 0,
			midGainDb: 0,
		},
		fadeIn: 0,
		fadeOut: 0,
		keyframes: {},
		limiter: { ceilingDb: -1, enabled: false, releaseMs: 80 },
		loudness: {
			enabled: false,
			loudnessRange: 11,
			targetLufs: -16,
			truePeakDb: -1.5,
		},
		lyrics: { status: "idle", text: "", words: [] },
		pan: 0,
		panEnabled: false,
		parametricEqualizer: {
			bands: [],
			enabled: false,
			highCutHz: 20_000,
			lowCutHz: 20,
		},
		pitch: { enabled: false, preserveFormants: true, semitones: 0 },
		repair: {
			deClick: { amount: 0, enabled: false },
			deClip: { amount: 0, enabled: false },
			deEsser: { amount: 0, enabled: false, frequencyHz: 6000 },
			deHum: { enabled: false, frequencyHz: 50, harmonics: 3 },
			dePlosive: { amount: 0, enabled: false },
			deReverb: { amount: 0, enabled: false },
			noiseGate: {
				attackMs: 5,
				enabled: false,
				releaseMs: 100,
				thresholdDb: -45,
			},
		},
		reverb: { damping: 50, enabled: false, mix: 20, roomSize: 40 },
		separation: { enabled: false, status: "idle" },
		telephone: { enabled: false, mix: 100 },
		voiceConversion: { enabled: false, status: "idle" },
		voiceEnhance: {
			clarity: 0,
			enabled: false,
			presence: 0,
			warmth: 0,
		},
		volumeDb: 0,
	};
}

describe("JianYing draft metadata fidelity", () => {
	it("maps locked and muted tracks without warning when main order is preserved", () => {
		const element = createMediaElement({
			duration: 3,
			id: "locked-clip",
			mediaId: videoMedia.id,
			name: videoMedia.name,
		});
		const track = {
			...createTrack({
				element,
				id: "locked-main-track",
				order: 0,
			}),
			isMain: true,
			locked: true,
			muted: true,
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/locked",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [element.id]: 3 },
				tracks: [track],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks[0]?.attribute).toBe(5);
		expect(
			result.issues.filter(({ code }) => code === "UNSUPPORTED_TRACK_METADATA")
		).toEqual([]);
	});

	it("reports every unmapped element and track organization field", () => {
		const element = {
			...createMediaElement({
				duration: 3,
				id: "organized-clip",
				mediaId: videoMedia.id,
				name: "Hero close-up",
			}),
			colorLabel: "violet",
			groupId: "group-1",
			templateBinding: {
				instanceId: "instance-1",
				slotId: "hero",
				templateId: "template-1",
				templateVersion: "1.0.0",
			},
		};
		const track = {
			...createTrack({
				element,
				id: "custom-height-track",
				order: 0,
			}),
			height: 96,
			isMain: true,
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/organization-metadata",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [element.id]: 3 },
				tracks: [track],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(
			result.issues
				.filter(
					({ code }) =>
						code === "UNSUPPORTED_MEDIA_FEATURE" ||
						code === "UNSUPPORTED_TRACK_METADATA"
				)
				.map(({ code, message }) => ({ code, message }))
		).toEqual([
			{
				code: "UNSUPPORTED_MEDIA_FEATURE",
				message: "Timeline element grouping is not mapped yet.",
			},
			{
				code: "UNSUPPORTED_MEDIA_FEATURE",
				message:
					"QCut template binding metadata is not represented in the draft.",
			},
			{
				code: "UNSUPPORTED_MEDIA_FEATURE",
				message: "Timeline element color labels are not mapped yet.",
			},
			{
				code: "UNSUPPORTED_MEDIA_FEATURE",
				message:
					"Custom timeline element names are not represented separately from media names.",
			},
			{
				code: "UNSUPPORTED_TRACK_METADATA",
				message:
					"Track custom-height-track custom lane height is not represented in the draft.",
			},
		]);
	});

	it("warns when main-track status cannot follow JianYing render order", () => {
		const topElement = createMediaElement({
			duration: 3,
			id: "main-top-clip",
			mediaId: videoMedia.id,
			name: videoMedia.name,
		});
		const bottomElement = createMediaElement({
			duration: 3,
			id: "bottom-clip",
			mediaId: videoMedia.id,
			name: videoMedia.name,
		});
		const topTrack = {
			...createTrack({
				element: topElement,
				id: "main-top-track",
				order: 0,
			}),
			isMain: true,
		};
		const bottomTrack = createTrack({
			element: bottomElement,
			id: "bottom-track",
			order: 1,
		});
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/main-order",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: {
					[bottomElement.id]: 3,
					[topElement.id]: 3,
				},
				tracks: [topTrack, bottomTrack],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks.map(({ name }) => name)).toEqual([
			bottomTrack.name,
			topTrack.name,
		]);
		expect(result.issues).toContainEqual({
			code: "UNSUPPORTED_TRACK_METADATA",
			message:
				"Track main-top-track cannot retain its QCut main-track designation without changing render order.",
			severity: "warning",
			trackId: topTrack.id,
		});
	});

	it("warns when an explicitly non-main track becomes implicitly main", () => {
		const element = createMediaElement({
			duration: 3,
			id: "explicit-non-main-clip",
			mediaId: videoMedia.id,
			name: videoMedia.name,
		});
		const track = {
			...createTrack({
				element,
				id: "explicit-non-main-track",
				order: 0,
			}),
			isMain: false,
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/non-main",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [element.id]: 3 },
				tracks: [track],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.issues).toContainEqual({
			code: "UNSUPPORTED_TRACK_METADATA",
			message:
				"Track explicit-non-main-track is explicitly non-main in QCut but becomes the target draft's implicit main video track.",
			severity: "warning",
			trackId: track.id,
		});
	});

	it("blocks populated lyrics but ignores the default lyrics state", () => {
		const defaultElement = {
			...createMediaElement({
				duration: 4,
				id: "default-lyrics",
				mediaId: audioMedia.id,
				name: audioMedia.name,
			}),
			audio: createDefaultAudioSettings(),
		};
		const populatedElement: MediaElement = {
			...defaultElement,
			audio: {
				...defaultElement.audio,
				lyrics: {
					language: "en",
					sourceFormat: "transcription",
					status: "ready",
					text: "hello",
					words: [
						{
							end: 0.5,
							id: "word-1",
							start: 0,
							text: "hello",
							type: "word",
						},
					],
				},
			},
			id: "populated-lyrics",
			startTime: 4,
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/lyrics",
			snapshot: createSnapshot({
				media: [audioMedia],
				timelineDurationByElementId: {
					[defaultElement.id]: 4,
					[populatedElement.id]: 4,
				},
				tracks: [
					{
						elements: [defaultElement, populatedElement],
						id: "lyrics-track",
						name: "lyrics-track",
						order: 0,
						type: "audio",
					},
				],
			}),
			targetPlatform: "windows",
		});

		expect(result.canWrite).toBe(false);
		expect(
			result.issues.filter(
				({ message }) =>
					message === "Audio lyrics and word timings are not mapped yet."
			)
		).toEqual([
			{
				code: "UNSUPPORTED_MEDIA_FEATURE",
				elementId: populatedElement.id,
				mediaId: audioMedia.id,
				message: "Audio lyrics and word timings are not mapped yet.",
				severity: "error",
			},
		]);
	});

	it("blocks disabled audio processing that retains non-default parameters", () => {
		const defaultAudio = createDefaultAudioSettings();
		const element = {
			...createMediaElement({
				duration: 4,
				id: "disabled-denoise",
				mediaId: audioMedia.id,
				name: audioMedia.name,
			}),
			audio: {
				...defaultAudio,
				denoise: {
					...defaultAudio.denoise,
					amount: 0.75,
					enabled: false,
				},
			},
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/disabled-audio-state",
			snapshot: createSnapshot({
				media: [audioMedia],
				timelineDurationByElementId: { [element.id]: 4 },
				tracks: [
					{
						elements: [element],
						id: "audio-track",
						name: "Audio",
						type: "audio",
					},
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_MEDIA_FEATURE",
				elementId: element.id,
				message: "Advanced QCut audio processing is not mapped yet.",
				severity: "error",
			})
		);
	});

	it("blocks active freeze frames and warns for a retained inactive position", () => {
		const activeElement = {
			...createMediaElement({
				duration: 10,
				id: "active-freeze",
				mediaId: videoMedia.id,
				name: videoMedia.name,
			}),
			freezeFrameDuration: 1,
			freezeFrameTime: 2,
		};
		const inactiveElement = {
			...createMediaElement({
				duration: 10,
				id: "inactive-freeze",
				mediaId: videoMedia.id,
				name: videoMedia.name,
			}),
			freezeFrameDuration: 0,
			freezeFrameTime: 2,
		};
		const activeResult = buildJianyingDraft({
			draftOutputDirectory: "/exports/active-freeze",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [activeElement.id]: 11 },
				tracks: [
					createTrack({
						element: activeElement,
						id: "active-freeze-track",
						order: 0,
					}),
				],
			}),
			targetPlatform: "macos",
		});
		const inactiveResult = buildJianyingDraft({
			draftOutputDirectory: "/exports/inactive-freeze",
			snapshot: createSnapshot({
				media: [videoMedia],
				timelineDurationByElementId: { [inactiveElement.id]: 10 },
				tracks: [
					createTrack({
						element: inactiveElement,
						id: "inactive-freeze-track",
						order: 0,
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(activeResult.canWrite).toBe(false);
		expect(activeResult.issues).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_MEDIA_TIMING",
				elementId: activeElement.id,
				severity: "error",
			})
		);
		expect(inactiveResult.canWrite).toBe(true);
		expect(inactiveResult.issues).toContainEqual({
			code: "UNSUPPORTED_MEDIA_FEATURE",
			elementId: inactiveElement.id,
			mediaId: videoMedia.id,
			message: "Inactive freeze-frame position metadata is not preserved.",
			severity: "warning",
		});
	});
});

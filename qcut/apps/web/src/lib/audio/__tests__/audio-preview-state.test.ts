import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "../audio-properties";
import { calculateAudioPreviewState } from "../audio-preview-state";

function element({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "asset",
		name: "Clip",
		duration: 10,
		startTime: 5,
		trimStart: 0,
		trimEnd: 0,
		audio: { ...DEFAULT_MEDIA_AUDIO_SETTINGS },
		...overrides,
	};
}

describe("audio preview state", () => {
	it("combines dB volume with fade envelopes", () => {
		const state = calculateAudioPreviewState({
			element: element({
				overrides: {
					audio: {
						...DEFAULT_MEDIA_AUDIO_SETTINGS,
						volumeDb: 6,
						fadeIn: 2,
					},
				},
			}),
			timelineTime: 6,
			fps: 30,
			duration: 10,
			masterVolume: 0.5,
			muted: false,
			trackMuted: false,
			forceMuted: false,
		});
		expect(state.outputGain).toBeCloseTo(0.4988, 3);
	});

	it("uses analyzed loudness for live target compensation", () => {
		const state = calculateAudioPreviewState({
			element: element({
				overrides: {
					audio: {
						...DEFAULT_MEDIA_AUDIO_SETTINGS,
						loudness: {
							...DEFAULT_MEDIA_AUDIO_SETTINGS.loudness,
							enabled: true,
							targetLufs: -16,
							measuredLufs: -22,
						},
					},
				},
			}),
			timelineTime: 5,
			fps: 30,
			duration: 10,
			masterVolume: 1,
			muted: false,
			trackMuted: false,
			forceMuted: false,
		});
		expect(state.outputGain).toBeCloseTo(1.9953, 3);
	});

	it("mutes the graph without discarding resolved settings", () => {
		const state = calculateAudioPreviewState({
			element: element(),
			timelineTime: 5,
			fps: 30,
			duration: 10,
			masterVolume: 1,
			muted: false,
			trackMuted: true,
			forceMuted: false,
		});
		expect(state.outputGain).toBe(0);
		expect(state.settings.enabled).toBe(true);
	});

	it("resolves animated balance at the current timeline frame", () => {
		const state = calculateAudioPreviewState({
			element: element({
				overrides: {
					audio: {
						...DEFAULT_MEDIA_AUDIO_SETTINGS,
						panEnabled: true,
						keyframes: {
							pan: [
								{ id: "left", frame: 0, value: -100, easing: "linear" },
								{ id: "right", frame: 60, value: 100, easing: "linear" },
							],
						},
					},
				},
			}),
			timelineTime: 6,
			fps: 30,
			duration: 10,
			masterVolume: 1,
			muted: false,
			trackMuted: false,
			forceMuted: false,
		});
		expect(state.pan).toBeCloseTo(0);
	});

	it("uses neutral processing while preview is bypassed", () => {
		const state = calculateAudioPreviewState({
			element: element({
				overrides: {
					audio: {
						...DEFAULT_MEDIA_AUDIO_SETTINGS,
						volumeDb: -12,
						panEnabled: true,
						pan: 1,
						equalizer: {
							...DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer,
							enabled: true,
							lowGainDb: 8,
						},
					},
				},
			}),
			timelineTime: 5,
			fps: 30,
			duration: 10,
			masterVolume: 0.5,
			muted: false,
			trackMuted: false,
			forceMuted: false,
			bypassed: true,
		});

		expect(state.outputGain).toBe(0.5);
		expect(state.pan).toBe(0);
		expect(state.settings.equalizer.enabled).toBe(false);
	});
});

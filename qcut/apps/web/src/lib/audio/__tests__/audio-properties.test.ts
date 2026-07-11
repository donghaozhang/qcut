import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	DEFAULT_MEDIA_AUDIO_SETTINGS,
	resetMediaAudioProcessing,
	buildLegacyAudioFields,
	dbToGain,
	gainToDb,
	normalizeMediaAudioSettings,
} from "../audio-properties";
import {
	resolveMediaAudioSettings,
	setAudioKeyframePropertyValue,
	upsertAudioKeyframe,
} from "../audio-keyframe-properties";

function mediaElement({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "media-1",
		type: "media",
		mediaId: "asset-1",
		name: "Audio",
		duration: 5,
		startTime: 2,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("media audio properties", () => {
	it("migrates legacy audio fields into canonical settings", () => {
		const settings = normalizeMediaAudioSettings({
			element: mediaElement({
				overrides: {
					volume: 0.5,
					audioFadeIn: 0.4,
					audioFadeOut: 0.7,
					audioNormalize: true,
					audioDenoise: 35,
					audioPan: -0.25,
				},
			}),
		});

		expect(settings.volumeDb).toBeCloseTo(-6.0206);
		expect(settings.fadeIn).toBe(0.4);
		expect(settings.fadeOut).toBe(0.7);
		expect(settings.loudness.enabled).toBe(true);
		expect(settings.denoise).toMatchObject({ enabled: true, amount: 35 });
		expect(settings.pan).toBe(-0.25);
		expect(settings.channelMode).toBe("stereo");
		expect(settings.parametricEqualizer.bands).toHaveLength(4);
		expect(settings.repair.noiseGate.enabled).toBe(false);
	});

	it("keeps nested defaults when a stored settings object is incomplete", () => {
		const settings = normalizeMediaAudioSettings({
			element: mediaElement({
				overrides: {
					audio: {
						...DEFAULT_MEDIA_AUDIO_SETTINGS,
						volumeDb: 6,
						denoise: { enabled: true, amount: 50, noiseFloorDb: -42 },
					},
				},
			}),
		});

		expect(settings.volumeDb).toBe(6);
		expect(settings.denoise.noiseFloorDb).toBe(-42);
		expect(settings.equalizer.midGainDb).toBe(0);
	});

	it("converts dB gain and reserves the slider floor for mute", () => {
		expect(dbToGain({ db: -60 })).toBe(0);
		expect(dbToGain({ db: 6 })).toBeCloseTo(1.9953, 3);
		expect(gainToDb({ gain: dbToGain({ db: -12 }) })).toBeCloseTo(-12);
	});

	it("interpolates top-level and nested audio keyframes", () => {
		const element = mediaElement({
			overrides: {
				audio: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS,
					keyframes: {
						volumeDb: [
							{ id: "v0", frame: 0, value: -12, easing: "linear" },
							{ id: "v1", frame: 30, value: 0, easing: "linear" },
						],
						pan: [
							{ id: "p0", frame: 0, value: -100, easing: "linear" },
							{ id: "p1", frame: 30, value: 100, easing: "linear" },
						],
					},
				},
			},
		});

		const resolved = resolveMediaAudioSettings({
			element,
			currentTime: 2.5,
			fps: 30,
		});
		expect(resolved.volumeDb).toBeCloseTo(-6);
		expect(resolved.pan).toBeCloseTo(0);
	});

	it("updates nested parameter values without replacing sibling modules", () => {
		const settings = setAudioKeyframePropertyValue({
			settings: DEFAULT_MEDIA_AUDIO_SETTINGS,
			property: "voiceWarmth",
			value: 35,
		});
		expect(settings.voiceEnhance.warmth).toBe(35);
		expect(settings.voiceEnhance.clarity).toBe(0);
		expect(settings.equalizer).toEqual(DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer);
	});

	it("upserts one keyframe per frame and preserves stable ids", () => {
		const keyframes = upsertAudioKeyframe({
			keyframes: [
				{ id: "old", frame: 12, value: 1, easing: "linear" },
				{ id: "later", frame: 20, value: 3, easing: "linear" },
			],
			keyframe: { id: "new", frame: 12, value: 2, easing: "easeIn" },
		});
		expect(keyframes).toEqual([
			{ id: "new", frame: 12, value: 2, easing: "easeIn" },
			{ id: "later", frame: 20, value: 3, easing: "linear" },
		]);
	});

	it("keeps legacy fields synchronized for older export paths", () => {
		const legacy = buildLegacyAudioFields({
			settings: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				volumeDb: 6,
				fadeIn: 1,
				fadeOut: 2,
				panEnabled: true,
				pan: 0.4,
				loudness: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.loudness,
					enabled: true,
				},
				denoise: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.denoise,
					enabled: true,
					amount: 25,
				},
			},
		});
		expect(legacy.volume).toBeCloseTo(1.9953, 3);
		expect(legacy).toMatchObject({
			audioFadeIn: 1,
			audioFadeOut: 2,
			audioNormalize: true,
			audioDenoise: 25,
			audioPan: 0.4,
		});
	});

	it("resets processing while preserving reusable AI results and lyrics", () => {
		const reset = resetMediaAudioProcessing({
			settings: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				volumeDb: 8,
				loudness: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.loudness,
					measuredLufs: 0,
				},
				equalizer: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer,
					enabled: true,
					lowGainDb: 6,
				},
				denoise: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.denoise,
					enabled: true,
					mode: "ai",
					status: "ready",
					processedMediaId: "clean",
				},
				voiceConversion: {
					enabled: true,
					status: "ready",
					sourceMediaId: "voice",
					provider: "fal",
				},
				lyrics: {
					status: "ready",
					text: "hello",
					words: [
						{
							id: "word",
							text: "hello",
							start: 0,
							end: 0.5,
							type: "word",
						},
					],
				},
			},
		});

		expect(reset.volumeDb).toBe(0);
		expect(reset.loudness.analysisStatus).toBe("ready");
		expect(reset.equalizer.enabled).toBe(false);
		expect(reset.denoise).toMatchObject({
			enabled: false,
			status: "ready",
			processedMediaId: "clean",
		});
		expect(reset.voiceConversion).toMatchObject({
			enabled: false,
			status: "ready",
			sourceMediaId: "voice",
			provider: "fal",
		});
		expect(reset.lyrics.text).toBe("hello");
	});
});

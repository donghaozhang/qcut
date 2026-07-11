import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "../audio-properties";
import {
	createDerivedAudioElement,
	selectMediaAudioSources,
} from "../audio-source-selection";

function element({
	audio = DEFAULT_MEDIA_AUDIO_SETTINGS,
}: {
	audio?: MediaElement["audio"];
} = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "original",
		name: "Clip",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		audio,
	};
}

describe("derived audio source selection", () => {
	it("switches to an AI-denoised source without replacing the clip media id", () => {
		const clip = element({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				denoise: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.denoise,
					enabled: true,
					mode: "ai",
					status: "ready",
					processedMediaId: "clean",
				},
			},
		});

		expect(selectMediaAudioSources({ element: clip })).toEqual([
			{ mediaId: "clean", gain: 1, source: "ai-denoise" },
		]);
		expect(clip.mediaId).toBe("original");
	});

	it("mixes ready stems with independent gains", () => {
		const clip = element({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				separation: {
					enabled: true,
					status: "ready",
					stemMediaIds: { vocals: "vocals", drums: "drums" },
					stemGains: { vocals: 0.8, drums: 0.25 },
				},
			},
		});

		expect(selectMediaAudioSources({ element: clip })).toEqual([
			{ mediaId: "vocals", gain: 0.8, stem: "vocals", source: "separation" },
			{ mediaId: "drums", gain: 0.25, stem: "drums", source: "separation" },
		]);
	});

	it("uses only the original source while preview is bypassed", () => {
		const clip = element({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				voiceConversion: {
					enabled: true,
					status: "ready",
					sourceMediaId: "converted",
				},
			},
		});

		expect(selectMediaAudioSources({ element: clip, bypassed: true })).toEqual([
			{ mediaId: "original", gain: 1, source: "original" },
		]);
	});

	it("applies a stem gain to preview dB without mutating source settings", () => {
		const clip = element({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				volumeDb: 6,
				keyframes: {
					volumeDb: [{ id: "volume", frame: 0, value: 6, easing: "linear" }],
				},
			},
		});
		const derived = createDerivedAudioElement({
			element: clip,
			selectedSource: {
				mediaId: "vocals",
				gain: 0.5,
				stem: "vocals",
				source: "separation",
			},
			index: 0,
		});

		expect(derived.audio?.volumeDb).toBeCloseTo(-0.0206, 3);
		expect(derived.audio?.keyframes?.volumeDb?.[0].value).toBeCloseTo(
			-0.0206,
			3
		);
		expect(clip.audio?.volumeDb).toBe(6);
	});
});

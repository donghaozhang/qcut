import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "../audio-properties";
import {
	buildBrowserAudioAutomation,
	MAX_BROWSER_AUDIO_AUTOMATION_POINTS,
} from "../browser-audio-automation";
import { collectBrowserAudioExportClips } from "../browser-audio-export-clips";

function mediaElement({
	audio = DEFAULT_MEDIA_AUDIO_SETTINGS,
}: {
	audio?: MediaElement["audio"];
} = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "original",
		name: "Clip",
		startTime: 2,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		audio,
	};
}

function mediaItem({
	id,
	type = "audio",
}: {
	id: string;
	type?: "audio" | "video";
}): MediaItem {
	return {
		id,
		name: `${id}.wav`,
		type,
		file: new File([], `${id}.wav`, { type: "audio/wav" }),
	};
}

function track({
	element,
	muted = false,
}: {
	element: MediaElement;
	muted?: boolean;
}): TimelineTrack {
	return {
		id: "audio-track",
		name: "Audio",
		type: "audio",
		muted,
		elements: [element],
	};
}

describe("browser audio export", () => {
	it("resolves separated stems with their non-destructive gains", () => {
		const element = mediaElement({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				volumeDb: 6,
				separation: {
					enabled: true,
					status: "ready",
					stemMediaIds: { vocals: "vocals", drums: "drums" },
					stemGains: { vocals: 0.5, drums: 0.25 },
				},
			},
		});
		const clips = collectBrowserAudioExportClips({
			tracks: [track({ element })],
			mediaItems: [
				mediaItem({ id: "original" }),
				mediaItem({ id: "vocals" }),
				mediaItem({ id: "drums" }),
			],
		});

		expect(clips.map((clip) => clip.mediaItem.id)).toEqual(["vocals", "drums"]);
		expect(clips[0].element.audio?.volumeDb).toBeCloseTo(-0.0206, 3);
		expect(clips[1].element.audio?.volumeDb).toBeCloseTo(-6.0412, 3);
		expect(element.mediaId).toBe("original");
	});

	it("omits muted tracks and hidden clips", () => {
		const element = mediaElement();
		expect(
			collectBrowserAudioExportClips({
				tracks: [track({ element, muted: true })],
				mediaItems: [mediaItem({ id: "original" })],
			})
		).toEqual([]);
		expect(
			collectBrowserAudioExportClips({
				tracks: [track({ element: { ...element, hidden: true } })],
				mediaItems: [mediaItem({ id: "original" })],
			})
		).toEqual([]);
	});

	it("turns dB, fades, balance, and effect keyframes into automation", () => {
		const element = mediaElement({
			audio: {
				...DEFAULT_MEDIA_AUDIO_SETTINGS,
				fadeIn: 1,
				panEnabled: true,
				equalizer: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer,
					enabled: true,
				},
				pitch: {
					...DEFAULT_MEDIA_AUDIO_SETTINGS.pitch,
					enabled: true,
					preserveFormants: true,
				},
				keyframes: {
					volumeDb: [
						{ id: "quiet", frame: 0, value: -6, easing: "linear" },
						{ id: "loud", frame: 60, value: 6, easing: "linear" },
					],
					pan: [
						{ id: "left", frame: 0, value: -100, easing: "linear" },
						{ id: "right", frame: 60, value: 100, easing: "linear" },
					],
					eqHighGainDb: [
						{ id: "flat", frame: 0, value: 0, easing: "linear" },
						{ id: "bright", frame: 60, value: 12, easing: "linear" },
					],
					pitchSemitones: [
						{ id: "pitch-a", frame: 0, value: 0, easing: "linear" },
						{ id: "pitch-b", frame: 60, value: 12, easing: "linear" },
					],
				},
			},
		});
		const points = buildBrowserAudioAutomation({
			element,
			duration: element.duration,
			fps: 30,
		});
		const start = points[0];
		const middle = points.find((point) => point.time === 1);
		const end = points.at(-1);

		expect(start.outputGain).toBe(0);
		expect(start.pan).toBe(-1);
		expect(middle?.outputGain).toBeCloseTo(1, 2);
		expect(middle?.pan).toBeCloseTo(0, 2);
		expect(middle?.eqHigh).toBeCloseTo(6, 2);
		expect(middle?.pitchSemitones).toBeCloseTo(6, 2);
		expect(middle?.formantStrength).toBe(1);
		expect(end?.outputGain).toBeCloseTo(1.9953, 3);
		expect(end?.pan).toBe(1);
	});

	it("samples clip speed curves for offline audio automation", () => {
		const element = {
			...mediaElement(),
			playbackRate: 1,
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 0.5, easing: "linear" as const },
				{ id: "fast", frame: 60, value: 2, easing: "linear" as const },
			],
		};
		const points = buildBrowserAudioAutomation({
			element,
			duration: 2.5,
			fps: 30,
		});
		expect(points[0].playbackRate).toBeCloseTo(0.5, 1);
		expect(points.at(-1)?.playbackRate).toBeCloseTo(2, 1);
	});

	it("bounds automation for long clips without losing curve boundaries", () => {
		const duration = 60 * 60;
		const element = {
			...mediaElement(),
			duration,
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 0.5, easing: "easeInOut" as const },
				{
					id: "fast",
					frame: duration * 30,
					value: 2,
					easing: "easeInOut" as const,
				},
			],
		};
		const points = buildBrowserAudioAutomation({
			element,
			duration,
			fps: 30,
		});

		expect(points.length).toBeLessThanOrEqual(
			MAX_BROWSER_AUDIO_AUTOMATION_POINTS
		);
		expect(points[0].time).toBe(0);
		expect(points.at(-1)?.time).toBe(duration);
	});
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "../audio-properties";
import { renderBrowserTimelineAudio } from "../browser-audio-export";

interface FactoryCounts {
	convolver: number;
	delay: number;
	gain: number;
}

function audioParam() {
	return {
		value: 0,
		cancelScheduledValues: vi.fn(),
		linearRampToValueAtTime: vi.fn(),
		setValueAtTime: vi.fn(),
	};
}

function audioNode() {
	return {
		buffer: null as unknown,
		connect: vi.fn(),
		delayTime: audioParam(),
		frequency: audioParam(),
		gain: audioParam(),
		knee: audioParam(),
		pan: audioParam(),
		playbackRate: audioParam(),
		Q: audioParam(),
		ratio: audioParam(),
		attack: audioParam(),
		release: audioParam(),
		threshold: audioParam(),
		start: vi.fn(),
		stop: vi.fn(),
		type: "",
	};
}

/**
 * Offline context that records which node factories the scheduler reached.
 * The reverb branch is the most expensive node in the per-clip graph, so the
 * test asserts on whether a convolver was ever constructed.
 */
function stubOfflineContext({ counts }: { counts: FactoryCounts }) {
	vi.stubGlobal(
		"OfflineAudioContext",
		class {
			destination = audioNode();
			length = 48_000 * 2;
			sampleRate = 48_000;
			decodeAudioData = vi.fn(async () => ({
				duration: 2,
				length: 96_000,
				numberOfChannels: 2,
				sampleRate: 48_000,
			}));
			createBuffer = vi.fn(() => ({
				duration: 2,
				getChannelData: () => new Float32Array(96_000),
				length: 96_000,
				numberOfChannels: 2,
				sampleRate: 48_000,
			}));
			createBufferSource = vi.fn(() => audioNode());
			createBiquadFilter = vi.fn(() => audioNode());
			createDynamicsCompressor = vi.fn(() => audioNode());
			createStereoPanner = vi.fn(() => audioNode());
			createGain = vi.fn(() => {
				counts.gain += 1;
				return audioNode();
			});
			createConvolver = vi.fn(() => {
				counts.convolver += 1;
				return audioNode();
			});
			createDelay = vi.fn(() => {
				counts.delay += 1;
				return audioNode();
			});
			startRendering = vi.fn(async () => ({
				duration: 2,
				length: 96_000,
				numberOfChannels: 2,
				sampleRate: 48_000,
			}));
		}
	);
}

function mediaElement({
	audio,
}: {
	audio?: Partial<MediaElement["audio"]>;
} = {}): MediaElement {
	return {
		audio: { ...DEFAULT_MEDIA_AUDIO_SETTINGS, ...audio } as MediaElement["audio"],
		duration: 2,
		id: "clip",
		mediaId: "sound",
		name: "Sound",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function track({ element }: { element: MediaElement }): TimelineTrack {
	return {
		elements: [element],
		id: "audio-track",
		name: "Audio",
		type: "audio",
	};
}

function mediaItem(): MediaItem {
	return {
		file: new File([new Uint8Array([1, 2, 3, 4])], "sound.wav", {
			type: "audio/wav",
		}),
		id: "sound",
		name: "sound.wav",
		type: "audio",
	} as MediaItem;
}

describe("browser audio export reverb bypass", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("skips the convolution branch when reverb is disabled for the clip", async () => {
		const counts: FactoryCounts = { convolver: 0, delay: 0, gain: 0 };
		stubOfflineContext({ counts });

		const rendered = await renderBrowserTimelineAudio({
			tracks: [track({ element: mediaElement() })],
			mediaItems: [mediaItem()],
			totalDuration: 2,
			fps: 30,
		});

		expect(rendered).not.toBeNull();
		// Reverb is off by default, so its mix is exactly 0 at every automation
		// point and the branch can only sum silence into the panner.
		expect(counts.convolver).toBe(0);
		// The rest of the chain is untouched — this is a branch bypass, not a
		// reduced-quality render path.
		expect(counts.delay).toBe(1);
		expect(counts.gain).toBeGreaterThan(5);
	});

	it("still builds the convolution branch when reverb is enabled", async () => {
		const counts: FactoryCounts = { convolver: 0, delay: 0, gain: 0 };
		stubOfflineContext({ counts });

		const rendered = await renderBrowserTimelineAudio({
			tracks: [
				track({
					element: mediaElement({
						audio: { reverb: { enabled: true, mix: 40, roomSize: 50, damping: 50 } },
					}),
				}),
			],
			mediaItems: [mediaItem()],
			totalDuration: 2,
			fps: 30,
		});

		expect(rendered).not.toBeNull();
		expect(counts.convolver).toBe(1);
	});
});

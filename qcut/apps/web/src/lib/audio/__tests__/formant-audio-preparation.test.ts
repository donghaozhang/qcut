import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "../audio-properties";
import { encodeAudioBufferAsWav } from "../audio-buffer-wav";

const renderBrowserTimelineAudio = vi.fn();

vi.mock("../browser-audio-export", () => ({
	renderBrowserTimelineAudio,
}));

function audioBuffer({
	channels = [new Float32Array([0, 0.5, -0.5, 1])],
	sampleRate = 48_000,
}: {
	channels?: Float32Array[];
	sampleRate?: number;
} = {}): AudioBuffer {
	return {
		duration: channels[0].length / sampleRate,
		length: channels[0].length,
		numberOfChannels: channels.length,
		sampleRate,
		getChannelData: (channel: number) => channels[channel],
	} as AudioBuffer;
}

function element({
	id,
	preserveFormants,
}: {
	id: string;
	preserveFormants: boolean;
}): MediaElement {
	return {
		id,
		type: "media",
		mediaId: "asset",
		name: id,
		startTime: id === "formant" ? 3 : 0,
		duration: 1,
		trimStart: 0,
		trimEnd: 0,
		audio: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS,
			pitch: {
				enabled: true,
				semitones: 7,
				preserveFormants,
			},
		},
	};
}

function track(elements: MediaElement[]): TimelineTrack {
	return {
		id: "audio",
		name: "Audio",
		type: "audio",
		elements,
	};
}

describe("formant audio preparation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		renderBrowserTimelineAudio.mockResolvedValue(audioBuffer());
	});

	it("encodes a valid interleaved PCM WAV", () => {
		const wav = encodeAudioBufferAsWav({
			buffer: audioBuffer({
				channels: [new Float32Array([1, -1]), new Float32Array([0.5, -0.5])],
				sampleRate: 44_100,
			}),
		});
		const view = new DataView(wav);
		const text = (offset: number, length: number) =>
			String.fromCharCode(
				...Array.from({ length }, (_, index) => view.getUint8(offset + index))
			);

		expect(text(0, 4)).toBe("RIFF");
		expect(text(8, 4)).toBe("WAVE");
		expect(view.getUint16(22, true)).toBe(2);
		expect(view.getUint32(24, true)).toBe(44_100);
		expect(view.getUint32(40, true)).toBe(8);
		expect(view.getInt16(44, true)).toBe(32_767);
		expect(view.getInt16(46, true)).toBe(16_383);
	});

	it("pre-renders only clips that request preserved formants", async () => {
		const { preparePreservedFormantAudio } = await import(
			"../formant-audio-preparation"
		);
		const formant = element({ id: "formant", preserveFormants: true });
		const standard = element({ id: "standard", preserveFormants: false });
		const saveTemp = vi.fn().mockResolvedValue({
			success: true,
			path: "/tmp/formant.wav",
		});
		const result = await preparePreservedFormantAudio({
			tracks: [track([formant, standard])],
			mediaItems: [],
			fps: 30,
			sessionId: "session",
			saveTemp,
		});

		expect(renderBrowserTimelineAudio).toHaveBeenCalledWith(
			expect.objectContaining({ totalDuration: 1, fps: 30 })
		);
		expect(saveTemp).toHaveBeenCalledWith(
			expect.objectContaining({
				filename: "audio_session_formant_formant.wav",
			})
		);
		expect(result.audioFiles).toEqual([
			expect.objectContaining({
				path: "/tmp/formant.wav",
				startTime: 3,
				volume: 1,
				trimStart: 0,
				playbackRate: 1,
			}),
		]);
		expect(result.remainingTracks[0].elements).toEqual([standard]);
	});
});

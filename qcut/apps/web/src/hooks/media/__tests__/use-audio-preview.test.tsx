import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundEffect } from "@/types/sounds";
import { useAudioPreview } from "../use-audio-preview";

const sound: SoundEffect = {
	id: -1,
	name: "Preview",
	description: "",
	url: "/preview.ogg",
	previewUrl: "/preview.ogg",
	duration: 12,
	filesize: 0,
	type: "audio/ogg",
	channels: 1,
	bitrate: 96_000,
	bitdepth: 16,
	samplerate: 44_100,
	username: "QCut",
	tags: [],
	license: "qcut://license/built-in",
	created: "2026-07-17T00:00:00.000Z",
	downloads: 0,
	rating: 5,
	ratingCount: 1,
	source: "qcut",
};

class FakeAudio extends EventTarget {
	static instances: FakeAudio[] = [];

	currentTime = 0;
	duration = 12;
	paused = true;
	volume = 1;

	constructor(readonly src: string) {
		super();
		FakeAudio.instances.push(this);
	}

	pause() {
		this.paused = true;
	}

	async play() {
		this.paused = false;
	}
}

describe("useAudioPreview", () => {
	beforeEach(() => {
		FakeAudio.instances = [];
		vi.stubGlobal("Audio", FakeAudio);
	});

	afterEach(() => vi.unstubAllGlobals());

	it("supports seeking, volume changes, and ended callbacks", async () => {
		const onEnded = vi.fn();
		const { result } = renderHook(() => useAudioPreview({ onEnded }));

		await act(async () => result.current.togglePreview({ sound }));
		const audio = FakeAudio.instances[0];
		expect(audio.src).toBe("/preview.ogg");
		expect(result.current.isPlaying).toBe(true);

		act(() => {
			result.current.seek({ time: 3.25 });
			result.current.setVolume({ value: 0.35 });
		});
		expect(audio.currentTime).toBe(3.25);
		expect(audio.volume).toBe(0.35);

		act(() => audio.dispatchEvent(new Event("ended")));
		expect(onEnded).toHaveBeenCalledWith({ sound });
		expect(result.current.playingSound).toBeUndefined();
	});
});

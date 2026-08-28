import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoundEffect } from "@/types/sounds";
import { useAudioPreview } from "../use-audio-preview";

const previewMocks = vi.hoisted(() => ({
	ensureAssetResources: vi.fn(),
}));

vi.mock("@/lib/assets/asset-resource-cache", () => ({
	ensureAssetResources: previewMocks.ensureAssetResources,
}));

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
		previewMocks.ensureAssetResources.mockReset();
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

	it("loads persisted lab previews through the authenticated asset cache", async () => {
		const createObjectUrl = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:authenticated-lab");
		const revokeObjectUrl = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => undefined);
		previewMocks.ensureAssetResources.mockResolvedValue([
			{
				blob: new Blob(["audio"], { type: "audio/mpeg" }),
				cacheKey: "lab:source:0",
				fromCache: true,
				mimeType: "audio/mpeg",
				role: "source",
				sourceUrl: "https://license.example/assets",
				url: "https://license.example/assets",
			},
		]);
		const labSound: SoundEffect = {
			...sound,
			id: -900_001_108,
			source: "sound-effects-lab",
			kind: "sound-effect",
			previewUrl: "https://license.example/assets",
			soundEffectsLab: {
				provider: "freesound",
				redistribution: "allowed",
				resourceId: "8800000000000324894",
				asset: {
					objectKey:
						"qcut/2026-08-22/assets/a3bb18a41c76abd0d1af22b05072655e.mp3",
					byteSize: 5,
					checksumSha256:
						"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
					mimeType: "audio/mpeg",
				},
			},
		};
		const { result, unmount } = renderHook(() => useAudioPreview());

		await act(async () => result.current.togglePreview({ sound: labSound }));

		expect(previewMocks.ensureAssetResources).toHaveBeenCalledWith(
			expect.objectContaining({
				fetchImpl: expect.any(Function),
				roles: ["source"],
			})
		);
		expect(createObjectUrl).toHaveBeenCalledTimes(1);
		expect(FakeAudio.instances[0]?.src).toBe("blob:authenticated-lab");
		unmount();
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:authenticated-lab");
	});
});

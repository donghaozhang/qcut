import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";

const { addMediaItem, uploadAudioToFal } = vi.hoisted(() => ({
	addMediaItem: vi.fn(),
	uploadAudioToFal: vi.fn(),
}));

vi.mock("@/lib/ai-clients/fal-ai-client", () => ({
	falAIClient: { uploadAudioToFal },
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: () => ({ addMediaItem }),
	},
}));

function mediaItem({
	file,
	originalUrl,
}: {
	file: File;
	originalUrl?: string;
}): MediaItem {
	return {
		id: "audio",
		name: file.name,
		type: "audio",
		file,
		originalUrl,
	};
}

describe("AI audio media input", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reuses an existing public source URL", async () => {
		const { mediaItemToFalAudioUrl } = await import("../audio-ai-media");
		const url = await mediaItemToFalAudioUrl({
			mediaItem: mediaItem({
				file: new File(["audio"], "voice.wav", { type: "audio/wav" }),
				originalUrl: "https://cdn.example.com/voice.wav",
			}),
		});

		expect(url).toBe("https://cdn.example.com/voice.wav");
		expect(uploadAudioToFal).not.toHaveBeenCalled();
	});

	it("uses FAL storage when a local upload key is available", async () => {
		uploadAudioToFal.mockResolvedValue("https://fal.media/voice.wav");
		const { mediaItemToFalAudioUrl } = await import("../audio-ai-media");
		const file = new File(["audio"], "voice.wav", { type: "audio/wav" });

		await expect(
			mediaItemToFalAudioUrl({ mediaItem: mediaItem({ file }) })
		).resolves.toBe("https://fal.media/voice.wav");
		expect(uploadAudioToFal).toHaveBeenCalledWith(file);
	});

	it("inlines short audio when proxy users have no upload key", async () => {
		uploadAudioToFal.mockRejectedValue(new Error("FAL API key is required"));
		const { mediaItemToFalAudioUrl } = await import("../audio-ai-media");
		const file = new File(["audio"], "voice.wav", { type: "audio/wav" });
		const url = await mediaItemToFalAudioUrl({
			mediaItem: mediaItem({ file }),
		});

		expect(url).toMatch(/^data:audio\/wav;base64,/);
	});

	it("does not inline oversized audio after an upload failure", async () => {
		uploadAudioToFal.mockRejectedValue(new Error("FAL API key is required"));
		const { mediaItemToFalAudioUrl } = await import("../audio-ai-media");
		const file = new File([new Uint8Array(6 * 1024 * 1024 + 1)], "long.wav", {
			type: "audio/wav",
		});

		await expect(
			mediaItemToFalAudioUrl({ mediaItem: mediaItem({ file }) })
		).rejects.toThrow("too large for proxy fallback");
	});

	it("does not add downloaded media after the operation is cancelled", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(new Blob(["audio"])),
			})
		);
		const controller = new AbortController();
		controller.abort();
		const { addRemoteAudioMedia } = await import("../audio-ai-media");

		await expect(
			addRemoteAudioMedia({
				projectId: "project",
				remote: { url: "https://fal.media/result.wav" },
				name: "result.wav",
				duration: 1,
				metadata: { source: "test" },
				signal: controller.signal,
			})
		).rejects.toThrow("cancelled");
		expect(addMediaItem).not.toHaveBeenCalled();
	});
});

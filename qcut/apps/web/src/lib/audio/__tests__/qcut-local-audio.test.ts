import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";

const platformMocks = vi.hoisted(() => ({
	getFileInfo: vi.fn(),
	getPathForFile: vi.fn(),
	saveTemp: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		files: { getFileInfo: platformMocks.getFileInfo },
		getPathForFile: platformMocks.getPathForFile,
		audio: { saveTemp: platformMocks.saveTemp },
	}),
}));

import { createDefaultMediaAudioSettings } from "../audio-properties";
import {
	localDenoiseSettings,
	processQcutLocalDenoise,
} from "../qcut-local-audio";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("QCut local audio preparation", () => {
	it("bakes only denoise so timeline effects are not applied twice", () => {
		const settings = createDefaultMediaAudioSettings();
		settings.volumeDb = 6;
		settings.channelMode = "swap";
		settings.panEnabled = true;
		settings.pan = 0.5;
		settings.pitch = { enabled: true, semitones: 4, preserveFormants: false };
		settings.voiceEnhance = {
			enabled: true,
			clarity: 30,
			warmth: 20,
			presence: 10,
		};
		settings.denoise = {
			enabled: true,
			amount: 40,
			noiseFloorDb: -58,
			mode: "ai",
			status: "processing",
		};

		const local = localDenoiseSettings({ settings });

		expect(local.denoise).toMatchObject({
			enabled: true,
			amount: 65,
			noiseFloorDb: -58,
			mode: "realtime",
		});
		expect(local).toMatchObject({
			volumeDb: 0,
			channelMode: "stereo",
			panEnabled: false,
			pan: 0,
		});
		expect(local.pitch.enabled).toBe(false);
		expect(local.voiceEnhance.enabled).toBe(false);
	});

	it("uses the QCut desktop runtime without a Jianying or cloud dependency", async () => {
		platformMocks.getFileInfo.mockResolvedValue({
			name: "voice.wav",
			path: "/media/voice.wav",
			size: 1_024,
			isDirectory: false,
			modifiedAt: 1,
			createdAt: 1,
		});
		const inspectLocalRuntime = vi.fn().mockResolvedValue({
			runtimeId: "qcut-ffmpeg-audio-v1",
			version: 1,
			provider: "qcut",
			independentFromJianying: true,
			cacheDirectory: "/qcut/cache",
			modelCacheDirectory: "/qcut/models",
			features: [{ id: "spectral-denoise", status: "ready" }],
		});
		const processLocal = vi.fn().mockResolvedValue({
			requestId: "request-1",
			outputPath: "/qcut/cache/result.flac",
			manifestPath: "/qcut/cache/result.json",
			cacheKey: "a".repeat(64),
			cacheHit: true,
			fileSize: 2_048,
			sha256: "b".repeat(64),
			provider: "qcut",
			engine: "qcut-ffmpeg-audio-v1",
		});
		window.electronAPI = {
			audio: {
				inspectLocalRuntime,
				processLocal,
			},
		} as unknown as Window["electronAPI"];
		const mediaItem = {
			id: "media-1",
			name: "voice.wav",
			type: "audio",
			file: new File([new Uint8Array([1])], "voice.wav"),
			localPath: "/media/voice.wav",
		} satisfies MediaItem;

		const result = await processQcutLocalDenoise({
			mediaItem,
			settings: createDefaultMediaAudioSettings(),
			requestId: "request-1",
		});

		expect(result.provider).toBe("qcut");
		expect(inspectLocalRuntime).toHaveBeenCalledOnce();
		expect(processLocal).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: "request-1",
				sourcePath: "/media/voice.wav",
				audio: expect.objectContaining({
					channelMode: "stereo",
					denoise: expect.objectContaining({ enabled: true, amount: 65 }),
				}),
			})
		);
	});

	it("cancels the in-flight local render when the caller aborts", async () => {
		platformMocks.getFileInfo.mockResolvedValue({
			name: "voice.wav",
			path: "/media/voice.wav",
			size: 1_024,
			isDirectory: false,
			modifiedAt: 1,
			createdAt: 1,
		});
		const inspectLocalRuntime = vi.fn().mockResolvedValue({
			runtimeId: "qcut-ffmpeg-audio-v1",
			version: 1,
			provider: "qcut",
			independentFromJianying: true,
			cacheDirectory: "/qcut/cache",
			modelCacheDirectory: "/qcut/models",
			features: [{ id: "spectral-denoise", status: "ready" }],
		});
		const processLocal = vi.fn().mockReturnValue(new Promise(() => {}));
		const cancelLocal = vi.fn().mockResolvedValue(true);
		window.electronAPI = {
			audio: {
				inspectLocalRuntime,
				processLocal,
				cancelLocal,
			},
		} as unknown as Window["electronAPI"];
		const mediaItem = {
			id: "media-1",
			name: "voice.wav",
			type: "audio",
			file: new File([new Uint8Array([1])], "voice.wav"),
			localPath: "/media/voice.wav",
		} satisfies MediaItem;

		const controller = new AbortController();
		const pending = processQcutLocalDenoise({
			mediaItem,
			settings: createDefaultMediaAudioSettings(),
			requestId: "request-2",
			signal: controller.signal,
		});
		await vi.waitFor(() => expect(processLocal).toHaveBeenCalledOnce());
		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(cancelLocal).toHaveBeenCalledWith("request-2");
	});
});

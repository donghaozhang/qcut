import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUDIO_PRESET_STORAGE_KEY,
	BUILT_IN_AUDIO_PRESETS,
	applyAudioPreset,
	createAudioPreset,
	loadCustomAudioPresets,
	persistCustomAudioPresets,
} from "../audio-presets";
import { createDefaultMediaAudioSettings } from "../audio-properties";

describe("audio presets", () => {
	const storage = new Map<string, string>();
	beforeEach(() => {
		storage.clear();
		vi.mocked(localStorage.getItem).mockImplementation(
			(key) => storage.get(key) ?? null
		);
		vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
			storage.set(key, value);
		});
		vi.mocked(localStorage.removeItem).mockImplementation((key) => {
			storage.delete(key);
		});
	});

	it("ships distinct voice, music, and effect presets", () => {
		expect(
			new Set(BUILT_IN_AUDIO_PRESETS.map((preset) => preset.id)).size
		).toBe(BUILT_IN_AUDIO_PRESETS.length);
		expect(
			new Set(BUILT_IN_AUDIO_PRESETS.map((preset) => preset.category))
		).toEqual(new Set(["voice", "music", "effect"]));
	});

	it("removes clip-local and generated data from a custom preset", () => {
		const settings = createDefaultMediaAudioSettings();
		settings.denoise = {
			...settings.denoise,
			enabled: true,
			mode: "ai",
			status: "ready",
			processedMediaId: "clean",
		};
		settings.separation = {
			enabled: true,
			status: "ready",
			stemMediaIds: { vocals: "vocals" },
		};
		settings.lyrics = {
			status: "ready",
			text: "hello",
			words: [
				{
					id: "word",
					text: "hello",
					start: 0,
					end: 1,
					type: "word",
				},
			],
		};
		settings.keyframes = {
			volumeDb: [{ id: "volume", frame: 0, value: 2, easing: "linear" }],
		};

		const preset = createAudioPreset({ settings, name: "My chain" });

		expect(preset.name).toBe("My chain");
		expect(preset.audio.denoise.processedMediaId).toBeUndefined();
		expect(preset.audio.separation).toEqual({
			enabled: false,
			status: "idle",
		});
		expect(preset.audio.lyrics.words).toEqual([]);
		expect(preset.audio.keyframes).toEqual({});
	});

	it("applies processing without replacing envelopes, lyrics, or AI results", () => {
		const settings = createDefaultMediaAudioSettings();
		settings.volumeDb = -4;
		settings.fadeIn = 1.5;
		settings.panEnabled = true;
		settings.pan = -0.25;
		settings.denoise.processedMediaId = "clean";
		settings.denoise.status = "ready";
		settings.separation = {
			enabled: false,
			status: "ready",
			stemMediaIds: { vocals: "vocals" },
		};
		settings.voiceConversion = {
			enabled: false,
			status: "ready",
			sourceMediaId: "voice",
		};
		settings.lyrics = { status: "ready", text: "hello", words: [] };
		settings.keyframes = {
			volumeDb: [{ id: "volume", frame: 0, value: -4, easing: "linear" }],
		};

		const applied = applyAudioPreset({
			settings,
			preset: BUILT_IN_AUDIO_PRESETS[0],
		});

		expect(applied.volumeDb).toBe(-4);
		expect(applied.fadeIn).toBe(1.5);
		expect(applied.pan).toBe(-0.25);
		expect(applied.voiceEnhance.enabled).toBe(true);
		expect(applied.compressor.enabled).toBe(true);
		expect(applied.denoise.processedMediaId).toBe("clean");
		expect(applied.separation.stemMediaIds).toEqual({ vocals: "vocals" });
		expect(applied.voiceConversion.sourceMediaId).toBe("voice");
		expect(applied.lyrics.text).toBe("hello");
		expect(applied.keyframes?.volumeDb).toHaveLength(1);
	});

	it("persists and reloads custom presets", () => {
		const preset = createAudioPreset({
			settings: createDefaultMediaAudioSettings(),
			name: "Saved",
		});
		persistCustomAudioPresets({ presets: [preset] });

		expect(loadCustomAudioPresets()).toEqual([preset]);
		expect(localStorage.getItem(AUDIO_PRESET_STORAGE_KEY)).toContain("Saved");
	});
});

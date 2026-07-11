import { describe, expect, it } from "vitest";
import {
	MASTER_AUDIO_BUS_ID,
	createDefaultProjectAudioMixSettings,
	createDefaultTrackAudioSettings,
	normalizeProjectAudioMixSettings,
	normalizeTrackAudioSettings,
} from "../audio-mix-settings";

describe("audio mix settings", () => {
	it("creates neutral track and master processing defaults", () => {
		const track = createDefaultTrackAudioSettings();
		const project = createDefaultProjectAudioMixSettings();

		expect(track).toMatchObject({
			gainDb: 0,
			pan: 0,
			solo: false,
			busId: MASTER_AUDIO_BUS_ID,
			ducking: { enabled: false, sourceTrackIds: [] },
			autoCrossfade: { enabled: false, curve: "equal-power" },
		});
		expect(project.master).toMatchObject({
			id: MASTER_AUDIO_BUS_ID,
			name: "Master",
			gainDb: 0,
			muted: false,
		});
		expect(project.buses).toEqual([]);
	});

	it("normalizes partial legacy track settings without sharing arrays", () => {
		const first = normalizeTrackAudioSettings({
			audio: {
				gainDb: 30,
				ducking: {
					enabled: true,
					sourceTrackIds: ["voice", "voice", ""],
					thresholdDb: -24,
					reductionDb: -10,
					attackMs: 50,
					releaseMs: 250,
				},
			},
		});
		const second = normalizeTrackAudioSettings({});

		expect(first.gainDb).toBe(12);
		expect(first.ducking.sourceTrackIds).toEqual(["voice"]);
		first.effects.parametricEqualizer.bands[0].gainDb = 6;
		expect(second.effects.parametricEqualizer.bands[0].gainDb).toBe(0);
	});

	it("keeps one master and removes duplicate custom bus ids", () => {
		const defaultMaster = createDefaultProjectAudioMixSettings().master;
		const mix = normalizeProjectAudioMixSettings({
			audioMix: {
				master: { ...defaultMaster, gainDb: -3 },
				buses: [
					{ ...defaultMaster, id: "dialogue", name: "Dialogue" },
					{ ...defaultMaster, id: "dialogue", name: "Duplicate" },
				],
			},
		});

		expect(mix.master.id).toBe(MASTER_AUDIO_BUS_ID);
		expect(mix.master.gainDb).toBe(-3);
		expect(mix.buses.map((bus) => bus.id)).toEqual(["dialogue"]);
	});
});

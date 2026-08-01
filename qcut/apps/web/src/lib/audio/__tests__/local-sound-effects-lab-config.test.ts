import { describe, expect, it } from "vitest";
import { buildLocalSoundEffectsLabSource } from "../local-sound-effects-lab-config";

describe("local Sound Effects Lab config", () => {
	it("is fail-closed without the explicit enable flag", () => {
		expect(
			buildLocalSoundEffectsLabSource({
				isEnabled: false,
				manifestPath: "/tmp/sound-effects-lab.json",
			})
		).toBeNull();
	});

	it("reports an enabled lab with no manifest path", () => {
		expect(buildLocalSoundEffectsLabSource({ isEnabled: true })).toEqual({
			kind: "missing-manifest",
		});
	});

	it("trims the local manifest path", () => {
		expect(
			buildLocalSoundEffectsLabSource({
				isEnabled: true,
				manifestPath: " /tmp/sound-effects-lab.json ",
			})
		).toEqual({
			kind: "manifest",
			manifestPath: "/tmp/sound-effects-lab.json",
		});
	});
});

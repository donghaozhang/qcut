import { describe, expect, it } from "vitest";
import {
	KEYBINDING_PROFILES,
	KEYBINDING_PROFILE_IDS,
} from "../keybinding-profiles";

describe("keybinding profiles", () => {
	it("provides every supported editor profile", () => {
		expect(KEYBINDING_PROFILES.map((profile) => profile.id)).toEqual(
			KEYBINDING_PROFILE_IDS
		);
	});

	it.each(
		KEYBINDING_PROFILES
	)("$name includes professional timeline navigation", (profile) => {
		expect(profile.keybindings[","]).toBe("frame-step-backward");
		expect(profile.keybindings["."]).toBe("frame-step-forward");
		expect(profile.keybindings["-"]).toBe("zoom-timeline-out");
		expect(profile.keybindings["="]).toBe("zoom-timeline-in");
		expect(Object.values(profile.keybindings)).toContain(
			"trim-start-to-playhead"
		);
		expect(Object.values(profile.keybindings)).toContain(
			"trim-end-to-playhead"
		);
	});

	it("maps the visible QCut and CapCut crop shortcut to the crop action", () => {
		const qcutProfile = KEYBINDING_PROFILES.find(
			(profile) => profile.id === "qcut"
		);
		const capcutProfile = KEYBINDING_PROFILES.find(
			(profile) => profile.id === "capcut"
		);

		expect(qcutProfile?.keybindings.c).toBe("crop-selected");
		expect(capcutProfile?.keybindings.c).toBe("crop-selected");
	});
});

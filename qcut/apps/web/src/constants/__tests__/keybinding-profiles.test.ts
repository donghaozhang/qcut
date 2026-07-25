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
});

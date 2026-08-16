import { describe, expect, it } from "vitest";
import {
	getKeybindingProfile,
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

	it("matches Jianying's timeline and player shortcuts on the CapCut profile", () => {
		const capcut = getKeybindingProfile({ id: "capcut" }).keybindings;

		// 时间线
		expect(capcut["ctrl+b"]).toBe("split-element");
		expect(capcut.q).toBe("trim-start-to-playhead");
		expect(capcut.w).toBe("trim-end-to-playhead");
		expect(capcut.a).toBe("edit-mode-select");
		expect(capcut.n).toBe("toggle-snapping");
		expect(capcut.p).toBe("toggle-main-track-magnet");
		expect(capcut["`"]).toBe("toggle-linked-ripple");
		// ⌘+ arrives as ctrl+shift+= on a US layout, so both forms are bound.
		expect(capcut["ctrl+="]).toBe("zoom-timeline-in");
		expect(capcut["ctrl+shift+="]).toBe("zoom-timeline-in");
		expect(capcut["ctrl+-"]).toBe("zoom-timeline-out");
		expect(capcut["alt+shift+k"]).toBe("add-keyframe");

		// 播放器
		expect(capcut["alt+shift+="]).toBe("player-zoom-in");
		expect(capcut["alt+shift+-"]).toBe("player-zoom-out");
		expect(capcut["alt+shift+z"]).toBe("player-zoom-fit");

		// 基础
		expect(capcut["ctrl+shift+c"]).toBe("copy-attributes-selected");
		expect(capcut["ctrl+shift+v"]).toBe("paste-attributes-selected");
	});

	it("keeps the bare zoom aliases and bracket trims alongside the Jianying keys", () => {
		const capcut = getKeybindingProfile({ id: "capcut" }).keybindings;
		expect(capcut["="]).toBe("zoom-timeline-in");
		expect(capcut["-"]).toBe("zoom-timeline-out");
		expect(capcut["["]).toBe("trim-start-to-playhead");
		expect(capcut["]"]).toBe("trim-end-to-playhead");
	});
});

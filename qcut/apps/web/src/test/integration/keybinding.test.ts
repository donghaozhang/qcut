import { describe, it, expect, beforeEach } from "vitest";
import {
	useKeybindingsStore,
	defaultKeybindings,
	generateKeybindingString,
	migrateKeybindingsState,
} from "@/stores/editor/keybindings-store";

describe("Keybinding", () => {
	beforeEach(() => {
		const store = useKeybindingsStore.getState();
		store.resetToDefaults();
	});

	it("registers default keybinding", () => {
		const store = useKeybindingsStore.getState();
		expect(store.keybindings.space).toBe("toggle-play");
		expect(store.keybindings.j).toBe("seek-backward");
		expect(store.keybindings.k).toBe("toggle-play");
		expect(store.keybindings["ctrl+c"]).toBe("copy-selected");
		expect(store.keybindings["ctrl+x"]).toBe("cut-selected");
		expect(store.keybindings["ctrl+v"]).toBe("paste-clipboard");
		expect(store.keybindings["ctrl+shift+c"]).toBe("copy-attributes-selected");
		expect(store.keybindings["ctrl+shift+v"]).toBe("paste-attributes-selected");
	});

	it("updates custom keybinding", () => {
		const store = useKeybindingsStore.getState();
		store.updateKeybinding("a", "split-element");

		// Check the keybinding was updated
		const updatedStore = useKeybindingsStore.getState();
		expect(updatedStore.keybindings.a).toBe("split-element");
	});

	it("resets to default keybindings", () => {
		const store = useKeybindingsStore.getState();
		store.updateKeybinding("space", "stop-playback");
		store.resetToDefaults();

		expect(useKeybindingsStore.getState().keybindings.space).toBe(
			"toggle-play"
		);
		expect(useKeybindingsStore.getState().activeProfileId).toBe("qcut");
	});

	it("switches profiles and marks manual edits as custom", () => {
		const store = useKeybindingsStore.getState();
		store.applyProfile("premiere-pro");
		expect(useKeybindingsStore.getState().keybindings["ctrl+k"]).toBe(
			"split-element"
		);
		expect(useKeybindingsStore.getState().activeProfileId).toBe("premiere-pro");

		useKeybindingsStore
			.getState()
			.updateKeybinding("b", "trim-start-to-playhead");
		expect(useKeybindingsStore.getState().activeProfileId).toBe("custom");
	});

	it.each([
		["BracketLeft", "[", "trim-start-to-playhead"],
		["BracketRight", "]", "trim-end-to-playhead"],
		["Comma", ",", "frame-step-backward"],
		["Minus", "-", "zoom-timeline-out"],
		["Equal", "=", "zoom-timeline-in"],
	] as const)("parses the %s editing key", (code, key, action) => {
		const event = new KeyboardEvent("keydown", { code, key });
		const binding = generateKeybindingString(event);

		expect(binding).toBe(key);
		expect(defaultKeybindings[binding!]).toBe(action);
	});

	it.each([
		"qcut",
		"capcut",
	] as const)("adds the crop shortcut when migrating the %s profile to version 4", (activeProfileId) => {
		const migrated = migrateKeybindingsState({
			persistedState: {
				activeProfileId,
				isCustomized: false,
				keybindings: { space: "toggle-play" },
			},
			version: 3,
		});

		expect(migrated.keybindings).toMatchObject({
			space: "toggle-play",
			c: "crop-selected",
		});
	});

	it("preserves customized crop bindings during version 4 migration", () => {
		const migrated = migrateKeybindingsState({
			persistedState: {
				activeProfileId: "custom",
				isCustomized: true,
				keybindings: { c: "split-element" },
			},
			version: 3,
		});

		expect(migrated.keybindings?.c).toBe("split-element");
	});
});

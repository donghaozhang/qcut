import { describe, expect, it } from "vitest";
import {
	parseKeybindingExport,
	serializeKeybindingExport,
} from "../keybinding-transfer";

describe("keybinding transfer", () => {
	it("round-trips a profile-aware shortcut file", () => {
		const text = serializeKeybindingExport({
			profileId: "final-cut-pro",
			keybindings: {
				"ctrl+b": "split-element",
				"[": "trim-start-to-playhead",
			},
		});

		expect(parseKeybindingExport({ text })).toEqual({
			version: 1,
			profileId: "final-cut-pro",
			keybindings: {
				"ctrl+b": "split-element",
				"[": "trim-start-to-playhead",
			},
		});
	});

	it("imports legacy raw keybinding objects as custom", () => {
		expect(
			parseKeybindingExport({
				text: JSON.stringify({ space: "toggle-play" }),
			})
		).toEqual({
			version: 1,
			profileId: "custom",
			keybindings: { space: "toggle-play" },
		});
	});

	it("rejects unknown actions", () => {
		expect(() =>
			parseKeybindingExport({
				text: JSON.stringify({ keybindings: { x: "destroy-project" } }),
			})
		).toThrow("Invalid keybinding entry");
	});
});

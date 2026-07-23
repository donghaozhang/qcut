import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor/editor-store";

describe("editor canvas store", () => {
	beforeEach(() => {
		useEditorStore.setState({
			canvasSize: { width: 1920, height: 1080 },
			canvasMode: "preset",
		});
	});

	it("restores a persisted canvas mode with its dimensions", () => {
		useEditorStore
			.getState()
			.setCanvasSize({ width: 1080, height: 1920 }, "custom");

		expect(useEditorStore.getState().canvasSize).toEqual({
			width: 1080,
			height: 1920,
		});
		expect(useEditorStore.getState().canvasMode).toBe("custom");
	});

	it("keeps preset as the default mode for existing callers", () => {
		useEditorStore.getState().setCanvasSize({ width: 1080, height: 1080 });

		expect(useEditorStore.getState().canvasMode).toBe("preset");
	});
});

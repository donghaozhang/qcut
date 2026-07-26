import { beforeEach, describe, expect, it } from "vitest";
import {
	DEFAULT_CANVAS_OPTIONS,
	getDefaultCanvasOption,
	useAppSettingsStore,
} from "../app-settings-store";

describe("app settings store", () => {
	beforeEach(() => {
		useAppSettingsStore.setState({
			defaultCanvasId: "1080p",
			defaultFps: 30,
			timecodeFormat: "HH:MM:SS:FF",
			autoCanvasFromFirstMedia: true,
			exportCompletionSound: false,
		});
	});

	it("ships JianYing-parity defaults", () => {
		const state = useAppSettingsStore.getState();
		expect(getDefaultCanvasOption(state.defaultCanvasId)).toMatchObject({
			width: 1920,
			height: 1080,
		});
		expect(state.defaultFps).toBe(30);
		expect(state.timecodeFormat).toBe("HH:MM:SS:FF");
		expect(state.autoCanvasFromFirstMedia).toBe(true);
		expect(state.exportCompletionSound).toBe(false);
	});

	it("updates every setting through its setter", () => {
		const state = useAppSettingsStore.getState();
		state.setDefaultCanvasId("vertical");
		state.setDefaultFps(60);
		state.setTimecodeFormat("MM:SS");
		state.setAutoCanvasFromFirstMedia(false);
		state.setExportCompletionSound(true);

		const next = useAppSettingsStore.getState();
		expect(next.defaultCanvasId).toBe("vertical");
		expect(getDefaultCanvasOption(next.defaultCanvasId)).toMatchObject({
			width: 1080,
			height: 1920,
		});
		expect(next.defaultFps).toBe(60);
		expect(next.timecodeFormat).toBe("MM:SS");
		expect(next.autoCanvasFromFirstMedia).toBe(false);
		expect(next.exportCompletionSound).toBe(true);
	});

	it("falls back to 1080p for unknown canvas ids", () => {
		expect(getDefaultCanvasOption("nonsense")).toBe(DEFAULT_CANVAS_OPTIONS[0]);
	});
});

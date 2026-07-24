import { beforeEach, describe, expect, it } from "vitest";
import { useScreenRecordingPreferencesStore } from "@/stores/screen-recording-preferences-store";

describe("screen recording preferences store", () => {
	beforeEach(() => {
		useScreenRecordingPreferencesStore.setState({
			captureMode: "editor",
			qualityPreset: "native",
		});
	});

	it("defaults to native full-editor capture", () => {
		const state = useScreenRecordingPreferencesStore.getState();
		expect(state.captureMode).toBe("editor");
		expect(state.qualityPreset).toBe("native");
	});

	it("updates capture mode and output quality independently", () => {
		const state = useScreenRecordingPreferencesStore.getState();
		state.setCaptureMode({ captureMode: "preview" });
		state.setQualityPreset({ qualityPreset: "2160p" });

		expect(useScreenRecordingPreferencesStore.getState()).toMatchObject({
			captureMode: "preview",
			qualityPreset: "2160p",
		});
	});
});

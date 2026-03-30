import { describe, it, expect, beforeEach } from "vitest";
import { useScreenRecordingEnhancementStore } from "../screen-recording-store";

describe("screen-recording-store — audio & loop fields", () => {
	beforeEach(() => {
		const store = useScreenRecordingEnhancementStore.getState();
		// Reset to defaults
		store.setCursorLoopMode(false);
		store.setMicEnabled(false);
		store.setMicDeviceId(null);
		store.setMicGain(1.4);
		store.setSystemAudioEnabled(true);
	});

	it("has cursorLoopMode defaulting to false", () => {
		const state = useScreenRecordingEnhancementStore.getState();
		expect(state.cursorLoopMode).toBe(false);
	});

	it("sets cursorLoopMode", () => {
		const store = useScreenRecordingEnhancementStore.getState();
		store.setCursorLoopMode(true);
		expect(useScreenRecordingEnhancementStore.getState().cursorLoopMode).toBe(
			true
		);
	});

	it("has micEnabled defaulting to false", () => {
		const state = useScreenRecordingEnhancementStore.getState();
		expect(state.micEnabled).toBe(false);
	});

	it("sets micEnabled", () => {
		const store = useScreenRecordingEnhancementStore.getState();
		store.setMicEnabled(true);
		expect(useScreenRecordingEnhancementStore.getState().micEnabled).toBe(true);
	});

	it("has micDeviceId defaulting to null", () => {
		const state = useScreenRecordingEnhancementStore.getState();
		expect(state.micDeviceId).toBeNull();
	});

	it("sets micDeviceId", () => {
		const store = useScreenRecordingEnhancementStore.getState();
		store.setMicDeviceId("device-123");
		expect(useScreenRecordingEnhancementStore.getState().micDeviceId).toBe(
			"device-123"
		);
	});

	it("has micGain defaulting to 1.4", () => {
		const state = useScreenRecordingEnhancementStore.getState();
		expect(state.micGain).toBe(1.4);
	});

	it("clamps micGain to 0–5 range", () => {
		const store = useScreenRecordingEnhancementStore.getState();
		store.setMicGain(-1);
		expect(useScreenRecordingEnhancementStore.getState().micGain).toBe(0);

		store.setMicGain(10);
		expect(useScreenRecordingEnhancementStore.getState().micGain).toBe(5);

		store.setMicGain(2.5);
		expect(useScreenRecordingEnhancementStore.getState().micGain).toBe(2.5);
	});

	it("has systemAudioEnabled defaulting to true", () => {
		const state = useScreenRecordingEnhancementStore.getState();
		expect(state.systemAudioEnabled).toBe(true);
	});

	it("sets systemAudioEnabled", () => {
		const store = useScreenRecordingEnhancementStore.getState();
		store.setSystemAudioEnabled(false);
		expect(
			useScreenRecordingEnhancementStore.getState().systemAudioEnabled
		).toBe(false);
	});
});

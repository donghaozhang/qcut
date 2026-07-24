import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScreenRecordingControl } from "../screen-recording-control";
import { useLocaleStore } from "@/stores/locale-store";
import { useScreenRecordingPreferencesStore } from "@/stores/screen-recording-preferences-store";

const { idleStatus } = vi.hoisted(() => ({
	idleStatus: {
		state: "idle" as const,
		recording: false,
		sessionId: null,
		sourceId: null,
		sourceName: null,
		filePath: null,
		bytesWritten: 0,
		startedAt: null,
		durationMs: 0,
		mimeType: null,
	},
}));

vi.mock("@/hooks/use-error-reporter", () => ({
	useErrorReporter: () => vi.fn(),
}));

vi.mock("@/lib/project/screen-recording-controller", () => ({
	getCachedScreenRecordingStatus: () => idleStatus,
	getScreenRecordingStatus: async () => idleStatus,
	registerScreenRecordingE2EBridge: vi.fn(),
	startScreenRecording: vi.fn(),
	stopScreenRecording: vi.fn(),
	subscribeToScreenRecordingStatus: () => vi.fn(),
}));

vi.mock("@/lib/screen-recording/audio-capture", () => ({
	getAudioInputDevices: async () => [],
}));

describe("ScreenRecordingControl", () => {
	beforeEach(() => {
		useLocaleStore.setState({ locale: "en" });
		useScreenRecordingPreferencesStore.setState({
			captureMode: "editor",
			qualityPreset: "native",
		});
	});

	it("lets the user choose HD preview and 4K output independently", async () => {
		render(<ScreenRecordingControl />);

		fireEvent.pointerDown(
			screen.getByTestId("screen-recording-settings-button"),
			{ button: 0, ctrlKey: false }
		);
		fireEvent.click(
			await screen.findByRole("menuitemradio", { name: "HD preview" })
		);

		fireEvent.pointerDown(
			screen.getByTestId("screen-recording-settings-button"),
			{ button: 0, ctrlKey: false }
		);
		fireEvent.click(await screen.findByRole("menuitemradio", { name: /4K/ }));

		expect(useScreenRecordingPreferencesStore.getState()).toMatchObject({
			captureMode: "preview",
			qualityPreset: "2160p",
		});
	});
});

import { describe, expect, it } from "vitest";
import { normalizeScreenRecordingCaptureMode } from "../screen-recording-capture-mode";

describe("screen recording capture mode", () => {
	it("defaults to the editor", () => {
		expect(normalizeScreenRecordingCaptureMode({})).toBe("editor");
	});

	it("normalizes preview aliases", () => {
		expect(normalizeScreenRecordingCaptureMode({ value: "fullscreen" })).toBe(
			"preview"
		);
		expect(normalizeScreenRecordingCaptureMode({ value: "video" })).toBe(
			"preview"
		);
	});

	it("rejects unknown capture modes", () => {
		expect(() =>
			normalizeScreenRecordingCaptureMode({ value: "display" })
		).toThrow('Unsupported recording capture mode "display"');
	});
});

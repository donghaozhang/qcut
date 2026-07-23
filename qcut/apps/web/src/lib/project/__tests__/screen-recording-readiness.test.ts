import { describe, expect, it } from "vitest";
import { waitForFirstRecordingChunk } from "../screen-recording-readiness";

describe("screen recording readiness", () => {
	it("resolves only after a non-empty chunk has been persisted", async () => {
		let elapsedMs = 0;
		let checks = 0;

		const result = await waitForFirstRecordingChunk({
			getSnapshot: () => ({
				bytesWritten: checks++ >= 2 ? 4096 : 0,
				error: null,
				recorderState: "recording",
			}),
			now: () => elapsedMs,
			wait: async (durationMs) => {
				elapsedMs += durationMs;
			},
			intervalMs: 10,
			timeoutMs: 100,
		});

		expect(result).toEqual({ bytesWritten: 4096, readyAt: 20 });
	});

	it("surfaces chunk write failures instead of reporting recording ready", async () => {
		const writeError = new Error("disk full");

		await expect(
			waitForFirstRecordingChunk({
				getSnapshot: () => ({
					bytesWritten: 0,
					error: writeError,
					recorderState: "recording",
				}),
			})
		).rejects.toThrow("disk full");
	});
});

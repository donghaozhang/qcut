import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyRecordingArtifact } from "../native-pipeline/editor/editor-recording-verification.js";

let tempDir = "";

afterEach(() => {
	if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	tempDir = "";
});

describe("editor recording verification", () => {
	it("accepts a recording whose probed duration covers the capture lifecycle", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "qcut-recording-"));
		const outputPath = join(tempDir, "demo.mp4");
		writeFileSync(outputPath, Buffer.from([1, 2, 3]));
		const probeDuration = vi.fn(async () => 2_950);

		const result = await verifyRecordingArtifact({
			filePath: outputPath,
			expectedDurationMs: 3_000,
			toleranceMs: 100,
			probeDuration,
		});

		expect(result.durationVerified).toBe(true);
		expect(result.durationShortfallMs).toBe(50);
		expect(result.resolutionVerified).toBe(false);
	});

	it("rejects a recording with a truncated tail", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "qcut-recording-"));
		const outputPath = join(tempDir, "demo.mp4");
		writeFileSync(outputPath, Buffer.from([1, 2, 3]));

		await expect(
			verifyRecordingArtifact({
				filePath: outputPath,
				expectedDurationMs: 3_000,
				toleranceMs: 200,
				probeDuration: async () => 2_500,
			})
		).rejects.toThrow("500ms shorter");
	});

	it("accepts a full-HD recording when resolution verification is enabled", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "qcut-recording-"));
		const outputPath = join(tempDir, "demo.mp4");
		writeFileSync(outputPath, Buffer.from([1, 2, 3]));

		const result = await verifyRecordingArtifact({
			filePath: outputPath,
			verifyDuration: false,
			verifyResolution: true,
			probeVideo: async () => ({ width: 1920, height: 1080 }),
		});

		expect(result).toMatchObject({
			actualWidth: 1920,
			actualHeight: 1080,
			minimumWidth: 1920,
			minimumHeight: 1080,
			resolutionVerified: true,
		});
	});

	it("rejects a recording below the configured minimum resolution", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "qcut-recording-"));
		const outputPath = join(tempDir, "demo.mp4");
		writeFileSync(outputPath, Buffer.from([1, 2, 3]));

		await expect(
			verifyRecordingArtifact({
				filePath: outputPath,
				verifyDuration: false,
				verifyResolution: true,
				probeVideo: async () => ({ width: 1280, height: 720 }),
			})
		).rejects.toThrow("minimum is 1920x1080");
	});
});

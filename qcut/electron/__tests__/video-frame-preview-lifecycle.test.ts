import type { ChildProcess } from "child_process";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	spawn: vi.fn(),
	cleanup: vi.fn(),
}));

vi.mock("child_process", async (importOriginal) => {
	const original = await importOriginal<typeof import("child_process")>();
	return {
		...original,
		default: { ...original, spawn: mocks.spawn },
		spawn: mocks.spawn,
	};
});

vi.mock("../ffmpeg/utils", () => ({
	getFFmpegPath: () => "/mock/ffmpeg",
}));

vi.mock("../ffmpeg/filter-complex-script", () => ({
	prepareFFmpegFilterComplexScripts: ({ args }: { args: string[] }) => ({
		args,
		scriptPaths: ["/mock/filter.ffscript"],
		cleanup: mocks.cleanup,
	}),
}));

import {
	cancelVideoFramePreview,
	clearVideoFramePreviewCache,
	renderVideoFramePreview,
} from "../ffmpeg/video-frame-preview";
import type { VideoFramePreviewOptions } from "../ffmpeg/types";

interface FakeChildProcess extends EventEmitter {
	kill: ReturnType<typeof vi.fn>;
	stderr: EventEmitter;
	stdout: EventEmitter;
}

function createFakeChildProcess(): FakeChildProcess {
	const process = new EventEmitter() as FakeChildProcess;
	process.stdout = new EventEmitter();
	process.stderr = new EventEmitter();
	process.kill = vi.fn(() => true);
	return process;
}

function previewOptions({
	requestId,
	sourcePath,
}: {
	requestId: string;
	sourcePath: string;
}): VideoFramePreviewOptions {
	return {
		requestId,
		sourcePath,
		sourceTime: 0,
		width: 320,
		height: 180,
		fps: 30,
		fitMode: "contain",
		enhancements: {
			stabilization: 0,
			denoise: 0,
			clarity: 0,
			upscale: 1,
			relight: 0,
			beauty: 0,
		},
	};
}

describe("video frame preview process lifecycle", () => {
	afterEach(() => {
		clearVideoFramePreviewCache();
		mocks.spawn.mockReset();
		mocks.cleanup.mockReset();
		vi.useRealTimers();
	});

	it("waits for close before cleanup and retries a transient removal failure", async () => {
		vi.useFakeTimers();
		const tempDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-preview-lifecycle-")
		);
		const sourcePath = path.join(tempDirectory, "source.mp4");
		fs.writeFileSync(sourcePath, "fixture");
		const process = createFakeChildProcess();
		mocks.spawn.mockReturnValue(process as unknown as ChildProcess);
		mocks.cleanup.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		try {
			const renderPromise = renderVideoFramePreview({
				options: previewOptions({
					requestId: "timeout-request",
					sourcePath,
				}),
			});
			const rejection = expect(renderPromise).rejects.toThrow(
				"Video frame preview timed out"
			);

			await vi.advanceTimersByTimeAsync(20_000);
			expect(process.kill).toHaveBeenCalledTimes(1);
			expect(mocks.cleanup).not.toHaveBeenCalled();

			process.emit("close", null, "SIGTERM");
			await Promise.resolve();
			expect(mocks.cleanup).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(100);
			await rejection;
			expect(mocks.cleanup).toHaveBeenCalledTimes(2);
		} finally {
			fs.rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("settles after the close grace period when the child never closes", async () => {
		vi.useFakeTimers();
		const tempDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-preview-lifecycle-")
		);
		const sourcePath = path.join(tempDirectory, "source.mp4");
		fs.writeFileSync(sourcePath, "fixture");
		const process = createFakeChildProcess();
		mocks.spawn.mockReturnValue(process as unknown as ChildProcess);
		mocks.cleanup.mockResolvedValue(true);

		try {
			const renderPromise = renderVideoFramePreview({
				options: previewOptions({
					requestId: "never-close-request",
					sourcePath,
				}),
			});
			const rejection = expect(renderPromise).rejects.toThrow(
				"Video frame preview timed out"
			);

			await vi.advanceTimersByTimeAsync(20_000);
			expect(process.kill).toHaveBeenCalledTimes(1);
			expect(mocks.cleanup).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1_000);
			await rejection;
			expect(process.kill).toHaveBeenCalledTimes(2);
			expect(process.kill).toHaveBeenNthCalledWith(1);
			expect(process.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
			expect(
				cancelVideoFramePreview({ requestId: "never-close-request" })
			).toBe(false);
			expect(mocks.cleanup).not.toHaveBeenCalled();
		} finally {
			fs.rmSync(tempDirectory, { recursive: true, force: true });
		}
	});

	it("defers cleanup until a child that rejected kill eventually closes", async () => {
		vi.useFakeTimers();
		const tempDirectory = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-preview-lifecycle-")
		);
		const sourcePath = path.join(tempDirectory, "source.mp4");
		fs.writeFileSync(sourcePath, "fixture");
		const process = createFakeChildProcess();
		process.kill.mockReturnValue(false);
		mocks.spawn.mockReturnValue(process as unknown as ChildProcess);
		mocks.cleanup.mockResolvedValue(true);

		try {
			const renderPromise = renderVideoFramePreview({
				options: previewOptions({
					requestId: "kill-false-request",
					sourcePath,
				}),
			});
			const rejection = expect(renderPromise).rejects.toThrow(
				"Video frame preview timed out"
			);

			await vi.advanceTimersByTimeAsync(21_000);
			await rejection;
			expect(process.kill).toHaveBeenCalledTimes(2);
			expect(process.kill).toHaveBeenNthCalledWith(1);
			expect(process.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
			expect(cancelVideoFramePreview({ requestId: "kill-false-request" })).toBe(
				false
			);
			expect(mocks.cleanup).not.toHaveBeenCalled();

			process.emit("close", 0, null);
			await Promise.resolve();
			expect(mocks.cleanup).toHaveBeenCalledTimes(1);
		} finally {
			fs.rmSync(tempDirectory, { recursive: true, force: true });
		}
	});
});

import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { AudioFile, ExportOptions } from "../ffmpeg/types";

const mocks = vi.hoisted(() => ({
	normalizeVideo: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("child_process", () => ({
	default: { spawn: mocks.spawn },
	spawn: mocks.spawn,
}));

vi.mock("../ffmpeg/utils", () => ({
	getFFprobePath: vi.fn(() => "/mock/ffprobe"),
	normalizeVideo: mocks.normalizeVideo,
	parseProgress: vi.fn(() => null),
}));

import { handleMode1_5 } from "../ffmpeg-export-mode15";

type StickerPassBehavior =
	| "error-then-close"
	| "fail"
	| "success"
	| "success-without-output";

function createProcess({
	code,
	beforeClose,
	errorBeforeClose,
}: {
	code: number;
	beforeClose?: () => void;
	errorBeforeClose?: Error;
}): ChildProcess {
	const process = new EventEmitter() as EventEmitter & {
		stderr: EventEmitter;
		stdout: EventEmitter;
	};
	process.stderr = new EventEmitter();
	process.stdout = new EventEmitter();
	queueMicrotask(() => {
		beforeClose?.();
		if (errorBeforeClose) {
			process.emit("error", errorBeforeClose);
		}
		process.emit("close", code);
	});
	return process as unknown as ChildProcess;
}

describe("Mode 1.5 pass recovery", () => {
	let temporaryRoot: string;
	let outputFile: string;
	let sourceFile: string;
	let stickerFile: string;
	let audioFile: string;
	let stickerPassBehavior: StickerPassBehavior;
	let audioSpawnArgs: string[];
	let stickerSpawnArgs: string[];
	let stickerScriptExistedBeforeClose: boolean;

	beforeEach(() => {
		temporaryRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-mode15-pass-test-")
		);
		outputFile = path.join(temporaryRoot, "output.mp4");
		sourceFile = path.join(temporaryRoot, "source.mp4");
		stickerFile = path.join(temporaryRoot, "sticker.png");
		audioFile = path.join(temporaryRoot, "overlay.mp3");
		stickerPassBehavior = "fail";
		audioSpawnArgs = [];
		stickerSpawnArgs = [];
		stickerScriptExistedBeforeClose = false;
		fs.writeFileSync(sourceFile, "source");
		fs.writeFileSync(stickerFile, "sticker");
		fs.writeFileSync(audioFile, "audio");

		mocks.normalizeVideo.mockImplementation(
			async (_inputPath: string, normalizedPath: string) => {
				fs.writeFileSync(normalizedPath, "normalized");
			}
		);
		mocks.spawn.mockImplementation((_executable: string, args: string[]) => {
			const spawnedOutput = args.at(-1);
			if (!spawnedOutput) {
				throw new Error("Expected FFmpeg output argument");
			}
			if (_executable === "/mock/ffprobe") {
				return createProcess({ code: 0 });
			}
			if (args.includes("concat")) {
				return createProcess({
					code: 0,
					beforeClose: () => {
						fs.writeFileSync(spawnedOutput, "original-output");
					},
				});
			}
			if (args.includes(audioFile)) {
				audioSpawnArgs = args;
				return createProcess({
					code: 0,
					beforeClose: () => {
						fs.writeFileSync(spawnedOutput, "audio-output");
					},
				});
			}
			stickerSpawnArgs = args;
			const filterScriptIndex = args.indexOf("-filter_complex_script");
			if (filterScriptIndex >= 0) {
				const filterScriptPath = args[filterScriptIndex + 1];
				stickerScriptExistedBeforeClose =
					typeof filterScriptPath === "string" &&
					fs.existsSync(filterScriptPath);
			}
			if (stickerPassBehavior === "success-without-output") {
				return createProcess({ code: 0 });
			}
			if (stickerPassBehavior === "success") {
				return createProcess({
					code: 0,
					beforeClose: () => {
						fs.writeFileSync(spawnedOutput, "sticker-output");
					},
				});
			}
			if (stickerPassBehavior === "error-then-close") {
				return createProcess({
					code: 23,
					errorBeforeClose: new Error("spawn error"),
				});
			}
			return createProcess({
				code: 23,
				beforeClose: () => {
					fs.writeFileSync(spawnedOutput, "partial-output");
				},
			});
		});
		vi.spyOn(console, "log").mockImplementation(() => undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	});

	function options({
		denseKeyframes = false,
		includeSticker = true,
	}: {
		denseKeyframes?: boolean;
		includeSticker?: boolean;
	} = {}): ExportOptions {
		const keyframes = denseKeyframes
			? Array.from({ length: 121 }, (_, frame) => ({
					id: `dense-${frame}`,
					frame,
					value: 20 + Math.sin(frame / 10),
					easing: "linear" as const,
				}))
			: undefined;
		return {
			sessionId: "mode15-pass-test",
			width: 96,
			height: 64,
			fps: 30,
			quality: "medium",
			duration: 1,
			videoSources: [
				{
					path: sourceFile,
					startTime: 0,
					duration: 1,
				},
			],
			stickerSources: includeSticker
				? [
						{
							id: "sticker",
							path: stickerFile,
							x: 0,
							y: 0,
							width: 20,
							height: 20,
							startTime: 0,
							endTime: 1,
							zIndex: 1,
							keyframeFps: denseKeyframes ? 120 : undefined,
							keyframes: keyframes
								? {
										x: keyframes,
										y: keyframes,
										width: keyframes,
										height: keyframes,
										rotation: keyframes,
									}
								: undefined,
						},
					]
				: undefined,
		};
	}

	async function runExport({
		resolve,
		reject,
		exportOptions = options(),
		audioFiles = [],
	}: {
		resolve: ReturnType<typeof vi.fn>;
		reject: ReturnType<typeof vi.fn>;
		exportOptions?: ExportOptions;
		audioFiles?: AudioFile[];
	}): Promise<void> {
		await handleMode1_5(
			exportOptions,
			"/mock/ffmpeg",
			temporaryRoot,
			outputFile,
			96,
			64,
			30,
			audioFiles,
			{ sender: { send: vi.fn() } } as unknown as IpcMainInvokeEvent,
			resolve,
			reject
		);
	}

	it("propagates a restore failure without retrying the rename", async () => {
		const realRename = fs.renameSync.bind(fs);
		let restoreAttempts = 0;
		vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
			if (String(from).endsWith("before_stickers.mp4")) {
				restoreAttempts += 1;
				throw new Error("transient lock");
			}
			return realRename(from, to);
		});
		const resolve = vi.fn();
		const reject = vi.fn();

		await runExport({ resolve, reject });

		expect(restoreAttempts).toBe(1);
		expect(resolve).not.toHaveBeenCalled();
		expect(reject).toHaveBeenCalledOnce();
		expect(reject.mock.calls[0]?.[0]).toEqual(
			expect.objectContaining({
				message: expect.stringContaining("FFmpeg exited with code 23"),
			})
		);
		expect(reject.mock.calls[0]?.[0].message).toContain("transient lock");
		expect(
			fs.readFileSync(path.join(temporaryRoot, "before_stickers.mp4"), "utf8")
		).toBe("original-output");
		expect(fs.readFileSync(outputFile, "utf8")).toBe("partial-output");
	});

	it("restores the previous output when FFmpeg exits without an output file", async () => {
		stickerPassBehavior = "success-without-output";
		const resolve = vi.fn();
		const reject = vi.fn();

		await runExport({ resolve, reject });

		expect(reject).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledOnce();
		expect(fs.readFileSync(outputFile, "utf8")).toBe("original-output");
		expect(fs.existsSync(path.join(temporaryRoot, "before_stickers.mp4"))).toBe(
			false
		);
	});

	it("settles once when a process error is followed by close", async () => {
		stickerPassBehavior = "error-then-close";
		const realRename = fs.renameSync.bind(fs);
		let restoreAttempts = 0;
		vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
			if (String(from).endsWith("before_stickers.mp4")) {
				restoreAttempts += 1;
			}
			return realRename(from, to);
		});
		const resolve = vi.fn();
		const reject = vi.fn();

		await runExport({ resolve, reject });

		expect(restoreAttempts).toBe(1);
		expect(resolve).toHaveBeenCalledOnce();
		expect(reject).not.toHaveBeenCalled();
		expect(resolve.mock.calls.length + reject.mock.calls.length).toBe(1);
		expect(fs.readFileSync(outputFile, "utf8")).toBe("original-output");
	});

	it("uses and cleans a filter script for dense Mode 1.5 sticker graphs", async () => {
		stickerPassBehavior = "success";
		const resolve = vi.fn();
		const reject = vi.fn();

		await runExport({
			resolve,
			reject,
			exportOptions: options({ denseKeyframes: true }),
		});

		const filterScriptIndex = stickerSpawnArgs.indexOf(
			"-filter_complex_script"
		);
		const filterScriptPath = stickerSpawnArgs[filterScriptIndex + 1];
		expect(filterScriptIndex).toBeGreaterThan(-1);
		expect(stickerSpawnArgs).not.toContain("-filter_complex");
		expect(stickerSpawnArgs).toEqual(
			expect.arrayContaining(["-abort_on", "empty_output_stream"])
		);
		expect(stickerScriptExistedBeforeClose).toBe(true);
		expect(filterScriptPath).toBeTypeOf("string");
		expect(fs.existsSync(filterScriptPath)).toBe(false);
		expect(reject).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledOnce();
		expect(fs.readFileSync(outputFile, "utf8")).toBe("sticker-output");
		expect(fs.existsSync(path.join(temporaryRoot, "before_stickers.mp4"))).toBe(
			false
		);
	});

	it("rejects empty output streams in the Mode 1.5 audio pass", async () => {
		const resolve = vi.fn();
		const reject = vi.fn();

		await runExport({
			resolve,
			reject,
			exportOptions: options({ includeSticker: false }),
			audioFiles: [
				{
					path: audioFile,
					startTime: 0,
				},
			],
		});

		expect(audioSpawnArgs).toEqual(
			expect.arrayContaining(["-abort_on", "empty_output_stream"])
		);
		expect(reject).not.toHaveBeenCalled();
		expect(resolve).toHaveBeenCalledOnce();
		expect(fs.readFileSync(outputFile, "utf8")).toBe("audio-output");
	});
});

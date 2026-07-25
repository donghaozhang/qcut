import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
	app: {
		getPath: () => electronMock.userDataPath,
	},
}));

import type { VideoPreviewProxyOptions } from "../ffmpeg/types";
import { getVideoPreviewProxyCacheDir } from "../ffmpeg/video-preview-proxy-cache";
import {
	buildVideoPreviewProxyCacheKey,
	buildVideoPreviewProxyCommand,
	clearVideoPreviewProxyCache,
	getVideoPreviewProxyCacheStats,
} from "../ffmpeg/video-preview-proxy";

let testDir = "";
let sourcePath = "";

function options({
	clarity = 30,
	requestId = "proxy-request",
}: {
	clarity?: number;
	requestId?: string;
} = {}): VideoPreviewProxyOptions {
	return {
		requestId,
		sourcePath,
		sourceStart: 2,
		sourceDuration: 3,
		width: 641,
		height: 359,
		fps: 30,
		enhancements: {
			stabilization: 20,
			denoise: 10,
			clarity,
			upscale: 1,
			relight: 5,
			beauty: 0,
		},
	};
}

beforeEach(() => {
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-proxy-unit-"));
	electronMock.userDataPath = testDir;
	sourcePath = path.join(testDir, "source.mp4");
	fs.writeFileSync(sourcePath, Buffer.alloc(2_048, 1));
});

afterEach(() => {
	fs.rmSync(testDir, { recursive: true, force: true });
});

describe("video preview proxy", () => {
	it("builds a bounded even-sized FFmpeg proxy with temporal preroll", () => {
		const outputPath = path.join(testDir, "proxy.mp4");
		const command = buildVideoPreviewProxyCommand({
			options: options(),
			outputPath,
		});
		const filter = command.args[command.args.indexOf("-vf") + 1];

		expect(command.inputStart).toBe(1.5);
		expect(command.preroll).toBe(0.5);
		expect(filter).toContain("scale=642:360:flags=lanczos");
		expect(filter).toContain("deshake=");
		expect(filter).toContain("hqdn3d=");
		expect(filter).toContain("unsharp=");
		expect(command.args).toContain("libx264");
		expect(command.args).toContain("0:a?");
		expect(command.args.at(-1)).toBe(outputPath);
	});

	it("reuses cache keys across request IDs and invalidates visual changes", () => {
		const first = buildVideoPreviewProxyCacheKey({
			options: options({ requestId: "first" }),
		});
		const sameRender = buildVideoPreviewProxyCacheKey({
			options: options({ requestId: "second" }),
		});
		const changedEffect = buildVideoPreviewProxyCacheKey({
			options: options({ requestId: "third", clarity: 31 }),
		});

		expect(sameRender).toBe(first);
		expect(changedEffect).not.toBe(first);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
	});

	it("reports and clears preview proxy cache files", async () => {
		const cacheDir = getVideoPreviewProxyCacheDir();
		fs.mkdirSync(cacheDir, { recursive: true });
		fs.writeFileSync(path.join(cacheDir, "first.mp4"), Buffer.alloc(100));
		fs.writeFileSync(path.join(cacheDir, "second.mp4"), Buffer.alloc(300));
		fs.writeFileSync(path.join(cacheDir, "keep.tmp"), Buffer.alloc(500));

		await expect(getVideoPreviewProxyCacheStats()).resolves.toMatchObject({
			cacheDir,
			entryCount: 2,
			totalBytes: 400,
			maxEntries: 80,
		});

		const result = await clearVideoPreviewProxyCache();

		expect(result).toMatchObject({
			cacheDir,
			entryCount: 0,
			totalBytes: 0,
			removedEntries: 2,
			removedBytes: 400,
		});
		expect(fs.existsSync(path.join(cacheDir, "first.mp4"))).toBe(false);
		expect(fs.existsSync(path.join(cacheDir, "second.mp4"))).toBe(false);
		expect(fs.existsSync(path.join(cacheDir, "keep.tmp"))).toBe(true);
	});
});

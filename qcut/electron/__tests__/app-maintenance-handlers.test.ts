import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: {
		getPath: (name: string) => path.join("/mock", name),
	},
	ipcMain: { handle: vi.fn() },
}));

vi.mock("../ffmpeg/video-preview-proxy.js", () => ({
	getVideoPreviewProxyCacheStats: vi.fn(async () => ({
		cacheDir: "/mock/userData/video-preview-proxies",
		entryCount: 0,
		totalBytes: 0,
		maxBytes: 2_000_000_000,
		maxEntries: 80,
	})),
	clearVideoPreviewProxyCache: vi.fn(async () => ({})),
}));

vi.mock("../screen-recording-handler/path-utils.js", () => ({
	getRecordingsDir: () => "/mock/videos/QCut Recordings",
}));

import {
	clearAppCaches,
	collectAppCacheStats,
	getAppStorageInfo,
} from "../main-ipc/app-maintenance-handlers";

const TEMP_VIDEO_DIR = path.join(os.tmpdir(), "qcut-videos");
const MARKER = path.join(TEMP_VIDEO_DIR, "app-maintenance-test.bin");

describe("app maintenance handlers", () => {
	beforeEach(async () => {
		await fs.promises.mkdir(TEMP_VIDEO_DIR, { recursive: true });
		await fs.promises.writeFile(MARKER, Buffer.alloc(2048));
	});

	afterEach(async () => {
		await fs.promises.rm(MARKER, { force: true });
	});

	it("reports the four storage locations", () => {
		expect(getAppStorageInfo()).toEqual({
			drafts: path.join("/mock/userData", "projects"),
			projects: path.join("/mock/documents", "QCut", "Projects"),
			recordings: "/mock/videos/QCut Recordings",
			exports: path.join("/mock/documents", "QCut", "Exports"),
		});
	});

	it("aggregates temp-dir sizes into the cache stats", async () => {
		const stats = await collectAppCacheStats();
		const videosEntry = stats.entries.find(
			(entry) => entry.id === "qcut-videos"
		);
		expect(videosEntry).toBeDefined();
		expect(videosEntry?.bytes).toBeGreaterThanOrEqual(2048);
		expect(stats.totalBytes).toBeGreaterThanOrEqual(2048);
		expect(stats.entries.some((entry) => entry.id === "preview-proxies")).toBe(
			true
		);
	});

	it("clears temp caches and reports freed bytes", async () => {
		const result = await clearAppCaches();
		expect(result.freedBytes).toBeGreaterThanOrEqual(2048);
		expect(fs.existsSync(MARKER)).toBe(false);
	});
});

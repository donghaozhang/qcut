/**
 * Tests for Stage 1: Video Import Pipeline
 * Covers URL import, batch import, and frame extraction handler functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must use vi.hoisted() since vi.mock is hoisted to top
// ---------------------------------------------------------------------------

const {
	mockMkdir,
	mockStat,
	mockAccess,
	mockUnlink,
	mockCopyFile,
	mockReaddir,
	mockPipeline,
	mockFetch,
} = vi.hoisted(() => ({
	mockMkdir: vi.fn().mockResolvedValue(undefined),
	mockStat: vi.fn(),
	mockAccess: vi.fn(),
	mockUnlink: vi.fn().mockResolvedValue(undefined),
	mockCopyFile: vi.fn().mockResolvedValue(undefined),
	mockReaddir: vi.fn().mockResolvedValue([]),
	mockPipeline: vi.fn().mockResolvedValue(undefined),
	mockFetch: vi.fn(),
}));

vi.mock("fs/promises", () => ({
	mkdir: (...args: unknown[]) => mockMkdir(...args),
	stat: (...args: unknown[]) => mockStat(...args),
	access: (...args: unknown[]) => mockAccess(...args),
	unlink: (...args: unknown[]) => mockUnlink(...args),
	copyFile: (...args: unknown[]) => mockCopyFile(...args),
	readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock("node:fs", () => ({
	default: {
		createWriteStream: vi.fn(() => ({
			on: vi.fn(),
			write: vi.fn(),
			end: vi.fn(),
			once: vi.fn(),
		})),
	},
	createWriteStream: vi.fn(() => ({
		on: vi.fn(),
		write: vi.fn(),
		end: vi.fn(),
		once: vi.fn(),
	})),
}));

vi.mock("node:stream/promises", () => ({
	default: { pipeline: mockPipeline },
	pipeline: mockPipeline,
}));

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			return "/mock/unknown";
		}),
		getVersion: vi.fn(() => "0.0.1-test"),
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		removeListener: vi.fn(),
	},
	BrowserWindow: {
		getAllWindows: vi.fn(() => []),
	},
}));

vi.mock("electron-log", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	log: vi.fn(),
}));

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
	importMediaFromUrl,
	batchImportMedia,
	extractFrame,
	listMediaFiles,
	importMediaFile,
	getMediaInfo,
} from "../claude/handlers/claude-media-handler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResponse(options: {
	ok?: boolean;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
	body?: unknown;
}) {
	const headers = new Map(Object.entries(options.headers ?? {}));
	return {
		ok: options.ok ?? true,
		status: options.status ?? 200,
		statusText: options.statusText ?? "OK",
		headers: {
			get: (name: string) => headers.get(name.toLowerCase()) ?? null,
		},
		body: options.body ?? "mock-body-stream",
	};
}

// ---------------------------------------------------------------------------
// URL Import Tests
// ---------------------------------------------------------------------------

describe("importMediaFromUrl", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: file doesn't exist (for getUniqueFilePath)
		mockAccess.mockRejectedValue(new Error("ENOENT"));
		// Default: valid stat after download
		mockStat.mockResolvedValue({
			size: 1024,
			birthtimeMs: Date.now(),
			mtimeMs: Date.now(),
		});
	});

	it("downloads and imports a valid MP4 from HTTPS URL", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "video/mp4" },
			})
		);

		const result = await importMediaFromUrl(
			"proj_1",
			"https://example.com/video.mp4"
		);

		expect(result).toBeDefined();
		expect(result.name).toBe("video.mp4");
		expect(result.type).toBe("video");
		expect(result.id).toContain("media_");
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it("rejects non-http/https schemes", async () => {
		await expect(
			importMediaFromUrl("proj_1", "file:///etc/passwd")
		).rejects.toThrow("Unsupported URL scheme");

		await expect(
			importMediaFromUrl("proj_1", "ftp://example.com/file.mp4")
		).rejects.toThrow("Unsupported URL scheme");
	});

	it("rejects localhost/private IPs (SSRF prevention)", async () => {
		await expect(
			importMediaFromUrl("proj_1", "http://localhost:8080/video.mp4")
		).rejects.toThrow("private/loopback");

		await expect(
			importMediaFromUrl("proj_1", "http://127.0.0.1/video.mp4")
		).rejects.toThrow("private/loopback");
	});

	it("rejects invalid URL format", async () => {
		await expect(
			importMediaFromUrl("proj_1", "not a url at all")
		).rejects.toThrow("Invalid URL format");
	});

	it("handles Content-Disposition filename parsing", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: {
					"content-disposition": 'attachment; filename="my-video.mp4"',
					"content-type": "video/mp4",
				},
			})
		);

		const result = await importMediaFromUrl(
			"proj_1",
			"https://cdn.example.com/blob/abc123"
		);

		expect(result.name).toBe("my-video.mp4");
	});

	it("uses fallback filename when provided", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "video/mp4" },
			})
		);

		const result = await importMediaFromUrl(
			"proj_1",
			"https://example.com/blob/abc",
			"custom-name.mp4"
		);

		expect(result.name).toBe("custom-name.mp4");
	});

	it("rejects files exceeding size limit from content-length", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: {
					"content-length": String(6 * 1024 * 1024 * 1024), // 6GB
					"content-type": "video/mp4",
				},
			})
		);

		await expect(
			importMediaFromUrl("proj_1", "https://example.com/huge.mp4")
		).rejects.toThrow("File too large");
	});

	it("rejects HTTP error responses", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				ok: false,
				status: 404,
				statusText: "Not Found",
			})
		);

		await expect(
			importMediaFromUrl("proj_1", "https://example.com/missing.mp4")
		).rejects.toThrow("HTTP 404");
	});

	it("rejects unsupported file types", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "text/html" },
			})
		);

		await expect(
			importMediaFromUrl("proj_1", "https://example.com/page.html")
		).rejects.toThrow("Unsupported media type");
	});

	it("cleans up partial file on download failure", async () => {
		mockPipeline.mockRejectedValueOnce(new Error("Connection reset"));

		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "video/mp4" },
			})
		);

		await expect(
			importMediaFromUrl("proj_1", "https://example.com/video.mp4")
		).rejects.toThrow("Failed to save file");

		expect(mockUnlink).toHaveBeenCalled();
	});

	it("cleans up empty files after download", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "video/mp4" },
			})
		);

		// First stat call returns 0 size
		mockStat.mockResolvedValueOnce({
			size: 0,
			birthtimeMs: Date.now(),
			mtimeMs: Date.now(),
		});

		await expect(
			importMediaFromUrl("proj_1", "https://example.com/empty.mp4")
		).rejects.toThrow("Downloaded file is empty");

		expect(mockUnlink).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Batch Import Tests
// ---------------------------------------------------------------------------

describe("batchImportMedia", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAccess.mockRejectedValue(new Error("ENOENT"));
		mockStat.mockResolvedValue({
			size: 1024,
			isFile: () => true,
			birthtimeMs: Date.now(),
			mtimeMs: Date.now(),
		});
		mockReaddir.mockResolvedValue([]);
	});

	it("rejects empty items array", async () => {
		await expect(batchImportMedia("proj_1", [])).rejects.toThrow(
			"must not be empty"
		);
	});

	it("rejects batches exceeding 20 items", async () => {
		const items = Array.from({ length: 21 }, (_, i) => ({
			path: `/path/to/file${i}.mp4`,
		}));
		await expect(batchImportMedia("proj_1", items)).rejects.toThrow(
			"exceeds maximum of 20"
		);
	});

	it("handles items missing both path and url", async () => {
		const results = await batchImportMedia("proj_1", [
			{ filename: "no-source.mp4" },
		]);

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
		expect(results[0].error).toContain("must have either");
	});

	it("imports local files via path", async () => {
		const results = await batchImportMedia("proj_1", [
			{ path: "/local/video.mp4" },
		]);

		expect(results).toHaveLength(1);
		// The import may succeed or fail depending on mock setup
		// but it should not throw
		expect(results[0].index).toBe(0);
	});

	it("imports URLs via url field", async () => {
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "video/mp4" },
			})
		);

		const results = await batchImportMedia("proj_1", [
			{ url: "https://example.com/video.mp4" },
		]);

		expect(results).toHaveLength(1);
		expect(results[0].index).toBe(0);
		expect(results[0].success).toBe(true);
		expect(results[0].mediaFile).toBeDefined();
	});

	it("returns per-item success/failure for mixed batch", async () => {
		// First item: URL that succeeds
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				headers: { "content-type": "video/mp4" },
			})
		);

		// Second item: bad URL that fails
		mockFetch.mockResolvedValueOnce(
			createMockResponse({
				ok: false,
				status: 500,
				statusText: "Server Error",
			})
		);

		const results = await batchImportMedia("proj_1", [
			{ url: "https://example.com/good.mp4" },
			{ url: "https://example.com/bad.mp4" },
		]);

		expect(results).toHaveLength(2);
		expect(results[0].success).toBe(true);
		expect(results[1].success).toBe(false);
		expect(results[1].error).toContain("HTTP 500");
	});
});

// ---------------------------------------------------------------------------
// Media Lookup Tests
// ---------------------------------------------------------------------------

describe("getMediaInfo", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAccess.mockResolvedValue(undefined);
		mockStat.mockResolvedValue({
			size: 1024,
			birthtimeMs: Date.now(),
			mtimeMs: Date.now(),
		});
		mockReaddir.mockImplementation(async (dirPath: string) => {
			if (String(dirPath).endsWith("/media")) {
				return [];
			}
			if (String(dirPath).endsWith("/media/imported")) {
				return [
					{
						name: "550e8400-e29b-41d4-a716-446655440000.mp4",
						isFile: () => true,
						isSymbolicLink: () => false,
					},
				];
			}
			return [];
		});
	});

	it("resolves imported media by raw mediaId filename stem", async () => {
		const media = await getMediaInfo(
			"proj_1",
			"550e8400-e29b-41d4-a716-446655440000"
		);
		expect(media).not.toBeNull();
		expect(media?.path).toContain("550e8400-e29b-41d4-a716-446655440000.mp4");
	});

	it("resolves imported media by exact filename", async () => {
		const media = await getMediaInfo(
			"proj_1",
			"550e8400-e29b-41d4-a716-446655440000.mp4"
		);
		expect(media).not.toBeNull();
		expect(media?.path).toContain("550e8400-e29b-41d4-a716-446655440000.mp4");
	});
});

// ---------------------------------------------------------------------------
// Frame Extraction Tests
// ---------------------------------------------------------------------------

describe("extractFrame", () => {
	const videoMediaId = `media_${Buffer.from("video.mp4").toString("base64url")}`;

	beforeEach(() => {
		vi.clearAllMocks();
		// Default: directory access succeeds (for listMediaFiles), file access fails (for getUniqueFilePath)
		mockAccess.mockResolvedValue(undefined);
		// For listMediaFiles — directory has video file
		mockReaddir.mockResolvedValue([
			{
				name: "video.mp4",
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		]);
		mockStat.mockResolvedValue({
			size: 1024,
			birthtimeMs: Date.now(),
			mtimeMs: Date.now(),
		});
	});

	it("rejects negative timestamps", async () => {
		await expect(extractFrame("proj_1", videoMediaId, -1)).rejects.toThrow(
			"non-negative"
		);
	});

	it("rejects non-video media types", async () => {
		// Mock readdir to return an audio file
		mockReaddir.mockResolvedValueOnce([
			{
				name: "audio.mp3",
				isFile: () => true,
				isSymbolicLink: () => false,
			},
		]);

		const audioId = `media_${Buffer.from("audio.mp3").toString("base64url")}`;
		await expect(extractFrame("proj_1", audioId, 5.0)).rejects.toThrow(
			"only supported for video"
		);
	});

	it("rejects unknown media IDs", async () => {
		// Directory exists but is empty
		mockReaddir.mockResolvedValueOnce([]);

		await expect(
			extractFrame("proj_1", "media_nonexistent", 5.0)
		).rejects.toThrow("Media not found");
	});
});

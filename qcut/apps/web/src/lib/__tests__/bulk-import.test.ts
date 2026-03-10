/**
 * Tests for bulk import utility.
 *
 * @module lib/__tests__/bulk-import.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import {
	bulkImportFiles,
	getMimeType,
	formatFileSize,
	type BulkImportProgress,
} from "../media/bulk-import";
import type { ProjectFolderFileInfo } from "@/types/electron";

describe("bulk-import", () => {
	describe("getMimeType", () => {
		it("should detect video MIME types", () => {
			expect(getMimeType("video.mp4", "video")).toBe("video/mp4");
			expect(getMimeType("video.webm", "video")).toBe("video/webm");
			expect(getMimeType("video.mov", "video")).toBe("video/quicktime");
			expect(getMimeType("video.avi", "video")).toBe("video/x-msvideo");
			expect(getMimeType("video.mkv", "video")).toBe("video/x-matroska");
		});

		it("should detect audio MIME types", () => {
			expect(getMimeType("audio.mp3", "audio")).toBe("audio/mpeg");
			expect(getMimeType("audio.wav", "audio")).toBe("audio/wav");
			expect(getMimeType("audio.ogg", "audio")).toBe("audio/ogg");
			expect(getMimeType("audio.m4a", "audio")).toBe("audio/mp4");
			expect(getMimeType("audio.flac", "audio")).toBe("audio/flac");
		});

		it("should detect image MIME types", () => {
			expect(getMimeType("image.jpg", "image")).toBe("image/jpeg");
			expect(getMimeType("image.jpeg", "image")).toBe("image/jpeg");
			expect(getMimeType("image.png", "image")).toBe("image/png");
			expect(getMimeType("image.gif", "image")).toBe("image/gif");
			expect(getMimeType("image.webp", "image")).toBe("image/webp");
			expect(getMimeType("image.svg", "image")).toBe("image/svg+xml");
		});

		it("should fallback to type-based defaults for unknown extensions", () => {
			expect(getMimeType("video.xyz", "video")).toBe("video/mp4");
			expect(getMimeType("audio.xyz", "audio")).toBe("audio/mpeg");
			expect(getMimeType("image.xyz", "image")).toBe("image/jpeg");
			expect(getMimeType("file.xyz", "unknown")).toBe(
				"application/octet-stream"
			);
		});

		it("should handle files without extension", () => {
			expect(getMimeType("videofile", "video")).toBe("video/mp4");
			expect(getMimeType("audiofile", "audio")).toBe("audio/mpeg");
		});
	});

	describe("formatFileSize", () => {
		it("should format bytes", () => {
			expect(formatFileSize(0)).toBe("0 B");
			expect(formatFileSize(100)).toBe("100 B");
			expect(formatFileSize(1023)).toBe("1023 B");
		});

		it("should format kilobytes", () => {
			expect(formatFileSize(1024)).toBe("1.0 KB");
			expect(formatFileSize(1536)).toBe("1.5 KB");
			expect(formatFileSize(1024 * 1023)).toBe("1023.0 KB");
		});

		it("should format megabytes", () => {
			expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
			expect(formatFileSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
			expect(formatFileSize(1024 * 1024 * 100)).toBe("100.0 MB");
		});

		it("should format gigabytes", () => {
			expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
			expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
		});
	});

	describe("bulkImportFiles", () => {
		const mockFiles: ProjectFolderFileInfo[] = [
			{
				name: "video1.mp4",
				path: "/projects/test/media/video1.mp4",
				relativePath: "media/video1.mp4",
				type: "video",
				size: 1_024_000,
				modifiedAt: Date.now(),
				isDirectory: false,
			},
			{
				name: "audio1.mp3",
				path: "/projects/test/media/audio1.mp3",
				relativePath: "media/audio1.mp3",
				type: "audio",
				size: 512_000,
				modifiedAt: Date.now(),
				isDirectory: false,
			},
			{
				name: "images",
				path: "/projects/test/media/images",
				relativePath: "media/images",
				type: "unknown",
				size: 0,
				modifiedAt: Date.now(),
				isDirectory: true,
			},
			{
				name: "readme.txt",
				path: "/projects/test/media/readme.txt",
				relativePath: "media/readme.txt",
				type: "unknown",
				size: 100,
				modifiedAt: Date.now(),
				isDirectory: false,
			},
		];

		beforeEach(() => {
			// Mock crypto.randomUUID
			vi.stubGlobal("crypto", {
				randomUUID: vi.fn().mockReturnValue("mock-uuid-123"),
			});

			// Mock electronAPI
			Object.defineProperty(window, "electronAPI", {
				value: {
					mediaImport: {
						import: vi.fn().mockResolvedValue({
							success: true,
							targetPath: "/projects/test/media/imported/mock-uuid-123.mp4",
							importMethod: "symlink",
							originalPath: "/projects/test/media/video1.mp4",
							fileSize: 1_024_000,
						}),
					},
				},
				writable: true,
				configurable: true,
			});
			initPlatform(createDesktopAdapter());
		});

		afterEach(() => {
			vi.unstubAllGlobals();
			vi.clearAllMocks();
		});

		it("should import media files only (filter directories and unknown types)", async () => {
			const result = await bulkImportFiles("test-project", mockFiles);

			// Should only import video1.mp4 and audio1.mp3 (2 media files)
			expect(result.imported).toBe(2);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);

			// Should have been called twice (once per media file)
			expect(window.electronAPI?.mediaImport?.import).toHaveBeenCalledTimes(2);
		});

		it("should return empty result for empty array", async () => {
			const result = await bulkImportFiles("test-project", []);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);
		});

		it("should return empty result for array with only directories", async () => {
			const result = await bulkImportFiles("test-project", [
				{
					name: "folder",
					path: "/test/folder",
					relativePath: "folder",
					type: "unknown",
					size: 0,
					modifiedAt: Date.now(),
					isDirectory: true,
				},
			]);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(0);
		});

		it("should handle import failures gracefully", async () => {
			window.electronAPI!.mediaImport!.import = vi
				.fn()
				.mockResolvedValueOnce({ success: true })
				.mockResolvedValueOnce({ success: false, error: "Permission denied" });

			const result = await bulkImportFiles("test-project", mockFiles);

			expect(result.imported).toBe(1);
			expect(result.failed).toBe(1);
			expect(result.errors).toContain("audio1.mp3: Permission denied");
		});

		it("should handle exceptions during import", async () => {
			window.electronAPI!.mediaImport!.import = vi
				.fn()
				.mockRejectedValue(new Error("Network error"));

			const result = await bulkImportFiles("test-project", mockFiles);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(2);
			expect(result.errors[0]).toContain("Network error");
		});

		it("should call progress callback", async () => {
			const progressCalls: BulkImportProgress[] = [];
			const onProgress = (progress: BulkImportProgress) => {
				progressCalls.push({ ...progress });
			};

			await bulkImportFiles("test-project", mockFiles, { onProgress });

			// Should have 4 progress calls (2 files × 2 calls each: before + after)
			expect(progressCalls.length).toBe(4);

			// First call: starting first file
			expect(progressCalls[0]).toMatchObject({
				total: 2,
				completed: 0,
				current: "video1.mp4",
			});

			// Second call: completed first file
			expect(progressCalls[1]).toMatchObject({
				total: 2,
				completed: 1,
				current: "video1.mp4",
			});

			// Last call: completed all
			expect(progressCalls[3]).toMatchObject({
				total: 2,
				completed: 2,
			});
		});

		it("should handle missing electronAPI", async () => {
			Object.defineProperty(window, "electronAPI", {
				value: undefined,
				writable: true,
				configurable: true,
			});

			const result = await bulkImportFiles("test-project", mockFiles);

			// All should fail since API is missing
			expect(result.imported).toBe(0);
			expect(result.failed).toBe(2);
		});
	});
});

// @vitest-environment node
/**
 * Tests for AI video storage migration and path helpers.
 * Mocks Electron's `app` module to test path construction and migration logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Mock Electron's app module before importing the handler
vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			if (name === "userData") return "/mock/AppData";
			return "/mock/unknown";
		}),
	},
	ipcMain: {
		handle: vi.fn(),
	},
}));

// Mock crypto for deterministic unique IDs
vi.mock("crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("crypto")>();
	return {
		...actual,
		default: actual,
		randomBytes: vi.fn(() => ({
			toString: () => "abcdef0123456789",
		})),
	};
});

import {
	sanitizeFilename,
	getAIVideoDir,
	getLegacyAIVideoDir,
	migrateAIVideosToDocuments,
} from "../ai-video-save-handler";

// ============================================================================
// sanitizeFilename
// ============================================================================

describe("sanitizeFilename", () => {
	it("preserves alphanumeric characters", () => {
		expect(sanitizeFilename("project123")).toBe("project123");
	});

	it("preserves dots, underscores, and hyphens", () => {
		expect(sanitizeFilename("my-project_v1.0")).toBe("my-project_v1.0");
	});

	it("replaces path separators with underscores", () => {
		expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
	});

	it("replaces spaces with underscores", () => {
		expect(sanitizeFilename("my project")).toBe("my_project");
	});

	it("replaces special characters", () => {
		expect(sanitizeFilename("project@#$%")).toBe("project____");
	});

	it("handles empty string", () => {
		expect(sanitizeFilename("")).toBe("");
	});
});

// ============================================================================
// getAIVideoDir
// ============================================================================

describe("getAIVideoDir", () => {
	it("returns Documents-based path with correct structure", () => {
		const result = getAIVideoDir("test-project");
		const segments = result.split(path.sep);
		expect(segments).toContain("QCut");
		expect(segments).toContain("Projects");
		expect(segments).toContain("test-project");
		expect(segments).toContain("media");
		expect(segments).toContain("generated");
		expect(segments).toContain("videos");
	});

	it("sanitizes the project ID by stripping path separators and parent refs", () => {
		const result = getAIVideoDir("../malicious");
		// `sanitizePathComponent` strips both slashes and `..` entirely, so
		// the project ID resolves to the cleaned name with no traversal residue.
		expect(result).not.toContain("..");
		expect(result).toContain(`${path.sep}malicious${path.sep}`);
	});

	it("starts from Documents path", () => {
		const result = getAIVideoDir("test");
		expect(result).toContain("Documents");
	});
});

// ============================================================================
// getLegacyAIVideoDir
// ============================================================================

describe("getLegacyAIVideoDir", () => {
	it("returns AppData-based path with correct structure", () => {
		const result = getLegacyAIVideoDir("test-project");
		const segments = result.split(path.sep);
		expect(segments).toContain("projects");
		expect(segments).toContain("test-project");
		expect(segments).toContain("ai-videos");
	});

	it("sanitizes the project ID by removing path separators", () => {
		const result = getLegacyAIVideoDir("../malicious");
		// Dots are preserved but slashes are replaced with underscores
		expect(result).toContain(".._malicious");
		expect(result).not.toContain("/malicious");
	});

	it("starts from userData path", () => {
		const result = getLegacyAIVideoDir("test");
		expect(result).toContain("AppData");
	});
});

// ============================================================================
// migrateAIVideosToDocuments
// ============================================================================

describe("migrateAIVideosToDocuments", () => {
	// Use path.join for cross-platform path consistency
	const legacyRoot = path.join("/mock/AppData", "projects");

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns zeroed result when no legacy directory exists", async () => {
		// access rejects → no legacy dir
		vi.spyOn(fs.promises, "access").mockRejectedValue(new Error("ENOENT"));

		const result = await migrateAIVideosToDocuments();
		expect(result.copied).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.projectsProcessed).toBe(0);
		expect(result.errors).toHaveLength(0);
	});

	it("skips projects without ai-videos folder", async () => {
		vi.spyOn(fs.promises, "access").mockImplementation(async (p) => {
			const pathStr = path.normalize(String(p));
			// First call: legacy root exists
			if (pathStr === path.normalize(legacyRoot)) return;
			// Second call: ai-videos subdir does not exist
			throw new Error("ENOENT");
		});

		vi.spyOn(fs.promises, "readdir").mockResolvedValue([
			{ name: "project-1", isDirectory: () => true },
		] as any);

		const result = await migrateAIVideosToDocuments();
		expect(result.projectsProcessed).toBe(0);
		expect(result.copied).toBe(0);
	});

	it("copies files from legacy to Documents path", async () => {
		vi.spyOn(fs.promises, "access").mockImplementation(async (p) => {
			const pathStr = path.normalize(String(p));
			// Legacy root exists
			if (pathStr === path.normalize(legacyRoot)) return;
			// Legacy ai-videos dir exists
			if (pathStr.includes("ai-videos")) return;
			// Destination file does NOT exist → needs copy
			throw new Error("ENOENT");
		});

		// readdir: first call returns project dirs, second returns files
		let readdirCallCount = 0;
		vi.spyOn(fs.promises, "readdir").mockImplementation(async () => {
			readdirCallCount++;
			if (readdirCallCount === 1) {
				return [
					{
						name: "proj-1",
						isDirectory: () => true,
					},
				] as any;
			}
			return ["video1.mp4", "video2.mp4"] as any;
		});

		vi.spyOn(fs.promises, "mkdir").mockResolvedValue(undefined as any);
		vi.spyOn(fs.promises, "stat").mockResolvedValue({
			isFile: () => true,
		} as any);
		vi.spyOn(fs.promises, "copyFile").mockResolvedValue(undefined);

		const result = await migrateAIVideosToDocuments();
		expect(result.projectsProcessed).toBe(1);
		expect(result.copied).toBe(2);
		expect(result.errors).toHaveLength(0);
	});

	it("skips files that already exist at destination", async () => {
		vi.spyOn(fs.promises, "access").mockResolvedValue(undefined);

		let readdirCallCount = 0;
		vi.spyOn(fs.promises, "readdir").mockImplementation(async () => {
			readdirCallCount++;
			if (readdirCallCount === 1) {
				return [
					{
						name: "proj-1",
						isDirectory: () => true,
					},
				] as any;
			}
			return ["existing.mp4"] as any;
		});

		vi.spyOn(fs.promises, "mkdir").mockResolvedValue(undefined as any);
		vi.spyOn(fs.promises, "stat").mockResolvedValue({
			isFile: () => true,
		} as any);
		const copyFileSpy = vi
			.spyOn(fs.promises, "copyFile")
			.mockResolvedValue(undefined);

		const result = await migrateAIVideosToDocuments();
		expect(result.skipped).toBe(1);
		expect(result.copied).toBe(0);
		expect(copyFileSpy).not.toHaveBeenCalled();
	});

	it("collects errors without throwing", async () => {
		vi.spyOn(fs.promises, "access").mockImplementation(async (p) => {
			const pathStr = path.normalize(String(p));
			if (pathStr === path.normalize(legacyRoot)) return;
			if (pathStr.includes("ai-videos")) return;
			// Destination does not exist → needs copy
			throw new Error("ENOENT");
		});

		let readdirCallCount = 0;
		vi.spyOn(fs.promises, "readdir").mockImplementation(async () => {
			readdirCallCount++;
			if (readdirCallCount === 1) {
				return [
					{
						name: "proj-1",
						isDirectory: () => true,
					},
				] as any;
			}
			return ["fail.mp4"] as any;
		});

		vi.spyOn(fs.promises, "mkdir").mockResolvedValue(undefined as any);
		vi.spyOn(fs.promises, "stat").mockResolvedValue({
			isFile: () => true,
		} as any);
		vi.spyOn(fs.promises, "copyFile").mockRejectedValue(new Error("EPERM"));

		const result = await migrateAIVideosToDocuments();
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain("Failed to copy");
	});
});

// @vitest-environment node
/**
 * Tests for claude-analyze-handler.ts
 * Validates video path resolution, model listing, and analysis orchestration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			return "/mock/unknown";
		}),
		getVersion: vi.fn(() => "0.0.1-test"),
		isPackaged: false,
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

const { mockExistsSync } = vi.hoisted(() => ({
	mockExistsSync: vi.fn(() => true),
}));

vi.mock("fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs")>();
	return {
		...actual,
		default: {
			...actual,
			existsSync: mockExistsSync,
			mkdirSync: vi.fn(),
			readdirSync: vi.fn(() => []),
			readFileSync: vi.fn(() => ""),
		},
		existsSync: mockExistsSync,
		mkdirSync: vi.fn(),
		readdirSync: vi.fn(() => []),
		readFileSync: vi.fn(() => ""),
	};
});

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		default: {
			...actual,
			existsSync: mockExistsSync,
			mkdirSync: vi.fn(),
			readdirSync: vi.fn(() => []),
			readFileSync: vi.fn(() => ""),
		},
		existsSync: mockExistsSync,
		mkdirSync: vi.fn(),
		readdirSync: vi.fn(() => []),
		readFileSync: vi.fn(() => ""),
	};
});

vi.mock("../native-pipeline/execution/executor", () => ({
	PipelineExecutor: vi.fn().mockImplementation(() => ({
		executeStep: vi.fn(async () => ({
			success: true,
			text: "Test analysis result",
			duration: 1.5,
			cost: 0.003,
		})),
	})),
}));

vi.mock("../native-pipeline/infra/registry", () => ({
	ModelRegistry: {
		has: vi.fn(() => true),
		get: vi.fn(() => ({
			key: "fal_video_qa",
			name: "FAL Video Q&A",
			provider: "fal",
			endpoint: "openrouter/router/video/enterprise",
			categories: ["image_understanding"],
		})),
	},
}));

vi.mock("../claude/handlers/claude-media-handler", () => ({
	getMediaInfo: vi.fn(async (_projectId: string, mediaId: string) => {
		if (mediaId === "valid-media") {
			return {
				id: "valid-media",
				name: "test.mp4",
				type: "video",
				path: "/mock/Documents/QCut/Projects/test-project/media/test.mp4",
				size: 1000,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
		}
		if (mediaId === "audio-media") {
			return {
				id: "audio-media",
				name: "test.mp3",
				type: "audio",
				path: "/mock/path/test.mp3",
				size: 500,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
			};
		}
		return null;
	}),
}));

vi.mock("../claude/handlers/claude-timeline-handler", () => ({
	requestTimelineFromRenderer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import type { AnalyzeSource } from "../types/claude-api";
import {
	resolveVideoPath,
	listAnalyzeModels,
} from "../claude/handlers/claude-analyze-handler";

describe("listAnalyzeModels", () => {
	it("returns available models", () => {
		const result = listAnalyzeModels();
		expect(result.models).toBeDefined();
		expect(result.models.length).toBeGreaterThan(0);

		const flash = result.models.find((m) => m.key === "gemini-2.5-flash");
		expect(flash).toBeDefined();
		expect(flash!.provider).toBe("fal");
	});

	it("includes all expected model keys", () => {
		const { models } = listAnalyzeModels();
		const keys = models.map((m) => m.key);
		expect(keys).toContain("gemini-2.5-flash");
		expect(keys).toContain("gemini-2.5-pro");
		expect(keys).toContain("gemini-3-pro");
		expect(keys).toContain("gemini-direct");
	});
});

describe("resolveVideoPath", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExistsSync.mockReturnValue(true);
	});

	describe("path source", () => {
		it("resolves a valid absolute path", async () => {
			const result = await resolveVideoPath("test-project", {
				type: "path",
				filePath: "/Users/test/Downloads/video.mp4",
			});
			expect(result).toBe("/Users/test/Downloads/video.mp4");
		});

		it("rejects missing filePath", async () => {
			await expect(
				resolveVideoPath("test-project", { type: "path" })
			).rejects.toThrow("Missing 'filePath'");
		});

		it("rejects relative paths", async () => {
			await expect(
				resolveVideoPath("test-project", {
					type: "path",
					filePath: "../../../etc/passwd",
				})
			).rejects.toThrow("Invalid file path");
		});

		it("rejects null byte injection", async () => {
			await expect(
				resolveVideoPath("test-project", {
					type: "path",
					filePath: "/tmp/video\0.mp4",
				})
			).rejects.toThrow("Invalid file path");
		});

		it("rejects non-existent files", async () => {
			mockExistsSync.mockReturnValue(false);
			await expect(
				resolveVideoPath("test-project", {
					type: "path",
					filePath: "/Users/test/nonexistent.mp4",
				})
			).rejects.toThrow("File not found");
		});
	});

	describe("media source", () => {
		it("resolves a valid media ID", async () => {
			const result = await resolveVideoPath("test-project", {
				type: "media",
				mediaId: "valid-media",
			});
			expect(result).toBe(
				"/mock/Documents/QCut/Projects/test-project/media/test.mp4"
			);
		});

		it("rejects missing mediaId", async () => {
			await expect(
				resolveVideoPath("test-project", { type: "media" })
			).rejects.toThrow("Missing 'mediaId'");
		});

		it("rejects unknown media ID", async () => {
			await expect(
				resolveVideoPath("test-project", {
					type: "media",
					mediaId: "nonexistent",
				})
			).rejects.toThrow("Media not found");
		});

		it("rejects non-video media", async () => {
			await expect(
				resolveVideoPath("test-project", {
					type: "media",
					mediaId: "audio-media",
				})
			).rejects.toThrow("not a video");
		});
	});

	describe("timeline source", () => {
		it("rejects missing elementId", async () => {
			await expect(
				resolveVideoPath("test-project", { type: "timeline" })
			).rejects.toThrow("Missing 'elementId'");
		});
	});

	describe("unknown source type", () => {
		it("rejects unknown source type", async () => {
			await expect(
				resolveVideoPath("test-project", {
					type: "invalid",
				} as unknown as AnalyzeSource)
			).rejects.toThrow("Unknown source type");
		});
	});
});

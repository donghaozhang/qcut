/**
 * Integration tests for Claude HTTP Server — timeline operations.
 * Split from claude-http-server.test.ts to keep each file under 800 lines.
 */

import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	afterAll,
	beforeEach,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the server module
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => "/mock/Documents"),
		getVersion: vi.fn(() => "1.0.0-test"),
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		removeListener: vi.fn(),
	},
	BrowserWindow: {
		getAllWindows: vi.fn(() => []),
		fromWebContents: vi.fn(() => null),
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

vi.mock("../handlers/claude-media-handler.js", () => ({
	listMediaFiles: vi.fn(async () => []),
	getMediaInfo: vi.fn(async () => null),
	importMediaFile: vi.fn(async () => null),
	deleteMediaFile: vi.fn(async () => false),
	renameMediaFile: vi.fn(async () => false),
}));

vi.mock("../handlers/claude-timeline-handler.js", () => ({
	requestTimelineFromRenderer: vi.fn(),
	requestSplitFromRenderer: vi.fn(),
	requestSelectionFromRenderer: vi.fn(),
	batchAddElements: vi.fn(async () => ({ added: [], failedCount: 0 })),
	batchUpdateElements: vi.fn(async () => ({
		updatedCount: 0,
		failedCount: 0,
		results: [],
	})),
	batchDeleteElements: vi.fn(async () => ({
		deletedCount: 0,
		failedCount: 0,
		results: [],
	})),
	deleteTimelineRange: vi.fn(async () => ({
		deletedElements: 0,
		splitElements: 0,
		totalRemovedDuration: 0,
	})),
	arrangeTimeline: vi.fn(async () => ({ arranged: [] })),
	timelineToMarkdown: vi.fn(() => "# Timeline"),
	markdownToTimeline: vi.fn(() => ({
		name: "Test",
		duration: 0,
		width: 1920,
		height: 1080,
		fps: 30,
		tracks: [],
	})),
	validateTimeline: vi.fn(),
}));

vi.mock("../handlers/claude-transaction-handler.js", () => ({
	beginTransaction: vi.fn(async () => ({
		id: "txn_test_1",
		label: "Test Txn",
		state: "active",
		createdAt: Date.now(),
		updatedAt: Date.now(),
		expiresAt: Date.now() + 30_000,
	})),
	commitTransaction: vi.fn(async () => ({
		transaction: {
			id: "txn_test_1",
			label: "Test Txn",
			state: "committed",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			expiresAt: Date.now() + 30_000,
		},
		historyEntryAdded: true,
	})),
	rollbackTransaction: vi.fn(async () => ({
		transaction: {
			id: "txn_test_1",
			label: "Test Txn",
			state: "rolledBack",
			createdAt: Date.now(),
			updatedAt: Date.now(),
			expiresAt: Date.now() + 30_000,
		},
	})),
	getTransactionStatus: vi.fn(() => null),
	undoTimeline: vi.fn(async () => ({
		applied: true,
		undoCount: 1,
		redoCount: 0,
	})),
	redoTimeline: vi.fn(async () => ({
		applied: true,
		undoCount: 2,
		redoCount: 0,
	})),
	getHistorySummary: vi.fn(async () => ({
		undoCount: 2,
		redoCount: 1,
		entries: [{ label: "Edit", timestamp: 123 }],
	})),
}));

vi.mock("../handlers/claude-project-handler.js", () => ({
	getProjectSettings: vi.fn(async () => ({
		name: "Test",
		width: 1920,
		height: 1080,
		fps: 30,
		aspectRatio: "16:9",
		backgroundColor: "#000",
		exportFormat: "mp4",
		exportQuality: "high",
	})),
	updateProjectSettings: vi.fn(async () => {}),
	getProjectStats: vi.fn(async () => ({
		totalDuration: 0,
		mediaCount: { video: 0, audio: 0, image: 0 },
		trackCount: 0,
		elementCount: 0,
		lastModified: Date.now(),
		fileSize: 0,
	})),
	getEmptyStats: vi.fn(() => ({
		totalDuration: 0,
		mediaCount: { video: 0, audio: 0, image: 0 },
		trackCount: 0,
		elementCount: 0,
		lastModified: Date.now(),
		fileSize: 0,
	})),
}));

vi.mock("../handlers/claude-export-handler.js", () => ({
	getExportPresets: vi.fn(() => [
		{
			id: "youtube-1080p",
			name: "YouTube 1080p",
			platform: "youtube",
			width: 1920,
			height: 1080,
			fps: 30,
			bitrate: "8Mbps",
			format: "mp4",
		},
	]),
	getExportRecommendation: vi.fn(() => ({
		preset: {
			id: "youtube-1080p",
			name: "YouTube 1080p",
			platform: "youtube",
			width: 1920,
			height: 1080,
			fps: 30,
			bitrate: "8Mbps",
			format: "mp4",
		},
		warnings: [],
		suggestions: [],
	})),
}));

vi.mock("../handlers/claude-diagnostics-handler.js", () => ({
	analyzeError: vi.fn(() => ({
		errorType: "unknown",
		severity: "medium",
		possibleCauses: [],
		suggestedFixes: [],
		canAutoFix: false,
		systemInfo: {
			platform: "test",
			arch: "x64",
			osVersion: "1.0",
			appVersion: "1.0",
			nodeVersion: "20",
			electronVersion: "30",
			memory: { total: 1, free: 1, used: 0 },
			cpuCount: 4,
		},
	})),
	getSystemInfo: vi.fn(() => ({})),
}));

vi.mock(
	"../claude-suggest-handler.js",
	() => ({
		suggestCuts: vi.fn(async () => ({ suggestions: [] })),
	}),
	{ virtual: true },
);

vi.mock("../handlers/claude-range-handler.js", () => ({
	executeDeleteRange: vi.fn(async () => ({
		deletedElements: 0,
		splitElements: 0,
		totalRemovedDuration: 0,
	})),
	validateRangeDeleteRequest: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Post-mock imports
// ---------------------------------------------------------------------------

import {
	startClaudeHTTPServer,
	stopClaudeHTTPServer,
} from "../http/claude-http-server";
import { BrowserWindow } from "electron";
import * as timelineHandler from "../handlers/claude-timeline-handler.js";
import * as rangeHandler from "../handlers/claude-range-handler.js";
import { notificationBridge } from "../notification-bridge";
import { HttpError } from "../utils/http-router";
import { createFetch, createMockWindow } from "./claude-http-test-helpers";

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let serverPort: number;
const fetch = createFetch(() => serverPort);

beforeAll(async () => {
	serverPort = 18_765 + Math.floor(Math.random() * 1000);
	process.env.QCUT_API_PORT = String(serverPort);
	delete process.env.QCUT_API_TOKEN;

	startClaudeHTTPServer(serverPort);
	await new Promise((resolve) => setTimeout(resolve, 100));
});

afterAll(() => {
	stopClaudeHTTPServer();
	delete process.env.QCUT_API_PORT;
});

// ---------------------------------------------------------------------------
// Timeline Tests
// ---------------------------------------------------------------------------

describe("Claude HTTP Server - Timeline", () => {
	beforeEach(() => {
		notificationBridge.resetForTests();
		vi.mocked(BrowserWindow.getAllWindows).mockReset();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([]);
	});

	it("POST /api/claude/timeline/:projectId/elements/:elementId/split returns split result", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(timelineHandler.requestSplitFromRenderer).mockResolvedValueOnce({
			secondElementId: "element_split_2",
		});

		const res = await fetch(
			"/api/claude/timeline/proj_123/elements/element_abc/split",
			{
				method: "POST",
				body: JSON.stringify({ splitTime: 3.5 }),
			},
		);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.secondElementId).toBe("element_split_2");
		expect(timelineHandler.requestSplitFromRenderer).toHaveBeenCalledWith(
			mockWindow,
			"element_abc",
			3.5,
			"split",
			expect.any(String),
		);
	});

	it("POST /api/claude/timeline/:projectId/elements/:elementId/split validates splitTime", async () => {
		const res = await fetch(
			"/api/claude/timeline/proj_123/elements/element_abc/split",
			{
				method: "POST",
				body: JSON.stringify({ mode: "split" }),
			},
		);

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("splitTime");
	});

	it("POST /api/claude/timeline/:projectId/elements/:elementId/split validates mode", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);

		const res = await fetch(
			"/api/claude/timeline/proj_123/elements/element_abc/split",
			{
				method: "POST",
				body: JSON.stringify({ splitTime: 3.5, mode: "invalid_mode" }),
			},
		);

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("Invalid mode");
	});

	it("POST /api/claude/timeline/:projectId/elements/:elementId/move dispatches move event", async () => {
		const send = vi.fn();
		const mockWindow = createMockWindow(send);
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);

		const res = await fetch(
			"/api/claude/timeline/proj_123/elements/element_abc/move",
			{
				method: "POST",
				body: JSON.stringify({ toTrackId: "track_2", newStartTime: 5 }),
			},
		);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.moved).toBe(true);
		expect(send).toHaveBeenCalledWith(
			"claude:timeline:moveElement",
			expect.objectContaining({
				elementId: "element_abc",
				toTrackId: "track_2",
				newStartTime: 5,
			}),
		);
	});

	it("POST /api/claude/timeline/:projectId/elements/batch calls batch add handler", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(timelineHandler.batchAddElements).mockResolvedValueOnce({
			added: [{ index: 0, success: true, elementId: "el_1" }],
			failedCount: 0,
		});

		const res = await fetch("/api/claude/timeline/proj_123/elements/batch", {
			method: "POST",
			body: JSON.stringify({
				elements: [
					{
						type: "media",
						trackId: "track_1",
						startTime: 0,
						duration: 5,
						mediaId: "media_1",
					},
				],
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.failedCount).toBe(0);
		expect(timelineHandler.batchAddElements).toHaveBeenCalledWith(
			mockWindow,
			"proj_123",
			expect.any(Array),
			expect.any(String),
		);
	});

	it("PATCH /api/claude/timeline/:projectId/elements/batch calls batch update handler", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(timelineHandler.batchUpdateElements).mockResolvedValueOnce({
			updatedCount: 1,
			failedCount: 0,
			results: [{ index: 0, success: true }],
		});

		const res = await fetch("/api/claude/timeline/proj_123/elements/batch", {
			method: "PATCH",
			body: JSON.stringify({
				updates: [{ elementId: "el_1", startTime: 3 }],
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.updatedCount).toBe(1);
		expect(timelineHandler.batchUpdateElements).toHaveBeenCalledWith(
			mockWindow,
			[{ elementId: "el_1", startTime: 3 }],
			expect.any(String),
		);
	});

	it("DELETE /api/claude/timeline/:projectId/elements/batch calls batch delete handler", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(timelineHandler.batchDeleteElements).mockResolvedValueOnce({
			deletedCount: 1,
			failedCount: 0,
			results: [{ index: 0, success: true }],
		});

		const res = await fetch("/api/claude/timeline/proj_123/elements/batch", {
			method: "DELETE",
			body: JSON.stringify({
				elements: [{ trackId: "track_1", elementId: "el_1" }],
				ripple: true,
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.deletedCount).toBe(1);
		expect(timelineHandler.batchDeleteElements).toHaveBeenCalledWith(
			mockWindow,
			[{ trackId: "track_1", elementId: "el_1" }],
			true,
			expect.any(String),
		);
	});

	it("DELETE /api/claude/timeline/:projectId/range forwards crossTrackRipple", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(rangeHandler.executeDeleteRange).mockResolvedValueOnce({
			deletedElements: 2,
			splitElements: 1,
			totalRemovedDuration: 5,
		});

		const res = await fetch("/api/claude/timeline/proj_123/range", {
			method: "DELETE",
			body: JSON.stringify({
				startTime: 10,
				endTime: 15,
				ripple: true,
				crossTrackRipple: true,
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.totalRemovedDuration).toBe(5);
		expect(rangeHandler.executeDeleteRange).toHaveBeenCalledWith(
			mockWindow,
			expect.objectContaining({
				startTime: 10,
				endTime: 15,
				ripple: true,
				crossTrackRipple: true,
			}),
		);
	});

	it("POST /api/claude/timeline/:projectId/arrange calls arrange handler", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(timelineHandler.arrangeTimeline).mockResolvedValueOnce({
			arranged: [{ elementId: "el_1", newStartTime: 0 }],
		});

		const res = await fetch("/api/claude/timeline/proj_123/arrange", {
			method: "POST",
			body: JSON.stringify({
				trackId: "track_1",
				mode: "sequential",
				gap: 0.5,
				startOffset: 0,
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.arranged.length).toBe(1);
		expect(timelineHandler.arrangeTimeline).toHaveBeenCalledWith(
			mockWindow,
			expect.objectContaining({
				trackId: "track_1",
				mode: "sequential",
			}),
			expect.any(String),
		);
	});

	it("POST /api/claude/timeline/:projectId/selection dispatches selection update", async () => {
		const send = vi.fn();
		const mockWindow = createMockWindow(send);
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		const elements = [{ trackId: "track_1", elementId: "element_abc" }];

		const res = await fetch("/api/claude/timeline/proj_123/selection", {
			method: "POST",
			body: JSON.stringify({ elements }),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.selected).toBe(1);
		expect(send).toHaveBeenCalledWith(
			"claude:timeline:selectElements",
			expect.objectContaining({
				elements,
			}),
		);
	});

	it("GET /api/claude/timeline/:projectId/selection returns renderer selection", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(
			timelineHandler.requestSelectionFromRenderer,
		).mockResolvedValueOnce([{ trackId: "track_1", elementId: "element_abc" }]);

		const res = await fetch("/api/claude/timeline/proj_123/selection");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.elements).toEqual([
			{ trackId: "track_1", elementId: "element_abc" },
		]);
		expect(timelineHandler.requestSelectionFromRenderer).toHaveBeenCalledWith(
			mockWindow,
			expect.any(String),
		);
	});

	it("GET /api/claude/timeline/:projectId/selection returns 504 on renderer timeout", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(
			timelineHandler.requestSelectionFromRenderer,
		).mockRejectedValueOnce(new HttpError(504, "Renderer timed out"));

		const res = await fetch("/api/claude/timeline/proj_123/selection");

		expect(res.status).toBe(504);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("Renderer timed out");
	});

	it("DELETE /api/claude/timeline/:projectId/selection clears selection", async () => {
		const send = vi.fn();
		const mockWindow = createMockWindow(send);
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);

		const res = await fetch("/api/claude/timeline/proj_123/selection", {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.cleared).toBe(true);
		expect(send).toHaveBeenCalledWith("claude:timeline:clearSelection");
	});

	it("returns 503 for timeline routes when no renderer window", async () => {
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([]);
		const res = await fetch("/api/claude/timeline/proj_123");

		expect(res.status).toBe(503);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("No active");
	});
});

/**
 * Integration tests for the Claude HTTP Server.
 * Uses a real HTTP server on an ephemeral port, with mocked Electron and handler functions.
 *
 * Timeline-specific tests live in claude-http-timeline.test.ts.
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
// Import the server and mocked electron after mocks
// ---------------------------------------------------------------------------

import {
	startClaudeHTTPServer,
	stopClaudeHTTPServer,
} from "../http/claude-http-server";
import { BrowserWindow } from "electron";
import * as timelineHandler from "../handlers/claude-timeline-handler.js";
import * as transactionHandler from "../handlers/claude-transaction-handler.js";
import { notificationBridge } from "../notification-bridge";
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
// Tests — Transaction, Health, Capabilities, CORS, Media, Export, Project,
//          Diagnostics, MCP, Notifications, misc, Auth
// ---------------------------------------------------------------------------

describe("Claude HTTP Server", () => {
	beforeEach(() => {
		notificationBridge.resetForTests();
		vi.mocked(BrowserWindow.getAllWindows).mockReset();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([]);
	});

	// -- Transactions -------------------------------------------------------

	it("POST /api/claude/transaction/begin returns transactionId", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);

		const res = await fetch("/api/claude/transaction/begin", {
			method: "POST",
			body: JSON.stringify({ label: "Batch add" }),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.transactionId).toBe("txn_test_1");
		expect(transactionHandler.beginTransaction).toHaveBeenCalled();
	});

	it("POST /api/claude/transaction/:id/commit proxies to handler", async () => {
		const res = await fetch("/api/claude/transaction/txn_test_1/commit", {
			method: "POST",
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.historyEntryAdded).toBe(true);
		expect(transactionHandler.commitTransaction).toHaveBeenCalledWith({
			transactionId: "txn_test_1",
		});
	});

	it("POST /api/claude/undo proxies to handler", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);

		const res = await fetch("/api/claude/undo", {
			method: "POST",
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.applied).toBe(true);
		expect(transactionHandler.undoTimeline).toHaveBeenCalled();
	});

	it("GET /api/claude/history returns history summary", async () => {
		const mockWindow = createMockWindow();
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);

		const res = await fetch("/api/claude/history");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.undoCount).toBe(2);
		expect(Array.isArray(res.body.data.entries)).toBe(true);
		expect(transactionHandler.getHistorySummary).toHaveBeenCalled();
	});

	// -- Import -------------------------------------------------------------

	it("POST /api/claude/timeline/:projectId/import rejects malformed markdown", async () => {
		const send = vi.fn();
		const mockWindow = createMockWindow(send);
		vi.mocked(BrowserWindow.getAllWindows).mockReturnValueOnce([mockWindow]);
		vi.mocked(timelineHandler.markdownToTimeline).mockImplementationOnce(
			() => {
				throw new Error("Invalid timeline markdown: No tracks found");
			},
		);

		const res = await fetch("/api/claude/timeline/proj_123/import", {
			method: "POST",
			body: JSON.stringify({
				format: "md",
				data: "# Not a timeline\n\nSome text.",
			}),
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("No tracks found");
	});

	// -- Health, Capabilities, Commands -------------------------------------

	it("GET /api/claude/health returns status ok", async () => {
		const res = await fetch("/api/claude/health");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.status).toBe("ok");
		expect(res.body.data.version).toBe("1.0.0-test");
		expect(res.body.data.appVersion).toBe("1.0.0-test");
		expect(res.body.data.apiVersion).toBeTypeOf("string");
		expect(res.body.data.protocolVersion).toBeTypeOf("string");
		expect(Array.isArray(res.body.data.capabilities)).toBe(true);
		expect(res.body.data.capabilities.length).toBeGreaterThan(0);
		expect(res.body.data.capabilities[0]).toHaveProperty("name");
		expect(res.body.data.capabilities[0]).toHaveProperty("version");
		expect(res.body.data.uptime).toBeTypeOf("number");
		expect(res.headers["access-control-allow-origin"]).toBe("*");
	});

	it("GET /api/claude/capabilities returns capability manifest", async () => {
		const res = await fetch("/api/claude/capabilities");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.apiVersion).toBeTypeOf("string");
		expect(res.body.data.protocolVersion).toBeTypeOf("string");
		expect(res.body.data.appVersion).toBe("1.0.0-test");
		expect(Array.isArray(res.body.data.capabilities)).toBe(true);
		expect(
			res.body.data.capabilities.some(
				(cap: { name: string }) => cap.name === "state.health",
			),
		).toBe(true);
	});

	it("GET /api/claude/capabilities/:name checks support and version", async () => {
		const supported = await fetch("/api/claude/capabilities/state.health");
		expect(supported.status).toBe(200);
		expect(supported.body.success).toBe(true);
		expect(supported.body.data.supported).toBe(true);
		expect(supported.body.data.version).toBeTypeOf("string");
		expect(supported.body.data.since).toBeTypeOf("string");

		const unsupported = await fetch(
			"/api/claude/capabilities/state.health?minVersion=99.0.0",
		);
		expect(unsupported.status).toBe(200);
		expect(unsupported.body.success).toBe(true);
		expect(unsupported.body.data.supported).toBe(false);
		expect(unsupported.body.data.version).toBeTypeOf("string");
	});

	it("GET /api/claude/commands/registry returns command metadata", async () => {
		const res = await fetch("/api/claude/commands/registry");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.apiVersion).toBeTypeOf("string");
		expect(res.body.data.count).toBeGreaterThan(0);
		expect(Array.isArray(res.body.data.commands)).toBe(true);
		expect(
			res.body.data.commands.some(
				(cmd: { name: string }) => cmd.name === "editor:health",
			),
		).toBe(true);
		expect(res.body.data.commands[0]).toHaveProperty("paramsSchema");
		expect(res.body.data.commands[0]).toHaveProperty("requiredCapability");
	});

	// -- CORS, Media, Export, Project, Diagnostics, MCP ---------------------

	it("responds to CORS preflight OPTIONS requests", async () => {
		const res = await fetch("/api/claude/project/proj_123/settings", {
			method: "OPTIONS",
		});

		expect(res.status).toBe(204);
		expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
	});

	it("GET /api/claude/media/:projectId returns media list", async () => {
		const res = await fetch("/api/claude/media/proj_123");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(Array.isArray(res.body.data)).toBe(true);
	});

	it("POST /api/claude/media/:projectId/import validates source", async () => {
		const res = await fetch("/api/claude/media/proj_123/import", {
			method: "POST",
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("source");
	});

	it("GET /api/claude/export/presets returns preset list", async () => {
		const res = await fetch("/api/claude/export/presets");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(Array.isArray(res.body.data)).toBe(true);
		expect(res.body.data.length).toBeGreaterThan(0);
	});

	it("GET /api/claude/project/:projectId/settings returns settings", async () => {
		const res = await fetch("/api/claude/project/proj_123/settings");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.name).toBe("Test");
		expect(res.body.data.width).toBe(1920);
	});

	it("GET /api/claude/project/:projectId/stats returns empty stats when no window", async () => {
		const res = await fetch("/api/claude/project/proj_123/stats");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.totalDuration).toBe(0);
	});

	it("GET /api/claude/export/:projectId/recommend/:target returns recommendation", async () => {
		const res = await fetch("/api/claude/export/proj_123/recommend/tiktok");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.preset).toBeDefined();
	});

	it("POST /api/claude/diagnostics/analyze requires message", async () => {
		const res = await fetch("/api/claude/diagnostics/analyze", {
			method: "POST",
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain("message");
	});

	it("POST /api/claude/diagnostics/analyze with valid input", async () => {
		const res = await fetch("/api/claude/diagnostics/analyze", {
			method: "POST",
			body: JSON.stringify({
				message: "ENOENT: no such file",
				context: "media import",
				timestamp: Date.now(),
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.errorType).toBeDefined();
	});

	it("POST /api/claude/mcp/app validates html payload", async () => {
		const res = await fetch("/api/claude/mcp/app", {
			method: "POST",
			body: JSON.stringify({ toolName: "configure-media" }),
		});

		expect(res.status).toBe(400);
		expect(res.body.error).toContain("html");
	});

	it("POST /api/claude/mcp/app accepts valid payload", async () => {
		const res = await fetch("/api/claude/mcp/app", {
			method: "POST",
			body: JSON.stringify({
				toolName: "configure-media",
				html: "<html><body>Test</body></html>",
			}),
		});

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data.forwarded).toBe(false);
	});

	// -- Notifications ------------------------------------------------------

	it("GET /api/claude/notifications/status returns initial disabled state", async () => {
		const res = await fetch("/api/claude/notifications/status");

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(res.body.data).toEqual({
			enabled: false,
			sessionId: null,
		});
	});

	it("POST /api/claude/notifications/enable validates sessionId", async () => {
		const res = await fetch("/api/claude/notifications/enable", {
			method: "POST",
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
		expect(res.body.success).toBe(false);
		expect(res.body.error).toContain("sessionId");
	});

	it("notification routes support enable/disable/history flow", async () => {
		const enableRes = await fetch("/api/claude/notifications/enable", {
			method: "POST",
			body: JSON.stringify({ sessionId: "pty-test-1" }),
		});
		expect(enableRes.status).toBe(200);
		expect(enableRes.body.data).toEqual({
			enabled: true,
			sessionId: "pty-test-1",
		});

		const statusRes = await fetch("/api/claude/notifications/status");
		expect(statusRes.status).toBe(200);
		expect(statusRes.body.data.enabled).toBe(true);
		expect(statusRes.body.data.sessionId).toBe("pty-test-1");

		const historyRes = await fetch(
			"/api/claude/notifications/history?limit=5",
		);
		expect(historyRes.status).toBe(200);
		expect(historyRes.body.success).toBe(true);
		expect(Array.isArray(historyRes.body.data)).toBe(true);

		const disableRes = await fetch("/api/claude/notifications/disable", {
			method: "POST",
			body: JSON.stringify({}),
		});
		expect(disableRes.status).toBe(200);
		expect(disableRes.body.data).toEqual({
			enabled: false,
			sessionId: null,
		});
	});

	// -- Misc ---------------------------------------------------------------

	it("returns 404 for unknown routes", async () => {
		const res = await fetch("/api/claude/nonexistent");

		expect(res.status).toBe(404);
		expect(res.body.success).toBe(false);
	});

	it("all responses include timestamp", async () => {
		const res = await fetch("/api/claude/health");

		expect(res.body.timestamp).toBeTypeOf("number");
		expect(res.body.timestamp).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("Claude HTTP Server - Auth", () => {
	it("accepts requests without token when QCUT_API_TOKEN is not set", async () => {
		delete process.env.QCUT_API_TOKEN;
		const res = await fetch("/api/claude/health");
		expect(res.status).toBe(200);
	});

	it("rejects requests without auth token when QCUT_API_TOKEN is set", async () => {
		process.env.QCUT_API_TOKEN = "test-secret-token";
		try {
			const res = await fetch("/api/claude/health");
			expect(res.status).toBe(401);
			expect(res.body.error).toBe("Unauthorized");
		} finally {
			delete process.env.QCUT_API_TOKEN;
		}
	});

	it("accepts requests with valid auth token", async () => {
		process.env.QCUT_API_TOKEN = "test-secret-token";
		try {
			const res = await fetch("/api/claude/health", {
				headers: { Authorization: "Bearer test-secret-token" },
			});
			expect(res.status).toBe(200);
		} finally {
			delete process.env.QCUT_API_TOKEN;
		}
	});

	it("rejects requests with wrong auth token", async () => {
		process.env.QCUT_API_TOKEN = "test-secret-token";
		try {
			const res = await fetch("/api/claude/health", {
				headers: { Authorization: "Bearer wrong-token" },
			});
			expect(res.status).toBe(401);
		} finally {
			delete process.env.QCUT_API_TOKEN;
		}
	});
});

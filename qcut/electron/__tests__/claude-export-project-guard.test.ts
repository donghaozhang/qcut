/**
 * Pins the export-start route guard: the renderer can only snapshot the
 * currently open project, so POST /api/claude/export/:projectId/start must
 * refuse a projectId that does not match the snapshot instead of silently
 * exporting the wrong timeline.
 */

import { describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => tmpdir()),
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

vi.mock("../claude/handlers/claude-export-handler.js", async (original) => ({
	...(await original<Record<string, unknown>>()),
	startExportJob: vi.fn(async () => ({
		jobId: "test-job",
		status: "queued",
	})),
}));

vi.mock("../claude/handlers/claude-media-handler.js", async (original) => ({
	...(await original<Record<string, unknown>>()),
	listMediaFiles: vi.fn(async () => []),
}));

import {
	registerSharedRoutes,
	type WindowAccessor,
} from "../claude/http/claude-http-shared-routes";
import type { Router } from "../claude/utils/http-router";
import type { ClaudeTimeline } from "../types/claude-api";
import { startExportJob } from "../claude/handlers/claude-export-handler.js";

type RouteHandler = (req: {
	params: Record<string, string>;
	query: Record<string, string>;
	body?: unknown;
}) => Promise<unknown>;

function buildRouterHarness(): {
	router: Router;
	getHandler: (method: string, path: string) => RouteHandler;
} {
	const handlers = new Map<string, RouteHandler>();
	const record = (method: string) => (path: string, handler: RouteHandler) => {
		handlers.set(`${method} ${path}`, handler);
	};
	const router = {
		get: record("GET"),
		post: record("POST"),
		patch: record("PATCH"),
		delete: record("DELETE"),
		handle: () => {},
	} as unknown as Router;
	return {
		router,
		getHandler: (method, path) => {
			const handler = handlers.get(`${method} ${path}`);
			if (!handler) throw new Error(`Route not registered: ${method} ${path}`);
			return handler;
		},
	};
}

function buildAccessor(timeline: ClaudeTimeline): WindowAccessor {
	return new Proxy({} as WindowAccessor, {
		get(_target, property) {
			if (property === "requestTimeline") {
				return async () => timeline;
			}
			if (property === "getAppVersion") {
				return () => "0.0.1-test";
			}
			if (property === "getWindow") {
				return () => ({ webContents: { send: () => {} } });
			}
			return vi.fn(async () => ({}));
		},
	});
}

function buildTimeline(projectId?: string): ClaudeTimeline {
	return {
		name: "Guard test",
		duration: 1,
		width: 1920,
		height: 1080,
		fps: 30,
		tracks: [],
		projectId,
	};
}

const EXPORT_START = "POST /api/claude/export/:projectId/start";

describe("export start project guard", () => {
	it("rejects a projectId that is not the open project with 409", async () => {
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, buildAccessor(buildTimeline("project-a")));
		const [method, path] = EXPORT_START.split(" ");
		await expect(
			getHandler(
				method,
				path
			)({
				params: { projectId: "project-b" },
				query: {},
				body: {},
			})
		).rejects.toMatchObject({
			status: 409,
			message: expect.stringContaining("not open"),
		});
		expect(startExportJob).not.toHaveBeenCalled();
	});

	it("starts the export when the projectId matches the open project", async () => {
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, buildAccessor(buildTimeline("project-a")));
		const [method, path] = EXPORT_START.split(" ");
		const result = await getHandler(
			method,
			path
		)({
			params: { projectId: "project-a" },
			query: {},
			body: {},
		});
		expect(result).toMatchObject({ jobId: "test-job" });
	});

	it("keeps legacy behavior when the snapshot has no projectId", async () => {
		const { router, getHandler } = buildRouterHarness();
		registerSharedRoutes(router, buildAccessor(buildTimeline(undefined)));
		const [method, path] = EXPORT_START.split(" ");
		const result = await getHandler(
			method,
			path
		)({
			params: { projectId: "project-b" },
			query: {},
			body: {},
		});
		expect(result).toMatchObject({ jobId: "test-job" });
	});
});

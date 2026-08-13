/**
 * Tests for the lightweight HTTP router utility.
 * Validates route matching, param extraction, body parsing, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRouter, HttpError } from "../utils/http-router";
import * as http from "node:http";
import { EventEmitter } from "node:events";

// Mock electron modules (imported transitively)
vi.mock("electron", () => ({
	app: {
		getPath: vi.fn(() => "/mock/Documents"),
		getVersion: vi.fn(() => "0.0.1"),
	},
	ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn() },
	BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

/**
 * Helper to create a mock IncomingMessage
 */
function createMockReq(
	method: string,
	url: string,
	body?: string
): http.IncomingMessage {
	const req = new EventEmitter() as http.IncomingMessage;
	req.method = method;
	req.url = url;
	req.headers = {};
	req.setTimeout = vi.fn();

	// Simulate body sending after a tick
	if (body !== undefined) {
		process.nextTick(() => {
			req.emit("data", Buffer.from(body));
			req.emit("end");
		});
	} else {
		process.nextTick(() => req.emit("end"));
	}

	return req;
}

/**
 * Helper to create a mock ServerResponse that captures writes
 */
function createMockRes(): http.ServerResponse & {
	_status: number;
	_body: string;
	_headers: Record<string, string>;
} {
	const res = {
		_status: 0,
		_body: "",
		_headers: {} as Record<string, string>,
		headersSent: false,
		writableEnded: false,
		writeHead(status: number, headers?: Record<string, string>) {
			res._status = status;
			res.headersSent = true;
			if (headers) Object.assign(res._headers, headers);
		},
		end(body?: string) {
			res._body = body || "";
			res.writableEnded = true;
		},
	} as any;
	return res;
}

describe("HTTP Router", () => {
	it("matches GET routes with path params", async () => {
		const router = createRouter();
		const handler = vi.fn(async (req) => ({
			id: req.params.projectId,
		}));
		router.get("/api/claude/media/:projectId", handler);

		const req = createMockReq("GET", "/api/claude/media/proj_123");
		const res = createMockRes();

		await router.handle(req, res);

		expect(handler).toHaveBeenCalledOnce();
		expect(handler.mock.calls[0][0].params.projectId).toBe("proj_123");
		expect(res._status).toBe(200);

		const body = JSON.parse(res._body);
		expect(body.success).toBe(true);
		expect(body.data.id).toBe("proj_123");
	});

	it("matches routes with multiple path params", async () => {
		const router = createRouter();
		const handler = vi.fn(async (req) => ({
			project: req.params.projectId,
			media: req.params.mediaId,
		}));
		router.get("/api/claude/media/:projectId/:mediaId", handler);

		const req = createMockReq("GET", "/api/claude/media/proj_1/media_abc");
		const res = createMockRes();

		await router.handle(req, res);

		expect(handler.mock.calls[0][0].params).toEqual({
			projectId: "proj_1",
			mediaId: "media_abc",
		});
	});

	it("matches POST routes and parses JSON body", async () => {
		const router = createRouter();
		const handler = vi.fn(async (req) => ({
			received: req.body.source,
		}));
		router.post("/api/claude/media/:projectId/import", handler);

		const req = createMockReq(
			"POST",
			"/api/claude/media/proj_1/import",
			JSON.stringify({ source: "/path/to/file.mp4" })
		);
		const res = createMockRes();

		await router.handle(req, res);

		expect(handler).toHaveBeenCalledOnce();
		expect(handler.mock.calls[0][0].body.source).toBe("/path/to/file.mp4");
		expect(res._status).toBe(200);
	});

	it("returns 404 for unknown routes", async () => {
		const router = createRouter();
		router.get("/api/claude/health", async () => ({ status: "ok" }));

		const req = createMockReq("GET", "/api/claude/nonexistent");
		const res = createMockRes();

		await router.handle(req, res);

		expect(res._status).toBe(404);
		const body = JSON.parse(res._body);
		expect(body.success).toBe(false);
		expect(body.error).toContain("Not found");
	});

	it("extracts query parameters", async () => {
		const router = createRouter();
		const handler = vi.fn(async (req) => ({
			format: req.query.format,
		}));
		router.get("/api/claude/timeline/:projectId", handler);

		const req = createMockReq("GET", "/api/claude/timeline/proj_1?format=md");
		const res = createMockRes();

		await router.handle(req, res);

		expect(handler.mock.calls[0][0].query.format).toBe("md");
	});

	it("returns 400 for invalid JSON body", async () => {
		const router = createRouter();
		router.post("/api/test", async (req) => req.body);

		const req = createMockReq("POST", "/api/test", "not valid json{");
		const res = createMockRes();

		await router.handle(req, res);

		expect(res._status).toBe(400);
		const body = JSON.parse(res._body);
		expect(body.error).toBe("Invalid JSON");
	});

	it("returns 413 for oversized body", async () => {
		const router = createRouter();
		router.post("/api/test", async (req) => req.body);

		const req = new EventEmitter() as http.IncomingMessage;
		req.method = "POST";
		req.url = "/api/test";
		req.headers = {};
		req.setTimeout = vi.fn();
		(req as any).destroy = vi.fn();

		const res = createMockRes();

		// Start handling, then send oversized data
		const handlePromise = router.handle(req, res);

		// Send >1MB of data
		const chunk = Buffer.alloc(1024 * 1024 + 1, "x");
		req.emit("data", chunk);

		await handlePromise;

		expect(res._status).toBe(413);
		const body = JSON.parse(res._body);
		expect(body.error).toBe("Payload too large");
	});

	it("handles HttpError thrown by handler", async () => {
		const router = createRouter();
		router.get("/api/test", async () => {
			throw new HttpError(503, "No active window");
		});

		const req = createMockReq("GET", "/api/test");
		const res = createMockRes();

		await router.handle(req, res);

		expect(res._status).toBe(503);
		const body = JSON.parse(res._body);
		expect(body.success).toBe(false);
		expect(body.error).toBe("No active window");
	});

	it("handles generic errors thrown by handler", async () => {
		const router = createRouter();
		router.get("/api/test", async () => {
			throw new Error("Something broke");
		});

		const req = createMockReq("GET", "/api/test");
		const res = createMockRes();

		await router.handle(req, res);

		expect(res._status).toBe(500);
		const body = JSON.parse(res._body);
		expect(body.success).toBe(false);
		expect(body.error).toBe("Something broke");
	});

	it("does not match wrong HTTP method", async () => {
		const router = createRouter();
		router.get("/api/test", async () => ({ ok: true }));

		const req = createMockReq("POST", "/api/test", "{}");
		const res = createMockRes();

		await router.handle(req, res);

		expect(res._status).toBe(404);
	});

	it("supports PATCH and DELETE methods", async () => {
		const router = createRouter();
		const patchHandler = vi.fn(async () => ({ patched: true }));
		const deleteHandler = vi.fn(async () => ({ deleted: true }));

		router.patch("/api/item/:id", patchHandler);
		router.delete("/api/item/:id", deleteHandler);

		// Test PATCH
		const patchReq = createMockReq("PATCH", "/api/item/42", "{}");
		const patchRes = createMockRes();
		await router.handle(patchReq, patchRes);
		expect(patchRes._status).toBe(200);
		expect(patchHandler).toHaveBeenCalledOnce();

		// Test DELETE
		const delReq = createMockReq("DELETE", "/api/item/42", "{}");
		const delRes = createMockRes();
		await router.handle(delReq, delRes);
		expect(delRes._status).toBe(200);
		expect(deleteHandler).toHaveBeenCalledOnce();
	});

	it("decodes URI-encoded path parameters", async () => {
		const router = createRouter();
		const handler = vi.fn(async (req) => req.params);
		router.get("/api/:name", handler);

		const req = createMockReq("GET", "/api/hello%20world");
		const res = createMockRes();

		await router.handle(req, res);

		expect(handler.mock.calls[0][0].params.name).toBe("hello world");
	});

	it("does not write a second response after one was already sent", async () => {
		const router = createRouter();
		router.get("/api/test", async (req) => {
			// Simulate a socket-timeout 408 racing the handler: the response
			// is already finished when the handler settles.
			req.rawRes.writeHead(408, { "Content-Type": "application/json" });
			req.rawRes.end(
				JSON.stringify({ success: false, error: "Request timeout" })
			);
			return { late: true };
		});

		const req = createMockReq("GET", "/api/test");
		const res = createMockRes();

		await expect(router.handle(req, res)).resolves.toBeUndefined();

		expect(res._status).toBe(408);
		const body = JSON.parse(res._body);
		expect(body.error).toBe("Request timeout");
	});

	it("includes timestamp in all responses", async () => {
		const router = createRouter();
		router.get("/api/test", async () => "ok");

		const req = createMockReq("GET", "/api/test");
		const res = createMockRes();

		await router.handle(req, res);

		const body = JSON.parse(res._body);
		expect(body.timestamp).toBeTypeOf("number");
		expect(body.timestamp).toBeGreaterThan(0);
	});
});

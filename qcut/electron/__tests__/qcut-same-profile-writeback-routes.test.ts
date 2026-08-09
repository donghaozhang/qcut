import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerQCutSameProfileWritebackRoutes } from "../claude/http/claude-http-same-profile-writeback-routes";
import { createRouter } from "../claude/utils/http-router";
import {
	QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	type QCutSameProfileWritebackResult,
} from "../types/qcut-same-profile-writeback-api";

const servers: Server[] = [];

function unchangedResult(): QCutSameProfileWritebackResult {
	return {
		operation: "writeback",
		outcome: "unchanged",
		projectId: "project-1",
		schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
		schemaVersion: 1,
	};
}

async function startRouteServer({
	requestOperation,
	timeoutMs,
}: {
	requestOperation: Parameters<
		typeof registerQCutSameProfileWritebackRoutes
	>[1]["requestOperation"];
	timeoutMs?: number;
}): Promise<string> {
	const router = createRouter();
	registerQCutSameProfileWritebackRoutes(router, {
		requestOperation,
		timeoutMs,
	});
	const server = createServer((request, response) => {
		router.handle(request, response);
	});
	servers.push(server);
	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("Test HTTP server did not bind a TCP port.");
	}
	return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
	const closing = servers.splice(0).map(
		(server) =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else resolve();
				});
			})
	);
	await Promise.all(closing);
});

describe("same-profile writeback HTTP route", () => {
	it("forwards a validated writeback request", async () => {
		const requestOperation = vi.fn(async () => unchangedResult());
		const baseUrl = await startRouteServer({ requestOperation });
		const response = await fetch(`${baseUrl}/api/claude/interop/writeback`, {
			body: JSON.stringify({ action: "writeback", projectId: "project-1" }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});
		const body = (await response.json()) as {
			data: QCutSameProfileWritebackResult;
		};

		expect(response.status).toBe(200);
		expect(requestOperation).toHaveBeenCalledWith({
			action: "writeback",
			projectId: "project-1",
		});
		expect(body.data).toEqual(unchangedResult());
	});

	it("forwards a recovery token without a project path", async () => {
		const recovered: QCutSameProfileWritebackResult = {
			operation: "recover",
			outcome: "recovered",
			recoveryAction: "none",
			schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
			schemaVersion: 1,
			transactionId: null,
			warnings: [],
		};
		const requestOperation = vi.fn(async () => recovered);
		const baseUrl = await startRouteServer({ requestOperation });
		const response = await fetch(`${baseUrl}/api/claude/interop/writeback`, {
			body: JSON.stringify({
				action: "recover",
				recoveryToken: "selection-1",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});

		expect(response.status).toBe(200);
		expect(requestOperation).toHaveBeenCalledWith({
			action: "recover",
			recoveryToken: "selection-1",
		});
	});

	it("returns HTTP 400 before dispatching path-bearing input", async () => {
		const requestOperation = vi.fn(async () => unchangedResult());
		const baseUrl = await startRouteServer({ requestOperation });
		const response = await fetch(`${baseUrl}/api/claude/interop/writeback`, {
			body: JSON.stringify({
				action: "writeback",
				draftDirectory: "/private/draft",
				projectId: "project-1",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});

		expect(response.status).toBe(400);
		expect(requestOperation).not.toHaveBeenCalled();
	});

	it("returns HTTP 504 when the renderer exceeds the route deadline", async () => {
		const baseUrl = await startRouteServer({
			requestOperation: async () => await new Promise(() => {}),
			timeoutMs: 5,
		});
		const response = await fetch(`${baseUrl}/api/claude/interop/writeback`, {
			body: JSON.stringify({ action: "writeback", projectId: "project-1" }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		});

		expect(response.status).toBe(504);
	});
});

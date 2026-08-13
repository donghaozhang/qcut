import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerQCutJianyingProjectExportRoutes } from "../claude/http/claude-http-jianying-project-export-routes";
import { createRouter } from "../claude/utils/http-router";
import {
	QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
	type QCutJianyingProjectExportResult,
} from "../types/qcut-jianying-project-export-api";

const servers: Server[] = [];

function cancelledResult(): QCutJianyingProjectExportResult {
	return {
		outcome: "cancelled",
		projectId: "project-1",
		schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
		schemaVersion: 1,
	};
}

async function startRouteServer({
	requestExport,
	timeoutMs,
}: {
	requestExport: Parameters<
		typeof registerQCutJianyingProjectExportRoutes
	>[1]["requestExport"];
	timeoutMs?: number;
}): Promise<string> {
	const router = createRouter();
	registerQCutJianyingProjectExportRoutes(router, {
		requestExport,
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
	await Promise.all(
		servers.splice(0).map(
			(server) =>
				new Promise<void>((resolve, reject) => {
					server.close((error) => {
						if (error) reject(error);
						else resolve();
					});
				})
		)
	);
});

describe("Jianying project export HTTP route", () => {
	it("forwards a validated project-only request", async () => {
		const requestExport = vi.fn(async () => cancelledResult());
		const baseUrl = await startRouteServer({ requestExport });
		const response = await fetch(
			`${baseUrl}/api/claude/interop/jianying-project-export`,
			{
				body: JSON.stringify({ projectId: "project-1" }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);
		const body = (await response.json()) as {
			data: QCutJianyingProjectExportResult;
		};

		expect(response.status).toBe(200);
		expect(requestExport).toHaveBeenCalledWith({ projectId: "project-1" });
		expect(body.data).toEqual(cancelledResult());
	});

	it("rejects path-bearing input before dispatch", async () => {
		const requestExport = vi.fn(async () => cancelledResult());
		const baseUrl = await startRouteServer({ requestExport });
		const response = await fetch(
			`${baseUrl}/api/claude/interop/jianying-project-export`,
			{
				body: JSON.stringify({
					projectId: "project-1",
					outputDirectory: "/private/output",
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);

		expect(response.status).toBe(400);
		expect(requestExport).not.toHaveBeenCalled();
	});

	it("returns HTTP 504 when renderer export exceeds the deadline", async () => {
		const baseUrl = await startRouteServer({
			requestExport: async () => await new Promise(() => {}),
			timeoutMs: 5,
		});
		const response = await fetch(
			`${baseUrl}/api/claude/interop/jianying-project-export`,
			{
				body: JSON.stringify({ projectId: "project-1" }),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);

		expect(response.status).toBe(504);
	});
});

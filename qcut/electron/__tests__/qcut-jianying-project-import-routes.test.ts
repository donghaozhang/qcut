import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerQCutJianyingProjectImportRoutes } from "../claude/http/claude-http-jianying-project-import-routes";
import { createRouter } from "../claude/utils/http-router";
import {
	QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
	type QCutJianyingProjectImportResult,
} from "../types/qcut-jianying-project-import-api";

const servers: Server[] = [];

function importedResult(): QCutJianyingProjectImportResult {
	return {
		outcome: "imported",
		profileId: "profile-1",
		projectId: "project-1",
		reversible: true,
		schema: QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
		schemaVersion: 1,
		sourceScope: "selected-directory",
		warningFingerprints: [],
	};
}

async function startRouteServer({
	requestImport,
	timeoutMs,
}: {
	requestImport: Parameters<
		typeof registerQCutJianyingProjectImportRoutes
	>[1]["requestImport"];
	timeoutMs?: number;
}): Promise<string> {
	const router = createRouter();
	registerQCutJianyingProjectImportRoutes(router, {
		requestImport,
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

describe("Jianying project import HTTP route", () => {
	it("forwards a validated local import request", async () => {
		const requestImport = vi.fn(async () => importedResult());
		const baseUrl = await startRouteServer({ requestImport });
		const response = await fetch(
			`${baseUrl}/api/claude/interop/jianying-project-import`,
			{
				body: JSON.stringify({
					acceptedWarningFingerprints: [],
					draftPath: "/private/draft",
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);
		const body = (await response.json()) as {
			data: QCutJianyingProjectImportResult;
		};

		expect(response.status).toBe(200);
		expect(requestImport).toHaveBeenCalledWith({
			acceptedWarningFingerprints: [],
			draftPath: "/private/draft",
		});
		expect(body.data).toEqual(importedResult());
	});

	it("rejects relative paths before dispatch", async () => {
		const requestImport = vi.fn(async () => importedResult());
		const baseUrl = await startRouteServer({ requestImport });
		const response = await fetch(
			`${baseUrl}/api/claude/interop/jianying-project-import`,
			{
				body: JSON.stringify({
					acceptedWarningFingerprints: [],
					draftPath: "relative/draft",
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);

		expect(response.status).toBe(400);
		expect(requestImport).not.toHaveBeenCalled();
	});

	it("returns HTTP 504 when renderer import exceeds the deadline", async () => {
		const baseUrl = await startRouteServer({
			requestImport: async () => await new Promise(() => {}),
			timeoutMs: 5,
		});
		const response = await fetch(
			`${baseUrl}/api/claude/interop/jianying-project-import`,
			{
				body: JSON.stringify({
					acceptedWarningFingerprints: [],
					draftPath: "/private/draft",
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}
		);

		expect(response.status).toBe(504);
	});
});

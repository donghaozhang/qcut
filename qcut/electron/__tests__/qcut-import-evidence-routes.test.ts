import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerQCutImportEvidenceRoutes } from "../claude/http/claude-http-import-evidence-routes";
import { createRouter } from "../claude/utils/http-router";
import {
	QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
	type QCutPersistedImportEvidenceSnapshot,
} from "../types/qcut-import-evidence-api";
import {
	parseQCutPersistedImportEvidenceRequest,
	parseQCutPersistedImportEvidenceSnapshot,
} from "../types/qcut-import-evidence-validation";

const BUNDLE_DIGEST = "b".repeat(64);
const servers: Server[] = [];

function createSnapshot(): QCutPersistedImportEvidenceSnapshot {
	return {
		binding: {
			bundleDigest: BUNDLE_DIGEST,
			importId: "plan-token",
			profileId: "capcut-desktop-8.1-plaintext",
		},
		capture: {
			appVersion: "2026.08.05.1",
			capturedAtIso: "2026-08-05T01:02:03.000Z",
			readPasses: 2,
			source: "qcut-renderer-persisted-storage",
		},
		media: [],
		project: {
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Imported Project",
			sceneId: "scene-1",
			width: 1920,
		},
		schema: QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
		schemaVersion: 1,
		tracks: [{ id: "track-1", elements: [] }],
	};
}

async function startRouteServer({
	requestSnapshot,
	timeoutMs,
}: {
	requestSnapshot: Parameters<
		typeof registerQCutImportEvidenceRoutes
	>[1]["requestSnapshot"];
	timeoutMs?: number;
}): Promise<string> {
	const router = createRouter();
	registerQCutImportEvidenceRoutes(router, { requestSnapshot, timeoutMs });
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

describe("QCut persisted import evidence validation", () => {
	it("parses a strict request and trusted snapshot", () => {
		expect(
			parseQCutPersistedImportEvidenceRequest({
				value: {
					projectId: "project-1",
					expectedBundleDigest: BUNDLE_DIGEST,
				},
			})
		).toEqual({
			projectId: "project-1",
			expectedBundleDigest: BUNDLE_DIGEST,
		});
		expect(
			parseQCutPersistedImportEvidenceSnapshot({ value: createSnapshot() })
		).toEqual(createSnapshot());
	});

	it("rejects unknown request fields and untrusted capture metadata", () => {
		expect(() =>
			parseQCutPersistedImportEvidenceRequest({
				value: {
					projectId: "project-1",
					expectedBundleDigest: BUNDLE_DIGEST,
					sourcePath: "/private/draft",
				},
			})
		).toThrow("unsupported field");
		const snapshot = createSnapshot();
		const value = {
			...snapshot,
			capture: { ...snapshot.capture, readPasses: 1 },
		};
		expect(() => parseQCutPersistedImportEvidenceSnapshot({ value })).toThrow(
			"not trusted"
		);
	});
});

describe("QCut persisted import evidence HTTP route", () => {
	it("forwards a validated request to the renderer accessor", async () => {
		const requestSnapshot = vi.fn(async () => createSnapshot());
		const baseUrl = await startRouteServer({ requestSnapshot });
		const response = await fetch(
			`${baseUrl}/api/claude/interop/import-snapshot`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					expectedBundleDigest: BUNDLE_DIGEST,
				}),
			}
		);
		const body = (await response.json()) as {
			data: QCutPersistedImportEvidenceSnapshot;
		};

		expect(response.status).toBe(200);
		expect(requestSnapshot).toHaveBeenCalledWith({
			projectId: "project-1",
			expectedBundleDigest: BUNDLE_DIGEST,
		});
		expect(body.data.schema).toBe(QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA);
	});

	it("returns HTTP 400 before invoking the renderer for invalid input", async () => {
		const requestSnapshot = vi.fn(async () => createSnapshot());
		const baseUrl = await startRouteServer({ requestSnapshot });
		const response = await fetch(
			`${baseUrl}/api/claude/interop/import-snapshot`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId: "project-1" }),
			}
		);

		expect(response.status).toBe(400);
		expect(requestSnapshot).not.toHaveBeenCalled();
	});

	it("returns HTTP 504 when renderer capture exceeds the route deadline", async () => {
		const baseUrl = await startRouteServer({
			requestSnapshot: async () => await new Promise(() => {}),
			timeoutMs: 5,
		});
		const response = await fetch(
			`${baseUrl}/api/claude/interop/import-snapshot`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					projectId: "project-1",
					expectedBundleDigest: BUNDLE_DIGEST,
				}),
			}
		);

		expect(response.status).toBe(504);
	});
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../services/user-library-service", () => ({
	listUserLibraryDocuments: vi.fn(),
	putUserLibraryDocument: vi.fn(),
}));

const libraryService = await import("../services/user-library-service");
const { userLibraryRoutes } = await import("./user-library");

function libraryDocument({ version = 1 }: { version?: number } = {}) {
	return {
		id: "library-1",
		userId: "mock-user-001",
		namespace: "color-presets",
		documentKey: "collection",
		payload: { items: [{ id: "preset-1", name: "Film" }] },
		version,
		createdAt: new Date("2026-07-13T00:00:00.000Z"),
		updatedAt: new Date("2026-07-13T00:01:00.000Z"),
	};
}

function buildApp() {
	const app = new Hono();
	app.route("/api/library", userLibraryRoutes);
	return app;
}

function postDocument({ body }: { body: unknown }) {
	return buildApp().request("/api/library/documents", {
		method: "POST",
		headers: {
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	process.env.MOCK_MODE = "true";
	vi.clearAllMocks();
});

describe("user library routes", () => {
	it("lists only supported namespaces for the signed-in user", async () => {
		vi.mocked(libraryService.listUserLibraryDocuments).mockResolvedValue([
			libraryDocument(),
		]);
		const response = await buildApp().request(
			"/api/library?namespace=color-presets",
			{ headers: { Authorization: "Bearer test-token" } }
		);
		expect(response.status).toBe(200);
		expect(libraryService.listUserLibraryDocuments).toHaveBeenCalledWith({
			namespace: "color-presets",
			userId: "mock-user-001",
		});
	});

	it("rejects unsupported namespaces and unsafe keys", async () => {
		const unsupported = await postDocument({
			body: {
				namespace: "secrets",
				documentKey: "collection",
				payload: {},
				baseVersion: 0,
			},
		});
		const unsafeKey = await postDocument({
			body: {
				namespace: "color-presets",
				documentKey: "../collection",
				payload: {},
				baseVersion: 0,
			},
		});
		expect(unsupported.status).toBe(400);
		expect(unsafeKey.status).toBe(400);
		expect(libraryService.putUserLibraryDocument).not.toHaveBeenCalled();
	});

	it("writes a versioned document", async () => {
		vi.mocked(libraryService.putUserLibraryDocument).mockResolvedValue({
			document: libraryDocument({ version: 2 }),
			status: "updated",
		});
		const payload = { items: [{ id: "preset-1", name: "Film" }] };
		const response = await postDocument({
			body: {
				namespace: "color-presets",
				documentKey: "collection",
				payload,
				baseVersion: 1,
			},
		});
		expect(response.status).toBe(200);
		expect(libraryService.putUserLibraryDocument).toHaveBeenCalledWith({
			baseVersion: 1,
			documentKey: "collection",
			namespace: "color-presets",
			payload,
			userId: "mock-user-001",
		});
	});

	it("accepts the synced audio library namespace", async () => {
		vi.mocked(libraryService.putUserLibraryDocument).mockResolvedValue({
			document: { ...libraryDocument(), namespace: "audio-library" },
			status: "updated",
		});
		const payload = {
			items: [{ id: "favorite:music:-1001", type: "favorite" }],
		};
		const response = await postDocument({
			body: {
				namespace: "audio-library",
				documentKey: "default",
				payload,
				baseVersion: 0,
			},
		});

		expect(response.status).toBe(200);
		expect(libraryService.putUserLibraryDocument).toHaveBeenCalledWith({
			baseVersion: 0,
			documentKey: "default",
			namespace: "audio-library",
			payload,
			userId: "mock-user-001",
		});
	});

	it("returns the current document when optimistic locking fails", async () => {
		vi.mocked(libraryService.putUserLibraryDocument).mockResolvedValue({
			current: libraryDocument({ version: 4 }),
			status: "conflict",
		});
		const response = await postDocument({
			body: {
				namespace: "color-presets",
				documentKey: "collection",
				payload: { items: [] },
				baseVersion: 2,
			},
		});
		expect(response.status).toBe(409);
		const body = await response.json();
		expect(body.current.version).toBe(4);
	});
});

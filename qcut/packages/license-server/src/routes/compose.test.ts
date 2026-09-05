import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono, type Context, type Next } from "hono";
import { computeComposeSourceFingerprint } from "@qcut/editor-core/compose";
import { createComposeRoutes } from "./compose";
import type {
	ComposeCloudInput,
	ComposeCloudRow,
	composeJobStore,
} from "../compose/job-store";

vi.mock("../middleware/auth", () => ({
	authMiddleware: async (c: Context, next: Next) => {
		if (c.req.header("Authorization") !== "Bearer test-session")
			return c.json({ error: "unauthorized" }, 401);
		c.set("userId", "user-1");
		await next();
	},
}));

const project = {
	id: "project",
	fps: 30,
	duration: 10,
	canvasSize: { width: 1920, height: 1080 },
};
const captions = [{ id: "caption", text: "Hello", startTime: 0, duration: 2 }];
const input: ComposeCloudInput = {
	snapshot: {
		schemaVersion: 1,
		id: "snapshot",
		createdAt: "2026-09-06T00:00:00Z",
		sourceFingerprint: computeComposeSourceFingerprint({
			project,
			media: [],
			captions,
		}),
		project,
		media: [],
		captions,
		beats: [],
		shots: [],
		availableResources: [],
		capabilities: { editorApply: true, headlessRender: false },
	},
	intent: { schemaVersion: 1, kind: "full-compose", options: {} },
};
const row: ComposeCloudRow = {
	id: "job-1",
	user_id: "user-1",
	status: "queued",
	input,
	input_hash: "hash",
	result: null,
	attempt: 0,
	lease_token: null,
	error_code: null,
};

function fixture() {
	const store: typeof composeJobStore = {
		create: vi.fn(async () => row),
		get: vi.fn(async () => row),
		cancel: vi.fn(async () => ({ ...row, status: "canceled" as const })),
		claim: vi.fn(async () => undefined),
		finish: vi.fn(async () => true),
	};
	const app = new Hono().route("/api/compose", createComposeRoutes({ store }));
	const submit = ({
		body = { id: row.id, ...input },
	}: {
		body?: unknown;
	} = {}) =>
		app.request("/api/compose/jobs", {
			method: "POST",
			headers: {
				Authorization: "Bearer test-session",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});
	return { app, store, submit };
}
beforeEach(() => vi.stubEnv("QCUT_COMPOSE_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("authenticated Compose queue", () => {
	it("requires authentication before reading or writing jobs", async () => {
		const { app, store } = fixture();
		expect((await app.request("/api/compose/jobs/job-1")).status).toBe(401);
		expect(store.get).not.toHaveBeenCalled();
	});
	it("admits public snapshots under the authenticated owner and a stable hash", async () => {
		const { submit, store } = fixture();
		expect((await submit()).status).toBe(202);
		expect((await submit()).status).toBe(202);
		expect(store.create).toHaveBeenCalledWith({
			id: "job-1",
			userId: "user-1",
			input,
			inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
		expect(vi.mocked(store.create).mock.calls[0]).toEqual(
			vi.mocked(store.create).mock.calls[1]
		);
	});
	it("rejects private resource locators and malformed inputs before persistence", async () => {
		const { submit, store } = fixture();
		const privateSnapshot = {
			...input.snapshot,
			availableResources: [
				{
					provider: "local",
					assetType: "font",
					assetId: "font",
					localPath: "/private/font.ttf",
				},
			],
		};
		expect(
			(
				await submit({
					body: { id: "job-1", ...input, snapshot: privateSnapshot },
				})
			).status
		).toBe(400);
		expect((await submit({ body: { id: "../job", ...input } })).status).toBe(
			400
		);
		expect(
			(
				await submit({
					body: {
						id: "job-1",
						...input,
						intent: { ...input.intent, options: [] },
					},
				})
			).status
		).toBe(400);
		expect(store.create).not.toHaveBeenCalled();
	});
	it("is disabled until the operator enables the provisioned service", async () => {
		vi.stubEnv("QCUT_COMPOSE_ENABLED", "false");
		const { submit, store } = fixture();
		expect((await submit()).status).toBe(503);
		expect(store.create).not.toHaveBeenCalled();
	});
	it.each([
		["compose_idempotency_conflict", 409],
		["compose_quota_exceeded", 429],
		["database-secret", 503],
	] as const)("handles %s without leaking storage errors", async (message, status) => {
		const { submit, store } = fixture();
		vi.mocked(store.create).mockRejectedValue(new Error(message));
		const response = await submit();
		expect(response.status).toBe(status);
		expect(await response.text()).not.toContain("database-secret");
	});
	it("scopes status, results and cancellation to the owner", async () => {
		const { app, store } = fixture();
		const headers = { Authorization: "Bearer test-session" };
		expect(
			(await app.request("/api/compose/jobs/job-1/result", { headers })).status
		).toBe(409);
		expect(store.get).toHaveBeenCalledWith({ id: "job-1", userId: "user-1" });
		vi.mocked(store.get).mockResolvedValue(undefined);
		expect(
			(await app.request("/api/compose/jobs/other", { headers })).status
		).toBe(404);
		expect(
			(
				await app.request("/api/compose/jobs/job-1/cancel", {
					method: "POST",
					headers,
				})
			).status
		).toBe(200);
		expect(store.cancel).toHaveBeenCalledWith({
			id: "job-1",
			userId: "user-1",
		});
	});
});

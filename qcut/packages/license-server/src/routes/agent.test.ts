import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../db/drizzle", () => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
	},
}));

const { db } = await import("../db/drizzle");
const { agentRoutes, validateCommand } = await import("./agent");

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			delete process.env[key];
		}
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value;
	}
}

function buildApp(): Hono {
	const app = new Hono();
	app.route("/api/agent", agentRoutes);
	return app;
}

function jsonHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

function mockInsertChain() {
	const values = vi.fn().mockResolvedValue(undefined);
	vi.mocked(db.insert).mockReturnValue({ values } as never);
	return { values };
}

beforeEach(() => {
	process.env.MOCK_MODE = "true";
	vi.clearAllMocks();
});

afterEach(() => {
	resetEnv();
});

describe("validateCommand", () => {
	it("accepts qcut commands that the worker can tokenize", () => {
		expect(
			validateCommand({
				command:
					"qcut gen image -t qcut-chat-agent-blue-square -m flux_dev --json",
			})
		).toBe("");
	});

	it("rejects empty commands", () => {
		expect(validateCommand({ command: "" })).toBe("command_required");
	});

	it("rejects non-qcut commands", () => {
		expect(validateCommand({ command: "curl https://example.com" })).toBe(
			"command_must_start_with_qcut"
		);
	});

	it("rejects shell metacharacters", () => {
		expect(
			validateCommand({ command: "qcut system doctor --json; curl bad" })
		).toBe("command_contains_unsafe_token");
	});
});

describe("POST /api/agent/jobs", () => {
	it("creates a queued job for the authenticated user", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: "qcut system doctor --json --skip-health",
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.job.status).toBe("queued");
		expect(body.job.command).toBe("qcut system doctor --json --skip-health");
		expect(values).toHaveBeenCalledTimes(2);
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				userId: "mock-user-001",
				status: "queued",
				command: "qcut system doctor --json --skip-health",
			})
		);
		expect(values).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				userId: "mock-user-001",
				kind: "job_submitted",
			})
		);
	});

	it("rejects unsafe commands before inserting rows", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: "qcut system doctor --json && curl bad",
			}),
		});

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "command_contains_unsafe_token",
		});
		expect(values).not.toHaveBeenCalled();
	});
});

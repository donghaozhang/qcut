import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../db/drizzle", () => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
	},
}));

vi.mock("../db/supabase", () => ({
	getSupabase: vi.fn(),
}));

const { db } = await import("../db/drizzle");
const { getSupabase } = await import("../db/supabase");
const {
	CODEX_AGENT_COMMAND,
	agentRoutes,
	getDefaultAgentUserId,
	validateAgentJobBody,
	validateCommand,
} = await import("./agent");

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

function mockSelectRowsOnce({ rows }: { rows: unknown[] }): void {
	const limit = vi.fn().mockResolvedValue(rows);
	const where = vi.fn().mockReturnValue({ limit });
	const from = vi.fn().mockReturnValue({ where });
	vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function mockArtifactDownload({ text }: { text: string }): void {
	const download = vi.fn().mockResolvedValue({
		data: new Blob([text], { type: "text/plain" }),
		error: null,
	});
	const from = vi.fn().mockReturnValue({ download });
	vi.mocked(getSupabase).mockReturnValue({
		storage: { from },
	} as never);
}

function mockOwnedJobAndArtifact({
	artifact,
}: {
	artifact: Record<string, unknown>;
}): void {
	mockSelectRowsOnce({
		rows: [
			{
				id: "job-1",
				userId: "mock-user-001",
				status: "succeeded",
				command: CODEX_AGENT_COMMAND,
				args: {},
				createdAt: new Date("2026-05-15T00:00:00.000Z"),
				claimedAt: null,
				finishedAt: null,
				exitCode: 0,
				error: null,
				runnerId: "runner-1",
			},
		],
	});
	mockSelectRowsOnce({
		rows: [
			{
				id: "artifact-1",
				jobId: "job-1",
				userId: "mock-user-001",
				createdAt: new Date("2026-05-15T00:00:01.000Z"),
				...artifact,
			},
		],
	});
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
			"command_must_start_with_qcut_or_codex_exec"
		);
	});

	it("accepts the fixed codex exec stdin command", () => {
		expect(validateCommand({ command: CODEX_AGENT_COMMAND })).toBe("");
	});

	it("requires a prompt for codex exec jobs", () => {
		expect(
			validateAgentJobBody({
				command: CODEX_AGENT_COMMAND,
				args: {},
			})
		).toBe("codex_prompt_required");
	});

	it("rejects shell metacharacters", () => {
		expect(
			validateCommand({ command: "qcut system doctor --json; curl bad" })
		).toBe("command_contains_unsafe_token");
	});

	it("creates a queued codex job with prompt args", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Summarize the project status." },
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.job.command).toBe(CODEX_AGENT_COMMAND);
		expect(body.job.args).toEqual({
			codexPrompt: "Summarize the project status.",
		});
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Summarize the project status." },
			})
		);
	});
});

describe("agent default user auth", () => {
	it("uses QCUT_AGENT_DEFAULT_USER_ID when no bearer token is supplied", async () => {
		process.env.MOCK_MODE = "false";
		process.env.QCUT_AGENT_DEFAULT_USER_ID = "default-agent-user";
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Summarize the sandbox status." },
			}),
		});

		expect(getDefaultAgentUserId()).toBe("default-agent-user");
		expect(res.status).toBe(201);
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				userId: "default-agent-user",
				command: CODEX_AGENT_COMMAND,
			})
		);
	});
});

describe("GET /api/agent/jobs/:jobId/artifacts/:artifactId/text", () => {
	it("returns text artifacts owned by the authenticated user", async () => {
		mockOwnedJobAndArtifact({
			artifact: {
				kind: "log",
				storagePath: "agent/mock-user-001/job-1/codex-last-message.md",
				bytes: 17,
				meta: { filename: "codex-last-message.md" },
			},
		});
		mockArtifactDownload({ text: "Hello from Codex." });

		const res = await buildApp().request(
			"/api/agent/jobs/job-1/artifacts/artifact-1/text"
		);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Hello from Codex.");
	});

	it("rejects large text artifacts before downloading", async () => {
		mockOwnedJobAndArtifact({
			artifact: {
				kind: "log",
				storagePath: "agent/mock-user-001/job-1/codex-events.jsonl",
				bytes: 300_000,
				meta: { filename: "codex-events.jsonl" },
			},
		});

		const res = await buildApp().request(
			"/api/agent/jobs/job-1/artifacts/artifact-1/text"
		);

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "artifact_too_large" });
		expect(getSupabase).not.toHaveBeenCalled();
	});
});

describe("GET /api/agent/jobs/:jobId/artifacts/:artifactId/download", () => {
	it("streams artifacts owned by the authenticated user", async () => {
		mockOwnedJobAndArtifact({
			artifact: {
				kind: "image",
				storagePath: "agent/mock-user-001/job-1/result.jpg",
				bytes: 3,
				meta: { filename: "result.jpg" },
			},
		});
		const download = vi.fn().mockResolvedValue({
			data: new Blob([new Uint8Array([1, 2, 3])]),
			error: null,
		});
		const from = vi.fn().mockReturnValue({ download });
		vi.mocked(getSupabase).mockReturnValue({
			storage: { from },
		} as never);

		const res = await buildApp().request(
			"/api/agent/jobs/job-1/artifacts/artifact-1/download"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/jpeg");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="result.jpg"'
		);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3])
		);
		expect(download).toHaveBeenCalledWith(
			"agent/mock-user-001/job-1/result.jpg"
		);
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

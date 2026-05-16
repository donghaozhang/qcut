import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../db/drizzle", () => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
	},
}));

vi.mock("../db/supabase", () => ({
	getSupabase: vi.fn(),
}));

const daytonaMocks = vi.hoisted(() => ({
	Daytona: vi.fn(),
	create: vi.fn(),
	get: vi.fn(),
	executeCommand: vi.fn(),
	listFiles: vi.fn(),
	downloadFile: vi.fn(),
	downloadFiles: vi.fn(),
}));

vi.mock("@daytona/sdk", () => ({
	Daytona: daytonaMocks.Daytona,
}));

const { db } = await import("../db/drizzle");
const { getSupabase } = await import("../db/supabase");
const {
	CODEX_AGENT_COMMAND,
	agentRoutes,
	buildTerminalArtifactListCommand,
	getDefaultAgentUserId,
	parseTerminalArtifactFiles,
	parseTerminalArtifactList,
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

function mockUpdateChain() {
	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn().mockReturnValue({ where });
	vi.mocked(db.update).mockReturnValue({ set } as never);
	return { set, where };
}

function mockSelectRowsOnce({ rows }: { rows: unknown[] }): void {
	const limit = vi.fn().mockResolvedValue(rows);
	const orderBy = vi.fn().mockReturnValue({ limit });
	const where = vi.fn().mockReturnValue({ limit, orderBy });
	const from = vi.fn().mockReturnValue({ where });
	vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

function makeAgentSession(overrides: Record<string, unknown> = {}) {
	return {
		id: "agent-session-1",
		userId: "mock-user-001",
		status: "active",
		provider: "daytona",
		providerSessionId: null,
		imageTag: "qcut-cli:test",
		startedAt: new Date("2026-05-15T00:00:00.000Z"),
		lastActiveAt: new Date("2026-05-15T00:00:00.000Z"),
		expiresAt: new Date("2099-01-01T00:00:00.000Z"),
		endedAt: null,
		endReason: null,
		runnerId: null,
		...overrides,
	};
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

function buildMultipartDownload({
	boundary,
	filename,
	bytes,
}: {
	boundary: string;
	filename: string;
	bytes: Uint8Array;
}): Uint8Array {
	const encoder = new TextEncoder();
	const prefix = encoder.encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
	);
	const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
	const output = new Uint8Array(prefix.length + bytes.length + suffix.length);
	output.set(prefix, 0);
	output.set(bytes, prefix.length);
	output.set(suffix, prefix.length + bytes.length);
	return output;
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
	daytonaMocks.Daytona.mockImplementation(function DaytonaMock() {
		return {
			create: daytonaMocks.create,
			get: daytonaMocks.get,
		};
	});
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

describe("POST /api/agent/sessions", () => {
	it("creates an active Daytona session when none can be reused", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/sessions", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.session.status).toBe("active");
		expect(body.session.provider).toBe("daytona");
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "mock-user-001",
				status: "active",
				provider: "daytona",
			})
		);
	});

	it("reuses the newest active session", async () => {
		mockSelectRowsOnce({ rows: [makeAgentSession()] });

		const res = await buildApp().request("/api/agent/sessions", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.session.id).toBe("agent-session-1");
		expect(db.insert).not.toHaveBeenCalled();
	});
});

describe("POST /api/agent/sessions/:sessionId/end", () => {
	it("marks the owned session as stopping for worker cleanup", async () => {
		mockSelectRowsOnce({ rows: [makeAgentSession()] });
		const { set } = mockUpdateChain();

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/end",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.session.status).toBe("stopping");
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "stopping",
				endReason: "user_kill",
			})
		);
	});

	it("returns 404 when ending a session owned by another user", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { set } = mockUpdateChain();

		const res = await buildApp().request(
			"/api/agent/sessions/other-user-session/end",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "agent_session_not_found" });
		expect(set).not.toHaveBeenCalled();
	});
});

describe("agent terminal artifacts", () => {
	it("builds a shell artifact list fallback command for Daytona process namespace", () => {
		const command = buildTerminalArtifactListCommand();

		expect(command).toContain("sh -lc");
		expect(command).toContain("for file in /tmp/qcut-output/*");
		expect(command).toContain("wc -c");
	});

	it("parses only direct safe files from Daytona find output", () => {
		expect(
			parseTerminalArtifactList({
				stdout: [
					"result.png\t120",
					"clip.mp4\t4096",
					"../secret.txt\t10",
					"nested/file.txt\t20",
					"bad.txt\tnot-a-number",
				].join("\n"),
			})
		).toEqual([
			{ filename: "result.png", bytes: 120 },
			{ filename: "clip.mp4", bytes: 4096 },
			{ filename: "bad.txt", bytes: 0 },
		]);
	});

	it("parses only direct safe files from Daytona file details", () => {
		expect(
			parseTerminalArtifactFiles({
				files: [
					{ name: "result.png", size: 120, isDir: false },
					{ name: "clip.mp4", size: 4096, isDir: false },
					{ name: "nested", size: 0, isDir: true },
					{ name: "../secret.txt", size: 10, isDir: false },
					{ name: "bad.txt", size: Number.NaN, isDir: false },
				],
			})
		).toEqual([
			{ filename: "bad.txt", bytes: 0 },
			{ filename: "clip.mp4", bytes: 4096 },
			{ filename: "result.png", bytes: 120 },
		]);
	});

	it("lists files from the active Daytona terminal sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles.mockResolvedValue([
					{ name: "result.png", size: 120, isDir: false },
					{ name: "clip.mp4", size: 4096, isDir: false },
				]),
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/artifacts"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.artifacts).toEqual([
			expect.objectContaining({
				id: "clip.mp4",
				sessionId: "agent-session-1",
				kind: "video",
				bytes: 4096,
			}),
			expect.objectContaining({
				id: "result.png",
				sessionId: "agent-session-1",
				kind: "image",
				bytes: 120,
			}),
		]);
		expect(daytonaMocks.get).toHaveBeenCalledWith("sandbox-1");
		expect(daytonaMocks.listFiles).toHaveBeenCalledWith("/tmp/qcut-output");
	});

	it("falls back to shell listing when Daytona FS listing is empty", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		daytonaMocks.get.mockResolvedValue({
			fs: {
				listFiles: daytonaMocks.listFiles.mockResolvedValue([]),
			},
			process: {
				executeCommand: daytonaMocks.executeCommand.mockResolvedValue({
					exitCode: 0,
					result: "result.png\t120\n",
				}),
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/artifacts"
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.artifacts).toEqual([
			expect.objectContaining({
				id: "result.png",
				bytes: 120,
			}),
		]);
		expect(daytonaMocks.executeCommand).toHaveBeenCalledWith(
			expect.stringContaining("sh -lc"),
			"/home/qcut/qcut",
			undefined,
			30
		);
	});

	it("downloads a file from the active Daytona terminal sandbox", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		const boundary = "qcut-test-boundary";
		daytonaMocks.get.mockResolvedValue({
			fs: {
				apiClient: {
					downloadFiles: daytonaMocks.downloadFiles.mockResolvedValue({
						data: buildMultipartDownload({
							boundary,
							filename: "/tmp/qcut-output/result.png",
							bytes: new Uint8Array([1, 2, 3]),
						}),
						headers: {
							"content-type": `multipart/form-data; boundary=${boundary}`,
						},
					}),
				},
			},
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/artifacts/result.png/download"
		);

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("image/png");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="result.png"'
		);
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3])
		);
		expect(daytonaMocks.downloadFiles).toHaveBeenCalledWith(
			{ paths: ["/tmp/qcut-output/result.png"] },
			{ responseType: "arraybuffer", timeout: 600_000 }
		);
		expect(daytonaMocks.downloadFile).not.toHaveBeenCalled();
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

	it("records the submitted job source when provided", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: "qcut system doctor --json --skip-health",
				args: { source: "codex_cli_e2e_probe" },
			}),
		});

		expect(res.status).toBe(201);
		expect(values).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				kind: "job_submitted",
				payload: { source: "codex_cli_e2e_probe" },
			})
		);
	});

	it("creates a queued job attached to an active session", async () => {
		mockSelectRowsOnce({ rows: [makeAgentSession()] });
		const { values } = mockInsertChain();
		const { set } = mockUpdateChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				sessionId: "agent-session-1",
				args: { codexPrompt: "Continue the chat." },
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.job.sessionId).toBe("agent-session-1");
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				sessionId: "agent-session-1",
				command: CODEX_AGENT_COMMAND,
			})
		);
		expect(values).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				payload: {
					source: "website_chat_agent",
					sessionId: "agent-session-1",
				},
			})
		);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({ lastActiveAt: expect.any(Date) })
		);
	});

	it("rejects a job attached to a missing session", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				sessionId: "missing-session",
				args: { codexPrompt: "Continue the chat." },
			}),
		});

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "agent_session_not_found" });
		expect(values).not.toHaveBeenCalled();
	});

	it("rejects a job attached to a session owned by another user", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				sessionId: "other-user-session",
				args: { codexPrompt: "Continue the chat." },
			}),
		});

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "agent_session_not_found" });
		expect(values).not.toHaveBeenCalled();
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

import { afterEach, beforeEach, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../db/drizzle", () => {
	const db = {
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
			callback(db)
		),
	};
	return { db };
});

vi.mock("../db/supabase", () => ({
	getSupabase: vi.fn(),
}));

const daytonaMockBag = vi.hoisted(() => ({
	Daytona: vi.fn(),
	ImageBase: vi.fn(),
	create: vi.fn(),
	createSandbox: vi.fn(),
	get: vi.fn(),
	executeCommand: vi.fn(),
	createFolder: vi.fn(),
	uploadFile: vi.fn(),
	listFiles: vi.fn(),
	downloadFile: vi.fn(),
	downloadFiles: vi.fn(),
}));

export const daytonaMocks = daytonaMockBag;

vi.mock("@daytona/sdk", () => ({
	Daytona: daytonaMockBag.Daytona,
	Image: { base: daytonaMockBag.ImageBase },
}));

export const { db } = await import("../db/drizzle");
export const { getSupabase } = await import("../db/supabase");
export const {
	CODEX_AGENT_COMMAND,
	agentRoutes,
	buildTerminalArtifactListCommand,
	getDefaultAgentUserId,
	normalizeUploadedFilename,
	parseTerminalArtifactFiles,
	parseTerminalArtifactList,
	validateAgentJobBody,
	validateCommand,
} = await import("./agent");

export const DEFAULT_PINNED_QCUT_IMAGE =
	"ghcr.io/quriosity-agent/qcut-cli@sha256:1baf3bbae082bb38c4056718f672c5965195f1888980f73b1e51759e7a480f56";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in ORIGINAL_ENV)) {
			Reflect.deleteProperty(process.env, key);
		}
	}
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		process.env[key] = value;
	}
}

export function buildApp(): Hono {
	const app = new Hono();
	app.route("/api/agent", agentRoutes);
	return app;
}

export function jsonHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

export function mockInsertChain() {
	const values = vi.fn().mockResolvedValue(undefined);
	vi.mocked(db.insert).mockReturnValue({ values } as never);
	return { values };
}

export function mockUpdateChain() {
	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn().mockReturnValue({ where });
	vi.mocked(db.update).mockReturnValue({ set } as never);
	return { set, where };
}

export function mockSelectRowsOnce({ rows }: { rows: unknown[] }): void {
	const limit = vi.fn().mockResolvedValue(rows);
	const orderBy = vi.fn().mockReturnValue({ limit });
	const where = vi.fn().mockReturnValue({ limit, orderBy });
	const from = vi.fn().mockReturnValue({ where });
	vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

export function mockSelectWhereRowsOnce({ rows }: { rows: unknown[] }): void {
	const where = vi.fn().mockResolvedValue(rows);
	const from = vi.fn().mockReturnValue({ where });
	vi.mocked(db.select).mockReturnValueOnce({ from } as never);
}

export function makeAgentSession(overrides: Record<string, unknown> = {}) {
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

export function mockArtifactDownload({ text }: { text: string }): void {
	const download = vi.fn().mockResolvedValue({
		data: new Blob([text], { type: "text/plain" }),
		error: null,
	});
	const from = vi.fn().mockReturnValue({ download });
	vi.mocked(getSupabase).mockReturnValue({
		storage: { from },
	} as never);
}

export function buildMultipartDownload({
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

export function mockOwnedJobAndArtifact({
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
			sandboxApi: { createSandbox: daytonaMocks.createSandbox },
			get: daytonaMocks.get,
		};
	});
	daytonaMocks.ImageBase.mockImplementation((image: string) => ({
		dockerfile: `FROM ${image}\n`,
	}));
});

afterEach(() => {
	resetEnv();
});

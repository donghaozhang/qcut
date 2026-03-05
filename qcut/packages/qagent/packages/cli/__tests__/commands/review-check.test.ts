import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	existsSync,
	readdirSync,
	readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	type PRInfo,
	type Session,
	type SessionManager,
	getSessionsDir,
} from "@composio/ao-core";

const {
	mockTmux,
	mockExec,
	mockConfigRef,
	mockDetectPR,
	mockGetReviewDecision,
	mockGetPendingComments,
	mockGetAutomatedComments,
	mockRegistryGet,
	mockSessionManager,
	sessionsDirRef,
} = vi.hoisted(() => ({
	mockTmux: vi.fn(),
	mockExec: vi.fn(),
	mockConfigRef: { current: null as Record<string, unknown> | null },
	mockDetectPR: vi.fn(),
	mockGetReviewDecision: vi.fn(),
	mockGetPendingComments: vi.fn(),
	mockGetAutomatedComments: vi.fn(),
	mockRegistryGet: vi.fn(),
	mockSessionManager: {
		list: vi.fn(),
		kill: vi.fn(),
		cleanup: vi.fn(),
		get: vi.fn(),
		spawn: vi.fn(),
		spawnOrchestrator: vi.fn(),
		send: vi.fn(),
	},
	sessionsDirRef: { current: "" },
}));

vi.mock("../../src/lib/shell.js", () => ({
	tmux: mockTmux,
	exec: mockExec,
	execSilent: vi.fn(),
	git: vi.fn(),
	gh: vi.fn(),
	getTmuxSessions: async () => {
		const output = await mockTmux("list-sessions", "-F", "#{session_name}");
		if (!output) return [];
		return output.split("\n").filter(Boolean);
	},
	getTmuxActivity: vi.fn().mockResolvedValue(null),
}));

vi.mock("ora", () => ({
	default: () => ({
		start: vi.fn().mockReturnThis(),
		stop: vi.fn().mockReturnThis(),
		succeed: vi.fn().mockReturnThis(),
		fail: vi.fn().mockReturnThis(),
		text: "",
	}),
}));

vi.mock("@composio/ao-core", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	const actual = await importOriginal<typeof import("@composio/ao-core")>();
	return {
		...actual,
		loadConfig: () => mockConfigRef.current,
	};
});

/** Parse a key=value metadata file into a Record<string, string>. */
function parseMetadata(content: string): Record<string, string> {
	const meta: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const idx = line.indexOf("=");
		if (idx > 0) {
			meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
	}
	return meta;
}

function parsePRFromMetadata({
	meta,
}: {
	meta: Record<string, string>;
}): PRInfo | null {
	const prUrl = meta.pr;
	if (!prUrl) {
		return null;
	}
	const prNumber = Number(prUrl.match(/(\d+)\s*$/)?.[1] ?? NaN);
	if (!Number.isInteger(prNumber) || prNumber <= 0) {
		return null;
	}
	return {
		number: prNumber,
		url: prUrl,
		title: `PR #${String(prNumber)}`,
		owner: "org",
		repo: "my-app",
		branch: meta.branch || "feat/fix",
		baseBranch: "main",
		isDraft: false,
	};
}

/** Build Session objects from metadata files in sessionsDir. */
function buildSessionsFromDir(dir: string, projectId: string): Session[] {
	if (!existsSync(dir)) return [];
	const files = readdirSync(dir).filter(
		(f) => !f.startsWith(".") && f !== "archive"
	);
	return files.map((name) => {
		const content = readFileSync(join(dir, name), "utf-8");
		const meta = parseMetadata(content);
		return {
			id: name,
			projectId,
			status: (meta.status as Session["status"]) || "spawning",
			activity: null,
			branch: meta.branch || null,
			issueId: meta.issue || null,
			pr: parsePRFromMetadata({ meta }),
			workspacePath: meta.worktree || null,
			runtimeHandle: { id: name, runtimeName: "tmux", data: {} },
			agentInfo: null,
			createdAt: new Date(),
			lastActivityAt: new Date(),
			metadata: meta,
		} satisfies Session;
	});
}

vi.mock("../../src/lib/create-session-manager.js", () => ({
	getSessionManager: async (): Promise<SessionManager> =>
		mockSessionManager as SessionManager,
	getPluginRegistry: async () => ({
		get: mockRegistryGet,
	}),
}));

let tmpDir: string;
let sessionsDir: string;

import { Command } from "commander";
import { registerReviewCheck } from "../../src/commands/review-check.js";

let program: Command;
let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "ao-review-test-"));

	const configPath = join(tmpDir, "agent-orchestrator.yaml");
	writeFileSync(configPath, "projects: {}");

	mockConfigRef.current = {
		configPath,
		port: 3000,
		defaults: {
			runtime: "tmux",
			agent: "claude-code",
			workspace: "worktree",
			notifiers: ["desktop"],
		},
		projects: {
			"my-app": {
				name: "My App",
				repo: "org/my-app",
				path: join(tmpDir, "main-repo"),
				defaultBranch: "main",
				sessionPrefix: "app",
				scm: {
					plugin: "github",
				},
			},
		},
		notifiers: {},
		notificationRouting: {},
		reactions: {},
	} as Record<string, unknown>;

	sessionsDir = getSessionsDir(configPath, join(tmpDir, "main-repo"));
	mkdirSync(sessionsDir, { recursive: true });
	sessionsDirRef.current = sessionsDir;

	program = new Command();
	program.exitOverride();
	registerReviewCheck(program);
	consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(process, "exit").mockImplementation((code) => {
		throw new Error(`process.exit(${code})`);
	});

	mockTmux.mockReset();
	mockExec.mockReset();
	mockDetectPR.mockReset();
	mockGetReviewDecision.mockReset();
	mockGetPendingComments.mockReset();
	mockGetAutomatedComments.mockReset();
	mockRegistryGet.mockReset();
	mockExec.mockResolvedValue({ stdout: "", stderr: "" });
	mockDetectPR.mockResolvedValue(null);
	mockGetReviewDecision.mockResolvedValue("approved");
	mockGetPendingComments.mockResolvedValue([]);
	mockGetAutomatedComments.mockResolvedValue([]);
	mockRegistryGet.mockReturnValue({
		detectPR: mockDetectPR,
		getReviewDecision: mockGetReviewDecision,
		getPendingComments: mockGetPendingComments,
		getAutomatedComments: mockGetAutomatedComments,
	});

	mockSessionManager.list.mockReset();
	mockSessionManager.kill.mockReset();
	mockSessionManager.cleanup.mockReset();
	mockSessionManager.get.mockReset();
	mockSessionManager.spawn.mockReset();
	mockSessionManager.send.mockReset();

	mockSessionManager.list.mockImplementation(async () => {
		return buildSessionsFromDir(sessionsDirRef.current, "my-app");
	});
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe("review-check command", () => {
	it("reports no pending reviews when none exist", async () => {
		writeFileSync(
			join(sessionsDir, "app-1"),
			"branch=feat/fix\npr=https://github.com/org/my-app/pull/10\n"
		);

		await program.parseAsync(["node", "test", "review-check"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No pending review comments");
		expect(mockGetReviewDecision).toHaveBeenCalledTimes(1);
	});

	it("finds sessions with pending review comments", async () => {
		const createdAt = new Date();
		writeFileSync(
			join(sessionsDir, "app-1"),
			"branch=feat/fix\npr=https://github.com/org/my-app/pull/10\n"
		);

		mockGetReviewDecision.mockResolvedValue("changes_requested");
		mockGetPendingComments.mockResolvedValue([
			{
				id: "human-1",
				author: "reviewer",
				body: "Please fix this.",
				path: "src/file.ts",
				line: 10,
				isResolved: false,
				createdAt,
				url: "https://example.com/comment/1",
			},
		]);

		await program.parseAsync(["node", "test", "review-check", "--dry-run"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("app-1");
		expect(output).toContain("PR #10");
		expect(output).toContain("CHANGES_REQUESTED");
		expect(output).toContain("Actionable items: 2");
		expect(output).toContain("dry run");
	});

	it("skips sessions without branch or PR", async () => {
		writeFileSync(join(sessionsDir, "app-1"), "status=working\n");

		await program.parseAsync(["node", "test", "review-check"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No pending review comments");
		expect(mockGetReviewDecision).not.toHaveBeenCalled();
	});

	it("handles sessions with non-matching prefix", async () => {
		writeFileSync(
			join(sessionsDir, "other-1"),
			"branch=feat/fix\npr=https://github.com/org/my-app/pull/10\n"
		);

		await program.parseAsync(["node", "test", "review-check"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No pending review comments");
		expect(mockGetReviewDecision).toHaveBeenCalledTimes(1);
	});

	it("sends fix prompt when not in dry-run mode", async () => {
		const createdAt = new Date();
		writeFileSync(
			join(sessionsDir, "app-1"),
			"branch=feat/fix\npr=https://github.com/org/my-app/pull/10\n"
		);

		mockGetReviewDecision.mockResolvedValue("approved");
		mockGetPendingComments.mockResolvedValue([
			{
				id: "human-1",
				author: "reviewer",
				body: "Please fix this.",
				path: "src/file.ts",
				line: 10,
				isResolved: false,
				createdAt,
				url: "https://example.com/comment/1",
			},
		]);

		await program.parseAsync(["node", "test", "review-check"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("Fix prompt sent");
		expect(mockExec).toHaveBeenCalledWith("tmux", [
			"send-keys",
			"-t",
			"app-1",
			"C-c",
		]);
		expect(mockExec).toHaveBeenCalledWith("tmux", [
			"send-keys",
			"-t",
			"app-1",
			"C-u",
		]);
		expect(mockExec).toHaveBeenCalledWith("tmux", [
			"send-keys",
			"-t",
			"app-1",
			"-l",
			expect.stringContaining("full PR feedback sweep"),
		]);
		expect(mockExec).toHaveBeenCalledWith("tmux", [
			"send-keys",
			"-t",
			"app-1",
			"Enter",
		]);
	});

	it("handles feedback sweep failures gracefully", async () => {
		writeFileSync(
			join(sessionsDir, "app-1"),
			"branch=feat/fix\npr=https://github.com/org/my-app/pull/10\n"
		);

		mockGetPendingComments.mockRejectedValue(new Error("sweep failed"));

		await program.parseAsync(["node", "test", "review-check"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No pending review comments");
	});

	it("handles detectPR errors gracefully", async () => {
		writeFileSync(join(sessionsDir, "app-1"), "branch=feat/fix\n");

		mockDetectPR.mockRejectedValue(new Error("detect PR failed"));

		await program.parseAsync(["node", "test", "review-check"]);

		const output = consoleSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No pending review comments");
		expect(mockGetReviewDecision).not.toHaveBeenCalled();
	});

	it("rejects unknown project ID", async () => {
		await expect(
			program.parseAsync(["node", "test", "review-check", "nonexistent"])
		).rejects.toThrow("process.exit(1)");
	});
});

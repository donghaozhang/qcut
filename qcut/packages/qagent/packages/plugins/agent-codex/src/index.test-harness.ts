import { beforeEach, vi } from "vitest";
import type {
	Session,
	RuntimeHandle,
	AgentLaunchConfig,
} from "@composio/ao-core";

const {
	mockExecFileAsync,
	mockWriteFile,
	mockMkdir,
	mockReadFile,
	mockRename,
	mockReaddir,
	mockStat,
	mockHomedir,
} = vi.hoisted(() => ({
	mockExecFileAsync: vi.fn(),
	mockWriteFile: vi.fn().mockResolvedValue(undefined),
	mockMkdir: vi.fn().mockResolvedValue(undefined),
	mockReadFile: vi.fn(),
	mockRename: vi.fn().mockResolvedValue(undefined),
	mockReaddir: vi.fn().mockResolvedValue([]),
	mockStat: vi.fn().mockResolvedValue({ mtimeMs: 0 }),
	mockHomedir: vi.fn(() => "/mock/home"),
}));

vi.mock("node:child_process", () => {
	const fn = Object.assign((..._args: unknown[]) => {}, {
		[Symbol.for("nodejs.util.promisify.custom")]: mockExecFileAsync,
	});
	return { execFile: fn };
});

vi.mock("node:fs/promises", () => ({
	writeFile: mockWriteFile,
	mkdir: mockMkdir,
	readFile: mockReadFile,
	rename: mockRename,
	readdir: mockReaddir,
	stat: mockStat,
}));

vi.mock("node:crypto", () => ({
	randomBytes: () => ({ toString: () => "abc123" }),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
}));

vi.mock("node:os", () => ({
	homedir: mockHomedir,
}));

import { create, manifest, default as defaultExport } from "./index.js";

beforeEach(() => {
	vi.clearAllMocks();
	mockHomedir.mockReturnValue("/mock/home");
	mockReaddir.mockResolvedValue([]);
	mockStat.mockResolvedValue({ mtimeMs: 0 });
});

export {
	create,
	manifest,
	defaultExport,
	mockExecFileAsync,
	mockWriteFile,
	mockMkdir,
	mockReadFile,
	mockRename,
	mockReaddir,
	mockStat,
	mockHomedir,
};

export function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "test-1",
		projectId: "test-project",
		status: "working",
		activity: "active",
		branch: "feat/test",
		issueId: null,
		pr: null,
		workspacePath: "/workspace/test",
		runtimeHandle: null,
		agentInfo: null,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		metadata: {},
		...overrides,
	};
}

export function makeTmuxHandle(id = "test-session"): RuntimeHandle {
	return { id, runtimeName: "tmux", data: {} };
}

export function makeProcessHandle(pid?: number | string): RuntimeHandle {
	return {
		id: "proc-1",
		runtimeName: "process",
		data: pid !== undefined ? { pid } : {},
	};
}

export function makeLaunchConfig(
	overrides: Partial<AgentLaunchConfig> = {},
): AgentLaunchConfig {
	return {
		sessionId: "sess-1",
		projectConfig: {
			name: "my-project",
			repo: "owner/repo",
			path: "/workspace/repo",
			defaultBranch: "main",
			sessionPrefix: "my",
		},
		...overrides,
	};
}

export function mockTmuxWithProcess(processName: string, found = true): void {
	mockExecFileAsync.mockImplementation((cmd: string, args: string[]) => {
		if (cmd === "tmux" && args[0] === "list-panes") {
			return Promise.resolve({ stdout: "/dev/ttys003\n", stderr: "" });
		}
		if (cmd === "ps") {
			const line = found
				? `  789 ttys003  ${processName}`
				: "  789 ttys003  bash";
			return Promise.resolve({
				stdout: `  PID TT       ARGS\n${line}\n`,
				stderr: "",
			});
		}
		return Promise.reject(new Error(`Unexpected: ${cmd} ${args.join(" ")}`));
	});
}

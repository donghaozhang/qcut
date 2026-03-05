/* @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface CommandResult {
	stdout: string;
	stderr?: string;
	error?: Error;
}

type ExecCallback = (
	error: Error | null,
	stdout?: unknown,
	stderr?: string,
) => void;

const {
	commandResults,
	execFileMock,
	detectTerminalAppMock,
	readTerminalTabNameMock,
} = vi.hoisted(() => {
	const hoistedCommandResults = new Map<string, CommandResult>();
	const hoistedExecFileMock = vi.fn(
		(
			command: string,
			args: string[] = [],
			optionsOrCallback?: unknown,
			maybeCallback?: unknown,
		) => {
			const callback =
				typeof optionsOrCallback === "function"
					? (optionsOrCallback as ExecCallback)
					: typeof maybeCallback === "function"
						? (maybeCallback as ExecCallback)
						: null;
			if (!callback) return {};

			const key = `${command} ${args.join(" ")}`;
			const result = hoistedCommandResults.get(key);
			if (!result) {
				callback(new Error(`Unexpected command: ${key}`));
				return {};
			}
			if (result.error) {
				callback(result.error);
				return {};
			}
			callback(
				null,
				{
					stdout: result.stdout,
					stderr: result.stderr ?? "",
				},
			);
			return {};
		},
	);

	return {
		commandResults: hoistedCommandResults,
		execFileMock: hoistedExecFileMock,
		detectTerminalAppMock: vi.fn(),
		readTerminalTabNameMock: vi.fn(),
	};
});

/** Handle command key. */
function commandKey({
	command,
	args,
}: {
	command: string;
	args: string[];
}): string {
	return `${command} ${args.join(" ")}`;
}

/** Register command result. */
function registerCommandResult({
	command,
	args,
	result,
}: {
	command: string;
	args: string[];
	result: CommandResult;
}): void {
	commandResults.set(commandKey({ command, args }), result);
}

vi.mock("node:child_process", () => ({
	execFile: execFileMock,
}));

vi.mock("../terminal-utils", () => ({
	detectTerminalApp: detectTerminalAppMock,
	readTerminalTabName: readTerminalTabNameMock,
}));

import { findCLISession } from "../cli-sessions";

describe("findCLISession", () => {
	beforeEach(() => {
		commandResults.clear();
		execFileMock.mockClear();
		detectTerminalAppMock.mockReset();
		readTerminalTabNameMock.mockReset();
	});

	it("discovers wrapper-launched --agent claude-code sessions", async () => {
		registerCommandResult({
			command: "ps",
			args: ["-eo", "pid,tty,args"],
			result: {
				stdout: [
					"  PID TTY      ARGS",
					" 4242 ttys007 ./electron/resources/bin/aicp/darwin-arm64/aicp --agent claude-code --session qagent-smoke",
				].join("\n"),
			},
		});
		registerCommandResult({
			command: "lsof",
			args: ["-a", "-p", "4242", "-d", "cwd", "-Fn"],
			result: {
				stdout: "p4242\nn/Users/peter/Desktop/code/qcut/qcut\n",
			},
		});
		registerCommandResult({
			command: "ps",
			args: ["-o", "%cpu=", "-p", "4242"],
			result: {
				stdout: "14.2\n",
			},
		});
		registerCommandResult({
			command: "ps",
			args: ["-o", "lstart=", "-p", "4242"],
			result: {
				stdout: "Thu Mar  5 13:25:58 2026\n",
			},
		});
		registerCommandResult({
			command: "git",
			args: ["rev-parse", "--abbrev-ref", "HEAD"],
			result: {
				stdout: "feat/167\n",
			},
		});
		detectTerminalAppMock.mockResolvedValue("Warp");
		readTerminalTabNameMock.mockResolvedValue("qagent-smoke");

		const session = await findCLISession("claude-code:4242");
		expect(session).not.toBeNull();

		const metadata = session?.metadata ?? {};
		expect(metadata.agent).toBe("claude-code");
		expect(metadata.command).toContain("--agent claude-code");
		expect(metadata.cwd).toBe("/Users/peter/Desktop/code/qcut/qcut");
		expect(metadata.cpu).toBe("14.2");
		expect(metadata.terminalApp).toBe("Warp");
		expect(metadata.terminalName).toBe("qagent-smoke");
		expect(metadata.processStartedAt).toBeDefined();
		expect(Number.isFinite(Date.parse(metadata.processStartedAt ?? ""))).toBe(
			true,
		);
	});
});

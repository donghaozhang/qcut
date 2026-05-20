import { describe, expect, it } from "vitest";

import {
	buildDaytonaCommand,
	buildDaytonaEnv,
	CODEX_AGENT_COMMAND,
	EXPECTED_QCUT_DOCTOR_DAYTONA_COMMAND,
	EXPECTED_QCUT_IMAGE_DAYTONA_COMMAND,
	makeJob,
} from "./run-on-daytona.test-utils";

describe("buildDaytonaCommand", () => {
	it("wraps qcut through the container entrypoint and archives /output", () => {
		expect(
			buildDaytonaCommand({
				command: "qcut system doctor --json --skip-health",
			})
		).toMatchObject({
			command: EXPECTED_QCUT_DOCTOR_DAYTONA_COMMAND,
			archiveCommand:
				"tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
			streams: [
				{
					path: "/tmp/qcut-output/qcut-stdout.txt",
					kind: "daytona_stdout",
					source: "qcut-stdout.txt",
				},
				{
					path: "/tmp/qcut-output/qcut-stderr.txt",
					kind: "daytona_stderr",
					source: "qcut-stderr.txt",
				},
				{
					path: "/tmp/qcut-output/.qcut-agent-wrapper-stderr",
					kind: "daytona_stderr",
					source: ".qcut-agent-wrapper-stderr",
				},
			],
			stdoutPath: "/tmp/qcut-output/qcut-stdout.txt",
			stderrPath: "/tmp/qcut-output/qcut-stderr.txt",
			exitPath: "/tmp/qcut-output/qcut-exit.json",
		});
	});

	it("quotes reconstructed qcut argv before building the SDK command string", () => {
		expect(
			buildDaytonaCommand({
				command: "qcut gen image -t icon,logo -m flux_dev --json",
			})
		).toMatchObject({
			command: EXPECTED_QCUT_IMAGE_DAYTONA_COMMAND,
			archiveCommand:
				"tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
		});
	});

	it("rejects shell metacharacters before building the SDK command string", () => {
		expect(() =>
			buildDaytonaCommand({ command: "qcut system doctor; curl bad" })
		).toThrow("shell-metacharacters");
	});

	it("builds a codex stdin command without interpolating the prompt", () => {
		const commandParts = buildDaytonaCommand({
			command: CODEX_AGENT_COMMAND,
			args: { codexPrompt: "Explain QCut's agent path." },
		});
		expect(commandParts).toMatchObject({
			archiveCommand:
				"tar --exclude='.qcut-agent-*' -C /tmp/qcut-output -cf /tmp/qcut-output.tar .",
			streams: [
				{
					path: "/tmp/qcut-output/codex-live-stdout.log",
					kind: "codex_stdout",
					source: "codex-live-stdout.log",
				},
				{
					path: "/tmp/qcut-output/codex-events.jsonl",
					kind: "codex_event",
					source: "codex-events.jsonl",
				},
				{
					path: "/tmp/qcut-output/.qcut-agent-wrapper-stderr",
					kind: "daytona_stderr",
					source: ".qcut-agent-wrapper-stderr",
				},
			],
			stdoutPath: "/tmp/qcut-output/codex-events.jsonl",
			stderrPath: "/tmp/qcut-output/.qcut-agent-wrapper-stderr",
			exitPath: "/tmp/qcut-output/qcut-exit.json",
		});
		const command = commandParts.command;
		expect(command).toContain("export QCUT_CODEX_PROMPT_B64=");
		expect(command).toContain("export QCUT_BOOTSTRAP_CODEX=1");
		expect(command).toContain("/usr/local/bin/qcut-entrypoint codex exec");
		expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
		expect(command).not.toContain("Explain QCut's agent path.");
	});
});

describe("buildDaytonaEnv", () => {
	it("adds the agent role and preserves user secrets", () => {
		expect(
			buildDaytonaEnv({
				secrets: [
					{ key: "OPENAI_API_KEY", value: "sk-test" },
					{ key: "GEMINI_API_KEY", value: "gm-test" },
				],
			})
		).toEqual({
			QCUT_SESSION_ROLE: "agent",
			OPENAI_API_KEY: "sk-test",
			GEMINI_API_KEY: "gm-test",
		});
	});

	it("adds codex prompt bootstrap env for codex jobs", () => {
		const env = buildDaytonaEnv({
			secrets: [
				{ key: "CODEX_AUTH_JSON", value: '{"tokens":{"id_token":"x"}}' },
			],
			job: makeJob({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Explain QCut's agent path." },
			}),
		});

		expect(env.QCUT_BOOTSTRAP_CODEX).toBe("1");
		expect(env.CODEX_AUTH_JSON).toBe('{"tokens":{"id_token":"x"}}');
		expect(
			Buffer.from(env.QCUT_CODEX_PROMPT_B64, "base64").toString("utf8")
		).toContain(
			"The QCut native CLI skill is available at /home/qcut/qcut/.claude/skills/native-cli/SKILL.md."
		);
		expect(
			Buffer.from(env.QCUT_CODEX_PROMPT_B64, "base64").toString("utf8")
		).toContain("User task:\nExplain QCut's agent path.");
	});

	it("rejects codex jobs without prompt args before sandbox creation", () => {
		expect(() =>
			buildDaytonaEnv({
				secrets: [],
				job: makeJob({ command: CODEX_AGENT_COMMAND, args: {} }),
			})
		).toThrow("codexPrompt is required");
	});
});

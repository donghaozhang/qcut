/* @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface CodexSessionSeed {
	homeDir: string;
	fileName: string;
	cwd: string;
	timestamp: string | number;
	mtimeMs: number;
	baseInstructionSize?: number;
}

/** Handle seed codex session file. */
async function seedCodexSessionFile({
	homeDir,
	fileName,
	cwd,
	timestamp,
	mtimeMs,
	baseInstructionSize = 0,
}: CodexSessionSeed): Promise<string> {
	const dayDir = join(homeDir, ".codex", "sessions", "2026", "03", "05");
	await mkdir(dayDir, { recursive: true });
	const filePath = join(dayDir, fileName);
	const payload: Record<string, unknown> = {
		id: fileName.replace(".jsonl", ""),
		timestamp,
		cwd,
		originator: "codex_cli_rs",
		source: "cli",
	};
	if (baseInstructionSize > 0) {
		payload.base_instructions = { text: "x".repeat(baseInstructionSize) };
	}
	const sessionMeta = {
		timestamp:
			typeof timestamp === "string"
				? timestamp
				: new Date(timestamp).toISOString(),
		type: "session_meta",
		payload,
	};
	const content = [
		JSON.stringify(sessionMeta),
		JSON.stringify({
			type: "event_msg",
			payload: { type: "task_started" },
		}),
	].join("\n");
	await writeFile(filePath, `${content}\n`, "utf-8");
	const mtime = new Date(mtimeMs);
	await utimes(filePath, mtime, mtime);
	return filePath;
}

/** Handle import jsonl module. */
async function importJsonlModule({
	homeDir,
}: {
	homeDir: string;
}): Promise<typeof import("../claude-jsonl")> {
	vi.resetModules();
	vi.doMock("node:os", () => ({
		homedir: () => homeDir,
	}));
	return import("../claude-jsonl");
}

describe("findCodexSessionFileForContext", () => {
	let tempHomeDir = "";

	beforeEach(async () => {
		tempHomeDir = await mkdtemp(join(tmpdir(), "qagent-codex-context-"));
	});

	afterEach(async () => {
		vi.doUnmock("node:os");
		vi.resetModules();
		if (tempHomeDir) {
			await rm(tempHomeDir, { recursive: true, force: true });
		}
		tempHomeDir = "";
	});

	it("prefers cwd and process-time match over newer mtime", async () => {
		const olderButMatching = await seedCodexSessionFile({
			homeDir: tempHomeDir,
			fileName: "rollout-match.jsonl",
			cwd: "/repo/qcut/worktree-one",
			timestamp: "2026-03-05T02:00:05.000Z",
			mtimeMs: Date.parse("2026-03-05T02:03:00.000Z"),
		});
		await seedCodexSessionFile({
			homeDir: tempHomeDir,
			fileName: "rollout-newer.jsonl",
			cwd: "/repo/qcut/other-worktree",
			timestamp: "2026-03-05T02:20:00.000Z",
			mtimeMs: Date.parse("2026-03-05T02:20:00.000Z"),
		});

		const { findCodexSessionFileForContext } = await importJsonlModule({
			homeDir: tempHomeDir,
		});
		const selected = await findCodexSessionFileForContext({
			cwd: "/repo/qcut/worktree-one",
			processStartedAt: "2026-03-05T02:00:10.000Z",
		});

		expect(selected).toBe(olderButMatching);
	});

	it("parses very large first-line session_meta records", async () => {
		const matchingLargeMeta = await seedCodexSessionFile({
			homeDir: tempHomeDir,
			fileName: "rollout-large-meta.jsonl",
			cwd: "/repo/qcut/large-meta",
			timestamp: "2026-03-05T01:40:01.000Z",
			mtimeMs: Date.parse("2026-03-05T01:45:00.000Z"),
			baseInstructionSize: 120_000,
		});
		await seedCodexSessionFile({
			homeDir: tempHomeDir,
			fileName: "rollout-latest.jsonl",
			cwd: "/repo/qcut/latest",
			timestamp: "2026-03-05T02:30:00.000Z",
			mtimeMs: Date.parse("2026-03-05T02:30:00.000Z"),
		});

		const { findCodexSessionFileForContext } = await importJsonlModule({
			homeDir: tempHomeDir,
		});
		const selected = await findCodexSessionFileForContext({
			cwd: "/repo/qcut/large-meta",
			processStartedAt: "2026-03-05T01:40:05.000Z",
		});

		expect(selected).toBe(matchingLargeMeta);
	});

	it("accepts numeric session_meta timestamps", async () => {
		const numericTimestampMs = Date.parse("2026-03-05T03:10:00.000Z");
		const matchingNumericTimestamp = await seedCodexSessionFile({
			homeDir: tempHomeDir,
			fileName: "rollout-numeric-ts.jsonl",
			cwd: "/repo/qcut/numeric-ts",
			timestamp: numericTimestampMs,
			mtimeMs: Date.parse("2026-03-05T03:12:00.000Z"),
		});
		await seedCodexSessionFile({
			homeDir: tempHomeDir,
			fileName: "rollout-other-ts.jsonl",
			cwd: "/repo/qcut/other-ts",
			timestamp: "2026-03-05T03:30:00.000Z",
			mtimeMs: Date.parse("2026-03-05T03:30:00.000Z"),
		});

		const { findCodexSessionFileForContext } = await importJsonlModule({
			homeDir: tempHomeDir,
		});
		const selected = await findCodexSessionFileForContext({
			cwd: "/repo/qcut/numeric-ts",
			processStartedAt: "2026-03-05T03:10:01.000Z",
		});

		expect(selected).toBe(matchingNumericTimestamp);
	});
});


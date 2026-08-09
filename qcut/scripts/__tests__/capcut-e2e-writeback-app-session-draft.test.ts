import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	captureCapCut81WritebackAppPhase,
	captureCapCut81WritebackDraftDirectoryBinding,
} from "../capcut-e2e/capcut-8-1-writeback-app-session-draft";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("CapCut 8.1 writeback app draft boundary", () => {
	it("rejects active mirror paths that escape the bound draft", async () => {
		const directory = await mkdtemp(
			join(await realpath(tmpdir()), "qcut-capcut-app-draft-")
		);
		temporaryDirectories.push(directory);
		const draftBinding = await captureCapCut81WritebackDraftDirectoryBinding({
			draftDirectory: directory,
		});

		await expect(
			captureCapCut81WritebackAppPhase({
				activeMirrorRelativePaths: ["../a", "../b", "../c", "../d"],
				activeMirrorTemplates: ["a", "b", "c", "d"],
				capturedAtIso: "2026-08-05T00:00:00.000Z",
				draftBinding,
				phase: "pre-open",
			})
		).rejects.toThrow("must stay inside the draft");
	});
});

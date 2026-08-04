import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverDraftDirectory } from "../discovery.js";
import {
	readDraftSourceSnapshot,
	verifyDraftSourceUnchanged,
} from "../snapshot-reader.js";
import { validateDraftInspectRequest } from "../runtime-validation.js";

/**
 * JYI-006 acceptance: symlink refusal, TOCTOU / active-source-change
 * detection, size limits, bounded reads, and the IPC/CLI input allowlist.
 */

let draftRoot: string;

beforeEach(async () => {
	draftRoot = await mkdtemp(join(tmpdir(), "qcut-import-test-"));
});

afterEach(async () => {
	await rm(draftRoot, { recursive: true, force: true });
});

async function writeDraftFixture(): Promise<void> {
	await writeFile(
		join(draftRoot, "draft_info.json"),
		JSON.stringify({ id: "draft-1", tracks: [], materials: {} })
	);
	await writeFile(
		join(draftRoot, "draft_meta_info.json"),
		JSON.stringify({ draft_name: "fixture" })
	);
	await mkdir(join(draftRoot, "assets"));
	await writeFile(
		join(draftRoot, "assets", "clip.bin"),
		Buffer.from([0, 1, 2])
	);
}

describe("discoverDraftDirectory", () => {
	it("finds content, meta, and asset files with roles", async () => {
		await writeDraftFixture();
		const result = await discoverDraftDirectory({ draftDirectory: draftRoot });
		expect(result.hasContentFile).toBe(true);
		const roles = Object.fromEntries(
			result.files.map((file) => [file.relativePath, file.role])
		);
		expect(roles["draft_info.json"]).toBe("content");
		expect(roles["draft_meta_info.json"]).toBe("meta");
		expect(roles["assets/clip.bin"]).toBe("asset");
	});

	it("never follows symlinks", async () => {
		await writeDraftFixture();
		await writeFile(join(draftRoot, "real-target.json"), "{}");
		await symlink(
			join(draftRoot, "real-target.json"),
			join(draftRoot, "draft_content.json")
		);
		await symlink(draftRoot, join(draftRoot, "loop-dir"));
		const result = await discoverDraftDirectory({ draftDirectory: draftRoot });
		const skippedPaths = result.skipped.map((entry) => entry.relativePath);
		expect(skippedPaths).toContain("draft_content.json");
		expect(skippedPaths).toContain("loop-dir");
		for (const entry of result.skipped) {
			expect(entry.reason).toBe("symlink");
		}
		// The symlinked content file is NOT a candidate.
		expect(
			result.files.some((file) => file.relativePath === "draft_content.json")
		).toBe(false);
	});

	it("skips denied directories and depth overruns", async () => {
		await writeDraftFixture();
		await mkdir(join(draftRoot, "logs"));
		await writeFile(join(draftRoot, "logs", "app.log"), "secret");
		await mkdir(join(draftRoot, "a", "b", "c"), { recursive: true });
		await writeFile(join(draftRoot, "a", "b", "c", "deep.json"), "{}");
		const result = await discoverDraftDirectory({ draftDirectory: draftRoot });
		expect(
			result.skipped.some(
				(entry) =>
					entry.relativePath === "logs" && entry.reason === "denied-directory"
			)
		).toBe(true);
		expect(result.skipped.some((entry) => entry.reason === "depth-limit")).toBe(
			true
		);
		expect(JSON.stringify(result.files)).not.toContain("deep.json");
	});

	it("rejects a root that is not a directory", async () => {
		const filePath = join(draftRoot, "draft_info.json");
		await writeFile(filePath, "{}");
		await expect(
			discoverDraftDirectory({ draftDirectory: filePath })
		).rejects.toThrow(/not a directory/);
	});
});

describe("readDraftSourceSnapshot", () => {
	it("hashes, classifies, and parses within bounds", async () => {
		await writeDraftFixture();
		await writeFile(join(draftRoot, "draft_settings"), "not json at all");
		const discovery = await discoverDraftDirectory({
			draftDirectory: draftRoot,
		});
		const snapshot = await readDraftSourceSnapshot({
			rootRealPath: discovery.rootRealPath,
			files: discovery.files,
		});
		expect(snapshot.issues).toEqual([]);
		const byPath = Object.fromEntries(
			snapshot.files.map((file) => [file.relativePath, file])
		);
		expect(byPath["draft_info.json"].classification).toBe("plaintext-json");
		expect(byPath["draft_info.json"].sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(byPath["draft_settings"].classification).toBe("opaque-text");
		expect(byPath["assets/clip.bin"].classification).toBe("binary");
		expect(snapshot.parsedJsonByPath["draft_info.json"]).toMatchObject({
			id: "draft-1",
		});
		// Asset bytes are never parsed.
		expect(snapshot.parsedJsonByPath["assets/clip.bin"]).toBeUndefined();
	});

	it("classifies a binary content file as encrypted", async () => {
		await writeFile(
			join(draftRoot, "draft_info.json"),
			Buffer.from([0xff, 0xfe, 0x00, 0x93, 0x11])
		);
		const discovery = await discoverDraftDirectory({
			draftDirectory: draftRoot,
		});
		const snapshot = await readDraftSourceSnapshot({
			rootRealPath: discovery.rootRealPath,
			files: discovery.files,
		});
		expect(snapshot.files[0].classification).toBe("encrypted");
		expect(snapshot.parsedJsonByPath["draft_info.json"]).toBeUndefined();
	});

	it("enforces the per-file size limit before reading", async () => {
		await writeFile(join(draftRoot, "draft_info.json"), "x".repeat(2048));
		const discovery = await discoverDraftDirectory({
			draftDirectory: draftRoot,
		});
		const snapshot = await readDraftSourceSnapshot({
			rootRealPath: discovery.rootRealPath,
			files: discovery.files,
			maxFileBytes: 1024,
		});
		expect(snapshot.files).toEqual([]);
		expect(snapshot.issues[0]).toMatchObject({
			code: "SOURCE_FILE_TOO_LARGE",
			path: "draft_info.json",
		});
	});

	it("enforces the total snapshot budget", async () => {
		await writeFile(join(draftRoot, "draft_info.json"), "a".repeat(600));
		await writeFile(join(draftRoot, "draft_meta_info.json"), "b".repeat(600));
		const discovery = await discoverDraftDirectory({
			draftDirectory: draftRoot,
		});
		const snapshot = await readDraftSourceSnapshot({
			rootRealPath: discovery.rootRealPath,
			files: discovery.files,
			maxTotalBytes: 1000,
		});
		expect(snapshot.files).toHaveLength(1);
		expect(
			snapshot.issues.some((issue) => issue.code === "SOURCE_FILE_TOO_LARGE")
		).toBe(true);
	});

	it("refuses to read through a symlink even if listed", async () => {
		await writeFile(join(draftRoot, "target.json"), "{}");
		await symlink(
			join(draftRoot, "target.json"),
			join(draftRoot, "draft_info.json")
		);
		const snapshot = await readDraftSourceSnapshot({
			rootRealPath: draftRoot,
			// Bypass discovery on purpose: a hostile caller lists the symlink.
			files: [
				{ relativePath: "draft_info.json", role: "content", byteLength: 2 },
			],
		});
		expect(snapshot.files).toEqual([]);
		expect(snapshot.issues[0]).toMatchObject({ code: "SOURCE_FILE_MISSING" });
	});
});

describe("verifyDraftSourceUnchanged", () => {
	it("passes on an untouched source and fails after edits or deletes", async () => {
		await writeDraftFixture();
		const discovery = await discoverDraftDirectory({
			draftDirectory: draftRoot,
		});
		const snapshot = await readDraftSourceSnapshot({
			rootRealPath: discovery.rootRealPath,
			files: discovery.files,
		});
		expect(await verifyDraftSourceUnchanged({ snapshot })).toEqual([]);

		await writeFile(
			join(draftRoot, "draft_info.json"),
			JSON.stringify({ id: "draft-1", tracks: [], materials: {}, x: 1 })
		);
		await rm(join(draftRoot, "draft_meta_info.json"));
		const issues = await verifyDraftSourceUnchanged({ snapshot });
		expect(issues.find((issue) => issue.path === "draft_info.json")?.code).toBe(
			"SOURCE_FILE_CHANGED"
		);
		expect(
			issues.find((issue) => issue.path === "draft_meta_info.json")?.code
		).toBe("SOURCE_FILE_MISSING");
	});
});

describe("validateDraftInspectRequest", () => {
	it("accepts a minimal valid request", () => {
		const result = validateDraftInspectRequest({
			draftPath: "/drafts/my-draft",
			maxFileBytes: 1024,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.request.draftPath).toBe("/drafts/my-draft");
			expect(result.request.maxFileBytes).toBe(1024);
		}
	});

	it("rejects unknown keys fail-closed", () => {
		const result = validateDraftInspectRequest({
			draftPath: "/drafts/my-draft",
			followSymlinks: true,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0].field).toBe("followSymlinks");
		}
	});

	it("rejects relative, traversal, NUL, and non-string paths", () => {
		for (const draftPath of [
			"drafts/my-draft",
			"/drafts/../etc/passwd",
			"/drafts/nul\u0000byte",
			42,
			"",
		]) {
			const result = validateDraftInspectRequest({ draftPath });
			expect(result.ok).toBe(false);
		}
	});

	it("rejects oversized or non-integer limits", () => {
		for (const maxTotalBytes of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER]) {
			const result = validateDraftInspectRequest({
				draftPath: "/drafts/my-draft",
				maxTotalBytes,
			});
			expect(result.ok).toBe(false);
		}
	});

	it("rejects non-object requests", () => {
		expect(validateDraftInspectRequest(null).ok).toBe(false);
		expect(validateDraftInspectRequest([]).ok).toBe(false);
		expect(validateDraftInspectRequest("path").ok).toBe(false);
	});
});

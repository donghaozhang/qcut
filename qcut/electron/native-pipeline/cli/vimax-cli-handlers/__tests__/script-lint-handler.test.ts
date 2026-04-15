import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { handleLintScripts } from "../script-lint-handler.js";

function makeProject(): { root: string; slug: string } {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-lint-"));
	// script-lint-handler resolves by slug under ~/Documents/QCut/projects,
	// so redirect that via an env var the path resolver honors. If none
	// exists, we stage the project at the resolved path.
	const slug = `lint-test-${Date.now()}`;
	const home = process.env.HOME ?? os.homedir();
	const projectsRoot = path.join(home, "Documents", "QCut", "projects");
	const root = path.join(projectsRoot, slug);
	fs.mkdirSync(root, { recursive: true });
	fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
	// Clean up the scratch dir — we only needed the name.
	fs.rmSync(tmp, { recursive: true, force: true });
	return { root, slug };
}

function writeCharacters(root: string, names: string[]): void {
	fs.writeFileSync(
		path.join(root, "characters.json"),
		JSON.stringify(
			names.map((n) => ({ name: n })),
			null,
			2
		)
	);
}

function writeChunk(
	root: string,
	index: number,
	shots: Array<{
		shot_id: string;
		description?: string;
		characters?: string[];
	}>
): void {
	const padded = String(index).padStart(3, "0");
	const file = path.join(root, "scripts", `chunk_${padded}.json`);
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				scenes: [{ shots }],
			},
			null,
			2
		)
	);
}

describe("handleLintScripts", () => {
	let root: string;
	let slug: string;

	beforeEach(() => {
		({ root, slug } = makeProject());
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("fails when --project is missing", async () => {
		const res = await handleLintScripts({} as never, () => {});
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/--project/);
	});

	it("fails when characters.json is missing", async () => {
		// No characters.json written
		writeChunk(root, 1, [{ shot_id: "1", description: "x", characters: [] }]);
		const res = await handleLintScripts(
			{ projectId: slug } as never,
			() => {}
		);
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/No catalogued characters/i);
	});

	it("fails when scripts dir has no chunk files", async () => {
		writeCharacters(root, ["Alice"]);
		const res = await handleLintScripts(
			{ projectId: slug } as never,
			() => {}
		);
		expect(res.success).toBe(false);
		expect(res.error).toMatch(/No scripts\//i);
	});

	it("returns no findings for a clean project", async () => {
		writeCharacters(root, ["Alice"]);
		writeChunk(root, 1, [
			{ shot_id: "1-1-01", description: "Alice enters", characters: ["Alice"] },
		]);
		const res = await handleLintScripts(
			{ projectId: slug } as never,
			() => {}
		);
		expect(res.success).toBe(true);
		expect(res.data).toMatchObject({
			project: slug,
			scanned: 1,
			findings: [],
			auto_fix_applied: 0,
		});
	});

	it("reports findings without modifying files when --auto-fix is off", async () => {
		writeCharacters(root, ["Alice", "Bob"]);
		writeChunk(root, 1, [
			{
				shot_id: "1-1-02",
				description: "The announcer says Alice and Bob will wed",
				characters: ["Announcer"],
			},
		]);
		const before = fs.readFileSync(
			path.join(root, "scripts", "chunk_001.json"),
			"utf-8"
		);
		const res = await handleLintScripts(
			{ projectId: slug } as never,
			() => {}
		);
		expect(res.success).toBe(true);
		const data = res.data as {
			findings: Array<{ shot_id: string; missing: string[] }>;
			auto_fix_applied: number;
		};
		expect(data.findings).toHaveLength(1);
		expect(data.findings[0].shot_id).toBe("1-1-02");
		expect(data.findings[0].missing).toEqual(["Alice", "Bob"]);
		expect(data.auto_fix_applied).toBe(0);
		// File unchanged
		const after = fs.readFileSync(
			path.join(root, "scripts", "chunk_001.json"),
			"utf-8"
		);
		expect(after).toBe(before);
	});

	it("rewrites chunk file + backup when --auto-fix is set", async () => {
		writeCharacters(root, ["Alice", "Bob"]);
		writeChunk(root, 1, [
			{
				shot_id: "1-1-02",
				description: "Alice and Bob enter",
				characters: ["Announcer"],
			},
		]);
		const res = await handleLintScripts(
			{ projectId: slug, autoFix: true } as never,
			() => {}
		);
		expect(res.success).toBe(true);
		const data = res.data as { auto_fix_applied: number };
		expect(data.auto_fix_applied).toBe(2);

		const chunkPath = path.join(root, "scripts", "chunk_001.json");
		const rewritten = JSON.parse(fs.readFileSync(chunkPath, "utf-8"));
		expect(rewritten.scenes[0].shots[0].characters).toEqual([
			"Announcer",
			"Alice",
			"Bob",
		]);

		// Backup exists
		const files = fs.readdirSync(path.join(root, "scripts"));
		expect(files.some((f) => /^chunk_001\.json\.bak\.\d+$/.test(f))).toBe(
			true
		);
	});
});

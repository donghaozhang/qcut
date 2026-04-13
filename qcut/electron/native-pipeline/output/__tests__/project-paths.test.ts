import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	safeProjectSlug,
	getProjectsRoot,
	resolveProjectPaths,
	ensureProjectDirs,
	writeProjectMetadata,
	readProjectMetadata,
	markStageCompleted,
	PROJECT_SCHEMA_VERSION,
} from "../project-paths";

describe("safeProjectSlug", () => {
	it("strips file extension", () => {
		expect(safeProjectSlug("story.md")).toBe("story");
	});

	it("normalises whitespace and punctuation to dashes", () => {
		expect(safeProjectSlug("My Cool Novel! (v2)")).toBe("My-Cool-Novel-v2");
	});

	it("preserves unicode letters and digits", () => {
		expect(safeProjectSlug("星降る夜のカフェ.md")).toBe("星降る夜のカフェ");
	});

	it("falls back to 'untitled' for empty input", () => {
		expect(safeProjectSlug("")).toBe("untitled");
		expect(safeProjectSlug("!!!")).toBe("untitled");
	});
});

describe("getProjectsRoot", () => {
	it("honours QCUT_PROJECTS_DIR override", () => {
		const before = process.env.QCUT_PROJECTS_DIR;
		process.env.QCUT_PROJECTS_DIR = "/tmp/qcut-custom-root";
		try {
			expect(getProjectsRoot()).toBe("/tmp/qcut-custom-root");
		} finally {
			if (before === undefined) delete process.env.QCUT_PROJECTS_DIR;
			else process.env.QCUT_PROJECTS_DIR = before;
		}
	});
});

describe("project metadata round-trip", () => {
	let tmpRoot: string;
	let savedEnv: string | undefined;

	beforeEach(() => {
		savedEnv = process.env.QCUT_PROJECTS_DIR;
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-projects-"));
		process.env.QCUT_PROJECTS_DIR = tmpRoot;
	});

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.QCUT_PROJECTS_DIR;
		else process.env.QCUT_PROJECTS_DIR = savedEnv;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("resolveProjectPaths exposes all expected paths", () => {
		const paths = resolveProjectPaths("anime-example");
		expect(paths.slug).toBe("anime-example");
		expect(paths.root).toBe(path.join(tmpRoot, "anime-example"));
		expect(paths.metadataPath).toBe(
			path.join(tmpRoot, "anime-example", "project.json")
		);
		expect(paths.charactersPath).toBe(
			path.join(tmpRoot, "anime-example", "characters.json")
		);
		expect(paths.portraitsDir).toBe(
			path.join(tmpRoot, "anime-example", "portraits")
		);
		expect(paths.portraitRegistryPath).toBe(
			path.join(tmpRoot, "anime-example", "portraits", "registry.json")
		);
		expect(paths.scriptsDir).toBe(
			path.join(tmpRoot, "anime-example", "scripts")
		);
	});

	it("ensureProjectDirs creates the project root", () => {
		const paths = resolveProjectPaths("new-project");
		ensureProjectDirs(paths);
		expect(fs.existsSync(paths.root)).toBe(true);
	});

	it("writeProjectMetadata persists fields and preserves created_at on update", () => {
		const paths = resolveProjectPaths("test-project");
		const first = writeProjectMetadata(paths, {
			slug: "test-project",
			title: "Test Project",
			novel_path: "/abs/path/test.md",
		});
		expect(first.schema_version).toBe(PROJECT_SCHEMA_VERSION);
		expect(first.stages_completed).toEqual([]);
		expect(first.created_at).toBe(first.updated_at);

		const second = writeProjectMetadata(paths, {
			style: "anime pastel",
		});
		expect(second.created_at).toBe(first.created_at);
		expect(second.updated_at >= first.updated_at).toBe(true);
		expect(second.title).toBe("Test Project");
		expect(second.style).toBe("anime pastel");
	});

	it("readProjectMetadata returns undefined when project.json missing", () => {
		const paths = resolveProjectPaths("ghost");
		expect(readProjectMetadata(paths)).toBeUndefined();
	});

	it("markStageCompleted is idempotent and preserves order", () => {
		const paths = resolveProjectPaths("stage-test");
		writeProjectMetadata(paths, { slug: "stage-test" });
		markStageCompleted(paths, "characters");
		markStageCompleted(paths, "portraits");
		markStageCompleted(paths, "characters"); // duplicate
		const meta = readProjectMetadata(paths);
		expect(meta?.stages_completed).toContain("characters");
		expect(meta?.stages_completed).toContain("portraits");
		expect(meta?.stages_completed.length).toBe(2);
	});
});

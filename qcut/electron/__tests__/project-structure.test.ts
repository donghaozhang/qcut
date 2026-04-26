// @vitest-environment node
/**
 * Tests for the shared project structure helpers.
 *
 * Covers:
 *   - sanitizePathComponent strips traversal payloads
 *   - validatePathWithinBase rejects escapes
 *   - ensureProjectStructure creates missing folders, leaves existing alone,
 *     and recovers when an individual mkdir fails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as path from "path";

// Mock electron's `app` module before importing the SUT.
vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			return "/mock/unknown";
		}),
	},
}));

// fs spies — installed per test by `setupFsMocks`.
const accessMock = vi.fn();
const mkdirMock = vi.fn();
const statMock = vi.fn();

vi.mock("fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs")>();
	return {
		...actual,
		default: actual,
		promises: {
			...actual.promises,
			access: (...args: any[]) => accessMock(...args),
			mkdir: (...args: any[]) => mkdirMock(...args),
			stat: (...args: any[]) => statMock(...args),
		},
	};
});

import {
	REQUIRED_PROJECT_FOLDERS,
	ensureProjectStructure,
	getProjectRoot,
	getProjectsBasePath,
	isExistingDirectory,
	sanitizePathComponent,
	validatePathWithinBase,
} from "../lib/project-structure";

beforeEach(() => {
	accessMock.mockReset();
	mkdirMock.mockReset();
	statMock.mockReset();
});

// ============================================================================
// sanitizePathComponent
// ============================================================================

describe("sanitizePathComponent", () => {
	it("strips forward and back slashes", () => {
		expect(sanitizePathComponent("a/b\\c")).toBe("abc");
	});

	it("strips parent-directory references", () => {
		expect(sanitizePathComponent("..foo")).toBe("foo");
		expect(sanitizePathComponent("..\\..\\bar")).toBe("bar");
	});

	it("preserves alphanumeric characters and hyphens/underscores/dots", () => {
		expect(sanitizePathComponent("project_v1.0-rc")).toBe("project_v1.0-rc");
	});

	// Regression: odd-length dot runs ("...", ".....") used to leave a residual
	// "." which `path.join(base, ".")` collapses to base. The "\.{2,}" pattern
	// now consumes the entire run.
	it.each([
		["...", ""],
		["....", ""],
		[".....", ""],
		["....proj", "proj"],
		["a..b", "ab"],
	])("collapses any run of 2+ dots: %s → %s", (input, expected) => {
		expect(sanitizePathComponent(input)).toBe(expected);
	});

	it("preserves single dots between segments", () => {
		expect(sanitizePathComponent("a.b.c")).toBe("a.b.c");
	});
});

// ============================================================================
// validatePathWithinBase
// ============================================================================

describe("validatePathWithinBase", () => {
	const base = path.resolve("/mock/Documents/QCut/Projects");

	it("accepts a path inside the base", () => {
		expect(() =>
			validatePathWithinBase(path.join(base, "abc"), base)
		).not.toThrow();
	});

	it("accepts the base itself", () => {
		expect(() => validatePathWithinBase(base, base)).not.toThrow();
	});

	it("rejects a sibling of the base", () => {
		expect(() =>
			validatePathWithinBase(path.resolve("/mock/Documents/Other"), base)
		).toThrow(/Path traversal/);
	});

	it("rejects a parent escape", () => {
		expect(() =>
			validatePathWithinBase(path.resolve(base, "..", "..", "etc"), base)
		).toThrow(/Path traversal/);
	});
});

// ============================================================================
// getProjectRoot — reject IDs that sanitize to empty
// ============================================================================

describe("getProjectRoot", () => {
	it("resolves a valid project ID under the base", () => {
		expect(getProjectRoot("proj-1")).toBe(
			path.join("/mock/Documents", "QCut", "Projects", "proj-1")
		);
	});

	it.each([
		["empty string", ""],
		["dotdot", ".."],
		["slash", "/"],
		["backslash", "\\"],
		["triple dots", "..."],
		["five dots", "....."],
	])("throws on %s (sanitizes to empty)", (_label, input) => {
		expect(() => getProjectRoot(input)).toThrow(/sanitizes to an empty/);
	});

	// Regression: inputs that sanitize to "." (e.g. "./" — slash stripped)
	// must not be allowed; `path.join(base, ".")` resolves to `base` itself.
	it.each([
		["lone dot", "."],
		["dot-slash", "./"],
		["dot-backslash", ".\\"],
	])("throws on %s (resolves to projects base)", (_label, input) => {
		expect(() => getProjectRoot(input)).toThrow(/projects base directory/);
	});
});

// ============================================================================
// getProjectsBasePath
// ============================================================================

describe("getProjectsBasePath", () => {
	it("returns Documents/QCut/Projects", () => {
		expect(getProjectsBasePath()).toBe(
			path.join("/mock/Documents", "QCut", "Projects")
		);
	});
});

// ============================================================================
// isExistingDirectory
// ============================================================================

describe("isExistingDirectory", () => {
	it("returns true when stat reports a directory", async () => {
		statMock.mockResolvedValue({ isDirectory: () => true });
		await expect(isExistingDirectory("/anything")).resolves.toBe(true);
	});

	it("returns false when stat reports a non-directory", async () => {
		statMock.mockResolvedValue({ isDirectory: () => false });
		await expect(isExistingDirectory("/anything")).resolves.toBe(false);
	});

	it("returns false when stat throws", async () => {
		statMock.mockRejectedValue(
			Object.assign(new Error("nope"), { code: "ENOENT" })
		);
		await expect(isExistingDirectory("/anything")).resolves.toBe(false);
	});
});

// ============================================================================
// ensureProjectStructure
// ============================================================================

describe("ensureProjectStructure", () => {
	it("creates every required folder when none exist", async () => {
		// stat throws → not present → mkdir is called for each folder
		statMock.mockRejectedValue(
			Object.assign(new Error("ENOENT"), { code: "ENOENT" })
		);
		mkdirMock.mockResolvedValue(undefined);

		const result = await ensureProjectStructure("proj-1");

		expect(result.created).toEqual(Array.from(REQUIRED_PROJECT_FOLDERS));
		expect(result.existing).toEqual([]);
		expect(mkdirMock).toHaveBeenCalledTimes(REQUIRED_PROJECT_FOLDERS.length);
		expect(result.projectRoot).toBe(
			path.join("/mock/Documents", "QCut", "Projects", "proj-1")
		);
	});

	it("reports every folder as existing when stat reports a directory", async () => {
		statMock.mockResolvedValue({ isDirectory: () => true });

		const result = await ensureProjectStructure("proj-1");

		expect(result.created).toEqual([]);
		expect(result.existing).toEqual(Array.from(REQUIRED_PROJECT_FOLDERS));
		expect(mkdirMock).not.toHaveBeenCalled();
	});

	// Regression: a stray FILE at a required folder path used to be
	// classified as "existing" via fs.access, then the next write would
	// fail with ENOTDIR with no recovery. Now we stat → isDirectory()
	// and try to mkdir over it (which surfaces the conflict via EEXIST/
	// ENOTDIR and is collected by omission so the caller can recover).
	it("does NOT mark a folder as existing when a file occupies its path", async () => {
		statMock.mockResolvedValue({ isDirectory: () => false });
		// mkdir on top of a file fails (real ENOTDIR semantics).
		mkdirMock.mockRejectedValue(
			Object.assign(new Error("ENOTDIR"), { code: "ENOTDIR" })
		);

		const result = await ensureProjectStructure("proj-1");

		expect(result.existing).toEqual([]);
		expect(result.created).toEqual([]);
		// We tried mkdir for every folder (none of them survived).
		expect(mkdirMock).toHaveBeenCalledTimes(REQUIRED_PROJECT_FOLDERS.length);
	});

	it("collects per-folder mkdir failures by omission and keeps going", async () => {
		// Every folder is missing.
		statMock.mockRejectedValue(
			Object.assign(new Error("ENOENT"), { code: "ENOENT" })
		);
		// First mkdir fails, the rest succeed.
		let callCount = 0;
		mkdirMock.mockImplementation(async () => {
			callCount++;
			if (callCount === 1) throw new Error("EACCES");
			return undefined;
		});

		const result = await ensureProjectStructure("proj-1");

		expect(result.created.length).toBe(REQUIRED_PROJECT_FOLDERS.length - 1);
		expect(result.existing).toEqual([]);
		expect(mkdirMock).toHaveBeenCalledTimes(REQUIRED_PROJECT_FOLDERS.length);
	});

	it("sanitizes the project ID before resolving the root", async () => {
		statMock.mockResolvedValue({ isDirectory: () => true });

		const result = await ensureProjectStructure("../escape");

		expect(result.projectRoot).toBe(
			path.join("/mock/Documents", "QCut", "Projects", "escape")
		);
		expect(result.projectRoot).not.toContain("..");
	});

	it("rejects an empty project ID rather than ensuring the base directory", async () => {
		statMock.mockResolvedValue({ isDirectory: () => true });
		await expect(ensureProjectStructure("")).rejects.toThrow(
			/sanitizes to an empty/
		);
		await expect(ensureProjectStructure("..")).rejects.toThrow(
			/sanitizes to an empty/
		);
		// And no fs operations should have been issued.
		expect(mkdirMock).not.toHaveBeenCalled();
		expect(statMock).not.toHaveBeenCalled();
	});
});

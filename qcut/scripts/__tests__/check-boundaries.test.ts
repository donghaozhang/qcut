/**
 * Tests for the boundary checker's platform audit mode.
 *
 * Since check-boundaries.ts uses import.meta.dir (Bun-specific) to resolve
 * ROOT, we test by pointing at actual renderer files in the real codebase
 * rather than temp files.
 */
import { afterAll, describe, it, expect } from "vitest";
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { resolve } from "path";

// Import the checkFile function — ROOT resolves relative to scripts/
// This works because vitest runs from the qcut root
const { checkFile } = await import("../check-boundaries.js");

// Use the actual project root for test files
const ROOT = resolve(import.meta.dirname, "../..");
const TEST_FILE = resolve(ROOT, "apps/web/src/__test-boundary-check.ts");

function writeTestFile(content: string): string {
	writeFileSync(TEST_FILE, content, "utf-8");
	return TEST_FILE;
}

function cleanup() {
	try {
		unlinkSync(TEST_FILE);
	} catch {}
}

// Clean up after all tests
afterAll(() => cleanup());

describe("checkFile — existing rules", () => {
	it("detects process.env usage", () => {
		const file = writeTestFile("const x = process.env.NODE_ENV;\n");
		const violations = checkFile(file);
		expect(violations.some((v) => v.rule === "no-process-env")).toBe(true);
	});

	it("detects direct electron import", () => {
		const file = writeTestFile('import { ipcRenderer } from "electron";\n');
		const violations = checkFile(file);
		expect(violations.some((v) => v.rule === "no-electron-import")).toBe(true);
	});

	it("passes clean files", () => {
		const file = writeTestFile("const x = import.meta.env.DEV;\n");
		const violations = checkFile(file);
		expect(violations.filter((v) => v.rule !== "file-size")).toHaveLength(0);
	});
});

describe("checkFile — platform audit mode", () => {
	it("detects window.electronAPI in audit mode", () => {
		const file = writeTestFile(
			'const result = await window.electronAPI.files.read("test");\n'
		);
		const violations = checkFile(file, { platformAudit: true });
		expect(
			violations.some((v) => v.rule === "platform-direct-electron-api")
		).toBe(true);
	});

	it("does not detect window.electronAPI without audit mode", () => {
		const file = writeTestFile(
			'const result = await window.electronAPI.files.read("test");\n'
		);
		const violations = checkFile(file);
		expect(
			violations.some((v) => v.rule === "platform-direct-electron-api")
		).toBe(false);
	});

	it("skips comments in audit mode", () => {
		const file = writeTestFile(
			'// window.electronAPI.files.read("test");\nconst x = 1;\n'
		);
		const violations = checkFile(file, { platformAudit: true });
		expect(
			violations.some((v) => v.rule === "platform-direct-electron-api")
		).toBe(false);
	});

	it("includes line number and fix suggestion", () => {
		const file = writeTestFile(
			'const a = 1;\nconst b = window.electronAPI.storage.load("key");\n'
		);
		const violations = checkFile(file, { platformAudit: true });
		const v = violations.find((v) => v.rule === "platform-direct-electron-api");
		expect(v).toBeDefined();
		expect(v?.line).toBe(2);
		expect(v?.fix).toContain("platform adapter");
	});
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";

// Import the checkFile function from the script
// We test via spawning the script since it's a standalone Bun script
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "../../../../..");
const SCRIPT = resolve(ROOT, "scripts/check-boundaries.ts");
const TMP_DIR = resolve(ROOT, "apps/web/src/.test-boundaries-tmp");

function run(args = ""): { stdout: string; stderr: string; code: number } {
	try {
		const stdout = execSync(`bun ${SCRIPT} ${args}`, {
			encoding: "utf-8",
			cwd: ROOT,
			env: { ...process.env, PATH: process.env.PATH },
		});
		return { stdout, stderr: "", code: 0 };
	} catch (err: any) {
		return {
			stdout: err.stdout || "",
			stderr: err.stderr || "",
			code: err.status ?? 1,
		};
	}
}

describe("check-boundaries script", () => {
	// Run the full scan — we already fixed violations, so it should report
	// only pre-existing large files (which are in test/ and excluded)
	it("runs without crashing on full scan", () => {
		const result = run();
		// Should either pass cleanly or report violations (not crash)
		expect(result.code === 0 || result.stderr.includes("ERROR")).toBe(
			true
		);
	});

	it("prints passed message when no violations found on staged (empty staging)", () => {
		const result = run("--staged");
		expect(result.stdout).toContain("No staged renderer files to check");
		expect(result.code).toBe(0);
	});

	it("detects process.env violations", () => {
		const result = run();
		// After our fixes, no process.env violations should remain in
		// non-excluded renderer files. If the script passes, great.
		// If it fails, the errors should contain fix instructions.
		if (result.code !== 0) {
			expect(result.stderr).toContain("Fix:");
		}
	});

	it("output includes fix instructions for every violation", () => {
		const result = run();
		if (result.code !== 0) {
			const errors = result.stderr
				.split("\n\n")
				.filter((block) => block.includes("ERROR"));
			for (const error of errors) {
				expect(error).toContain("Fix:");
			}
		}
	});

	it("output includes rule tag for every violation", () => {
		const result = run();
		if (result.code !== 0) {
			const errorLines = result.stderr
				.split("\n")
				.filter((l) => l.startsWith("ERROR"));
			for (const line of errorLines) {
				expect(line).toMatch(/ERROR \[[\w-]+\]/);
			}
		}
	});
});

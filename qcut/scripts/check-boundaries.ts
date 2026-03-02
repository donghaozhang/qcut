/**
 * Boundary Check Script for QCut Renderer Code
 *
 * Scans apps/web/src/ for violations of Electron/renderer boundaries:
 * 1. process.env usage (should use import.meta.env)
 * 2. Direct electron imports (should use window.electronAPI)
 * 3. Direct ipcRenderer imports (should use window.electronAPI)
 * 4. Direct fs/node module imports (should use IPC bridge)
 * 5. Files exceeding 800-line limit
 *
 * Output is agent-friendly with fix instructions per violation.
 *
 * Usage:
 *   bun scripts/check-boundaries.ts                    # scan all renderer files
 *   bun scripts/check-boundaries.ts --staged            # scan only staged files
 *   bun scripts/check-boundaries.ts --no-file-size      # skip file-size checks (CI mode)
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, relative, extname } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dir, "..");
const RENDERER_DIR = resolve(ROOT, "apps/web/src");
const MAX_LINES = 800;

interface Violation {
	rule: string;
	file: string;
	line?: number;
	found: string;
	fix: string;
	docs?: string;
}

const RULES: {
	pattern: RegExp;
	rule: string;
	fix: string;
	docs?: string;
}[] = [
	{
		pattern: /\bprocess\.env\b/,
		rule: "no-process-env",
		fix: "Use import.meta.env.DEV (boolean) or import.meta.env.VITE_* for custom vars",
		docs: 'See CLAUDE.md "Environment Variables" section',
	},
	{
		pattern: /\b(?:import\s+[^'"]+\s+from\s+|require\s*\()\s*['"]electron['"]\)?/,
		rule: "no-electron-import",
		fix: "Use window.electronAPI.* via IPC bridge (see src/types/electron/)",
		docs: 'See CLAUDE.md "Electron API Best Practices" section',
	},
	{
		pattern: /\b(?:import\s+[^'"]+\s+from\s+|require\s*\()\s*['"]electron\/[^'"]+['"]\)?/,
		rule: "no-electron-import",
		fix: "Use window.electronAPI.* via IPC bridge (see src/types/electron/)",
		docs: 'See CLAUDE.md "Electron API Best Practices" section',
	},
	{
		pattern: /\bipcRenderer\b/,
		rule: "no-ipc-renderer",
		fix: "Use window.electronAPI.* — direct ipcRenderer access bypasses the type-safe bridge",
		docs: 'See CLAUDE.md "Electron API Best Practices" section',
	},
	{
		pattern: /\b(?:import\s+[^'"]+\s+from\s+|require\s*\()\s*['"](node:)?fs(?:\/promises)?['"]\)?/,
		rule: "no-fs-import",
		fix: "Use window.electronAPI.files.* via IPC bridge for file system operations",
		docs: 'See CLAUDE.md "Electron IPC" section',
	},
	{
		pattern: /\bwindow\.require\b/,
		rule: "no-window-require",
		fix: "Do not use window.require(). Use window.electronAPI.* via preload bridge",
		docs: 'See CLAUDE.md "Electron Boundary Rules" section',
	},
];

const EXCLUDE_DIRS = ["test", "tests", "types", "__mocks__", "__tests__"];

function shouldExclude(filePath: string): boolean {
	const rel = relative(RENDERER_DIR, filePath);
	const parts = rel.split(/[\\/]/);
	return parts.some((part) => EXCLUDE_DIRS.includes(part));
}

function collectFiles(dir: string, ext: string[]): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules") continue;
			files.push(...collectFiles(full, ext));
		} else if (ext.includes(extname(entry.name))) {
			files.push(full);
		}
	}
	return files;
}

function getStagedFiles(): string[] {
	const output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
		encoding: "utf-8",
		cwd: ROOT,
	});
	return output
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((f) => resolve(ROOT, f))
		.filter(
			(f) => f.startsWith(RENDERER_DIR) && [".ts", ".tsx"].includes(extname(f))
		);
}

export function checkFile(filePath: string): Violation[] {
	const violations: Violation[] = [];
	if (shouldExclude(filePath)) return violations;

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const rel = relative(ROOT, filePath);

	// Line-by-line rule checks
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Skip comments
		const trimmed = line.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

		for (const rule of RULES) {
			if (rule.pattern.test(line)) {
				violations.push({
					rule: rule.rule,
					file: rel,
					line: i + 1,
					found: trimmed,
					fix: rule.fix,
					docs: rule.docs,
				});
			}
		}
	}

	// File size check
	if (lines.length > MAX_LINES) {
		violations.push({
			rule: "file-size",
			file: rel,
			found: `${lines.length} lines (limit: ${MAX_LINES})`,
			fix: "Split into smaller focused modules (see CLAUDE.md)",
		});
	}

	return violations;
}

function formatViolation(v: Violation): string {
	const location = v.line ? `${v.file}:${v.line}` : v.file;
	let msg = `ERROR [${v.rule}] ${location}\n`;
	msg += `  Found: ${v.found}\n`;
	msg += `  Fix: ${v.fix}`;
	if (v.docs) msg += `\n  Docs: ${v.docs}`;
	return msg;
}

function main() {
	const args = process.argv.slice(2);
	const stagedOnly = args.includes("--staged");
	const skipFileSize = args.includes("--no-file-size");

	let files: string[];
	if (stagedOnly) {
		files = getStagedFiles();
		if (files.length === 0) {
			console.log("No staged renderer files to check.");
			process.exit(0);
		}
	} else {
		files = collectFiles(RENDERER_DIR, [".ts", ".tsx"]);
	}

	const allViolations: Violation[] = [];
	for (const file of files) {
		allViolations.push(...checkFile(file));
	}

	const filtered = skipFileSize
		? allViolations.filter((v) => v.rule !== "file-size")
		: allViolations;

	if (filtered.length === 0) {
		console.log(`Boundary check passed (${files.length} files scanned).`);
		process.exit(0);
	}

	console.error(`\nBoundary violations found (${filtered.length}):\n`);
	for (const v of filtered) {
		console.error(formatViolation(v));
		console.error("");
	}
	process.exit(1);
}

if (import.meta.main) {
	main();
}

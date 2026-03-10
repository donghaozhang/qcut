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

const __dir = import.meta.dirname ?? import.meta.dir;
const ROOT = resolve(__dir, "..");
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
		pattern:
			/\b(?:import\s+[^'"]+\s+from\s+|require\s*\()\s*['"]electron['"]\)?/,
		rule: "no-electron-import",
		fix: "Use window.electronAPI.* via IPC bridge (see src/types/electron/)",
		docs: 'See CLAUDE.md "Electron API Best Practices" section',
	},
	{
		pattern:
			/\b(?:import\s+[^'"]+\s+from\s+|require\s*\()\s*['"]electron\/[^'"]+['"]\)?/,
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
		pattern:
			/\b(?:import\s+[^'"]+\s+from\s+|require\s*\()\s*['"](node:)?fs(?:\/promises)?['"]\)?/,
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

/** Platform migration rule: tracks window.electronAPI usage for migration auditing */
const PLATFORM_AUDIT_RULE = {
	pattern: /\bwindow\.electronAPI\b/,
	rule: "platform-direct-electron-api",
	fix: "Use platform adapter (packages/platform-*) instead of direct window.electronAPI access",
	docs: "See docs/task/multi-platform-migration.md Phase 2",
};

/** Directories within packages/platform-* that are allowed to use window.electronAPI */
const PLATFORM_ADAPTER_PATHS = [
	"packages/platform-desktop",
	"packages/platform-core",
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

export function checkFile(
	filePath: string,
	options?: { platformAudit?: boolean }
): Violation[] {
	const violations: Violation[] = [];
	if (shouldExclude(filePath)) return violations;

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const rel = relative(ROOT, filePath);

	// Skip platform adapter packages from electronAPI audit
	const isAdapterCode = PLATFORM_ADAPTER_PATHS.some((p) => rel.startsWith(p));

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

		// Platform audit: track direct window.electronAPI usage
		if (options?.platformAudit && !isAdapterCode) {
			if (PLATFORM_AUDIT_RULE.pattern.test(line)) {
				violations.push({
					rule: PLATFORM_AUDIT_RULE.rule,
					file: rel,
					line: i + 1,
					found: trimmed,
					fix: PLATFORM_AUDIT_RULE.fix,
					docs: PLATFORM_AUDIT_RULE.docs,
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
	const platformAudit = args.includes("--platform-audit");

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
		allViolations.push(...checkFile(file, { platformAudit }));
	}

	// Platform audit mode: report electronAPI usage matrix without failing
	if (platformAudit) {
		const auditViolations = allViolations.filter(
			(v) => v.rule === "platform-direct-electron-api"
		);
		const remaining = allViolations.filter(
			(v) => v.rule !== "platform-direct-electron-api"
		);

		if (auditViolations.length > 0) {
			// Group by file for matrix view
			const byFile = new Map<string, number>();
			for (const v of auditViolations) {
				byFile.set(v.file, (byFile.get(v.file) || 0) + 1);
			}

			// Extract namespace usage (window.electronAPI.xxx)
			const byNamespace = new Map<string, number>();
			for (const v of auditViolations) {
				const match = v.found.match(/window\.electronAPI\.(\w+)/);
				const ns = match ? match[1] : "unknown";
				byNamespace.set(ns, (byNamespace.get(ns) || 0) + 1);
			}

			console.log("\n=== Platform Migration Audit ===\n");
			console.log(
				`Total window.electronAPI references: ${auditViolations.length}`
			);
			console.log(`Across ${byFile.size} files\n`);

			console.log("--- By File (descending) ---");
			const sortedFiles = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
			for (const [file, count] of sortedFiles) {
				console.log(`  ${String(count).padStart(3)} │ ${file}`);
			}

			console.log("\n--- By Namespace (descending) ---");
			const sortedNs = [...byNamespace.entries()].sort((a, b) => b[1] - a[1]);
			for (const [ns, count] of sortedNs) {
				console.log(`  ${String(count).padStart(3)} │ ${ns}`);
			}
			console.log("");
		}

		// Continue with normal boundary checks (non-audit violations)
		allViolations.length = 0;
		allViolations.push(...remaining);
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

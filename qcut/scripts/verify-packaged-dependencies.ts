#!/usr/bin/env bun
/**
 * Verifies that every production dependency (and the explicitly bundled
 * transitive packages) made it into the packaged app.asar.
 *
 * Bun's symlinked node_modules layout can make electron-builder's dependency
 * collector silently skip packages — v2026.08.13.1 through v2026.08.21.1
 * shipped without extract-zip and crashed on launch. Run this after every
 * `dist:*` build; exits non-zero when a package is missing.
 *
 * Usage:
 *   bun scripts/verify-packaged-dependencies.ts [path/to/app.asar]
 *   (default: newest app.asar under the dist output directories)
 */

import fs from "node:fs";
import path from "node:path";

/** Packages required beyond direct dependencies (bundled via build.files). */
const EXPLICITLY_BUNDLED = ["yauzl", "fd-slicer", "pend"];

function findDefaultAsar(): string | null {
	const roots = fs
		.readdirSync(".")
		.filter(
			(name) => name === "dist-electron" || name.startsWith("dist-packager")
		);
	const candidates: { file: string; mtime: number }[] = [];
	const visit = (dir: string, depth: number) => {
		if (depth > 6) return;
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) visit(full, depth + 1);
			else if (entry.name === "app.asar") {
				candidates.push({ file: full, mtime: fs.statSync(full).mtimeMs });
			}
		}
	};
	for (const root of roots) visit(root, 0);
	candidates.sort((a, b) => b.mtime - a.mtime);
	return candidates[0]?.file ?? null;
}

function readAsarPackageNames(asarPath: string): Set<string> {
	const fd = fs.openSync(asarPath, "r");
	try {
		const sizeBuffer = Buffer.alloc(16);
		fs.readSync(fd, sizeBuffer, 0, 16, 0);
		const headerSize = sizeBuffer.readUInt32LE(12);
		const headerBuffer = Buffer.alloc(headerSize);
		fs.readSync(fd, headerBuffer, 0, headerSize, 16);
		const json = headerBuffer.toString("utf8");
		const header = JSON.parse(json.slice(json.indexOf("{"))) as {
			files: Record<string, { files?: Record<string, { files?: object }> }>;
		};
		const nodeModules = header.files.node_modules?.files ?? {};
		const names = new Set<string>();
		for (const [name, entry] of Object.entries(nodeModules)) {
			if (name.startsWith("@")) {
				for (const scoped of Object.keys(entry.files ?? {})) {
					names.add(`${name}/${scoped}`);
				}
			} else {
				names.add(name);
			}
		}
		return names;
	} finally {
		fs.closeSync(fd);
	}
}

const asarPath = process.argv[2] ?? findDefaultAsar();
if (!asarPath || !fs.existsSync(asarPath)) {
	console.error("✗ No app.asar found — pass a path or run a dist build first.");
	process.exit(2);
}

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
	dependencies?: Record<string, string>;
};
const required = [
	...Object.keys(packageJson.dependencies ?? {}),
	...EXPLICITLY_BUNDLED,
];
const packaged = readAsarPackageNames(asarPath);
const missing = required.filter((name) => !packaged.has(name));

console.log(
	`Checked ${asarPath}: ${packaged.size} packages in asar, ${required.length} required.`
);
if (missing.length > 0) {
	console.error(
		`✗ Missing from app.asar (packaged app would crash or degrade):\n  ${missing.join("\n  ")}`
	);
	process.exit(1);
}
console.log("✓ All required packages present in app.asar.");

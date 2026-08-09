#!/usr/bin/env node

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const pluginRoot = resolve(dirname(scriptPath), "..");
const repositoryRoot = resolve(pluginRoot, "../..");

const REQUIRED_FILES = [
	".codex-plugin/plugin.json",
	"README.md",
	"PRIVACY.md",
	"TERMS.md",
	"assets/icon.png",
	"scripts/qcut-app.mjs",
	"scripts/qcut-release.mjs",
	"scripts/qcut-runner.mjs",
	"scripts/qcut-setup.mjs",
	"scripts/qcut-update.mjs",
];

function collectRegularFiles({ directory }) {
	const files = [];
	const entries = readdirSync(directory, { withFileTypes: true });

	for (const entry of entries) {
		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectRegularFiles({ directory: absolutePath }));
			continue;
		}

		if (!entry.isFile()) {
			throw new Error(`Submission archive cannot include ${absolutePath}`);
		}
		files.push(absolutePath);
	}

	return files;
}

export function collectSubmissionFiles({ root = pluginRoot } = {}) {
	const requiredFiles = REQUIRED_FILES.map((path) => resolve(root, path));
	const skillFiles = collectRegularFiles({
		directory: resolve(root, "skills"),
	});
	const absoluteFiles = [...requiredFiles, ...skillFiles];

	for (const absolutePath of absoluteFiles) {
		if (!existsSync(absolutePath)) {
			throw new Error(`Missing submission file: ${absolutePath}`);
		}
	}

	return absoluteFiles
		.map((absolutePath) => relative(root, absolutePath).split(sep).join("/"))
		.sort();
}

function optionValue({ args, name }) {
	const index = args.indexOf(name);
	if (index === -1) return null;
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${name} requires a path.`);
	}
	return value;
}

export function packageSubmission({ args = process.argv.slice(2) } = {}) {
	const manifest = JSON.parse(
		readFileSync(resolve(pluginRoot, ".codex-plugin/plugin.json"), "utf8")
	);
	const defaultOutput = resolve(
		repositoryRoot,
		".tmp/plugin-submission",
		`qcut-plugin-${manifest.version}.zip`
	);
	const outputPath = resolve(
		optionValue({ args, name: "--output" }) ?? defaultOutput
	);
	const files = collectSubmissionFiles();

	mkdirSync(dirname(outputPath), { recursive: true });
	if (existsSync(outputPath)) rmSync(outputPath);

	const result = spawnSync("zip", ["-q", "-X", outputPath, ...files], {
		cwd: pluginRoot,
		encoding: "utf8",
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || `zip exited with ${result.status}`);
	}

	return { outputPath, files };
}

async function main() {
	const result = await packageSubmission();
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (scriptPath === resolve(process.argv[1] ?? "")) {
	main().catch((error) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exitCode = 1;
	});
}

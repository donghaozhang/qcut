#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
	analyzeTrackingBundle,
	formatHumanReport,
} from "./tracking-probe-core.mjs";

const KNOWN_TRACKING_FILES = new Set(["desc.json", "data.json", "cache.json"]);

const HELP = `Standalone tracking sidecar probe

Usage:
  node tracking-probe.mjs [options] <bundle-dir|data.json|root-dir> [...]

Options:
  --json             Emit one machine-readable JSON document.
  --recursive        Search all descendant directories for data.json.
  --show-paths       Include resolved absolute input paths in sourceLabel.
  --fail-on-invalid  Exit 2 when any report contains an error-level issue.
  -h, --help         Show this help.

Behavior:
  A bundle directory may contain desc.json, data.json, and cache.json.
  A root directory is scanned one level deep unless --recursive is used.
  No Jianying installation, process, account, or default project path is used.
`;

function parseArguments({ argv }) {
	const options = {
		emitJson: false,
		recursive: false,
		showPaths: false,
		failOnInvalid: false,
		help: false,
		inputs: [],
	};
	let consumeAsInput = false;

	for (const argument of argv) {
		if (consumeAsInput) {
			options.inputs.push(argument);
			continue;
		}
		if (argument === "--") {
			consumeAsInput = true;
			continue;
		}
		if (argument === "--json") {
			options.emitJson = true;
			continue;
		}
		if (argument === "--recursive") {
			options.recursive = true;
			continue;
		}
		if (argument === "--show-paths") {
			options.showPaths = true;
			continue;
		}
		if (argument === "--fail-on-invalid") {
			options.failOnInvalid = true;
			continue;
		}
		if (argument === "-h" || argument === "--help") {
			options.help = true;
			continue;
		}
		if (argument.startsWith("-")) {
			throw new Error(`Unknown option: ${argument}`);
		}
		options.inputs.push(argument);
	}

	return options;
}

async function pathExists({ candidate }) {
	try {
		await stat(candidate);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function directoryContainsData({ directory }) {
	return pathExists({ candidate: path.join(directory, "data.json") });
}

async function discoverBundleDirectories({ rootDirectory, recursive }) {
	const resolvedRoot = path.resolve(rootDirectory);
	if (await directoryContainsData({ directory: resolvedRoot })) {
		return [resolvedRoot];
	}

	const inspectChildren = async (directory) => {
		const entries = await readdir(directory, { withFileTypes: true });
		const directories = entries
			.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
			.map((entry) => path.join(directory, entry.name));
		return Promise.all(
			directories.map(async (child) => ({
				child,
				containsData: await directoryContainsData({ directory: child }),
			}))
		);
	};

	const walk = async (directory) => {
		const children = await inspectChildren(directory);
		const directBundles = children
			.filter(({ containsData }) => containsData)
			.map(({ child }) => child);
		const nestedRoots = children
			.filter(({ containsData }) => !containsData)
			.map(({ child }) => child);
		const nestedBundles = await Promise.all(
			nestedRoots.map((child) => walk(child))
		);
		return [...directBundles, ...nestedBundles.flat()];
	};

	const immediateChildren = await inspectChildren(resolvedRoot);
	const immediateBundles = immediateChildren
		.filter(({ containsData }) => containsData)
		.map(({ child }) => child);
	if (!recursive) {
		return immediateBundles;
	}

	const nestedRoots = immediateChildren
		.filter(({ containsData }) => !containsData)
		.map(({ child }) => child);
	const nestedBundles = await Promise.all(
		nestedRoots.map((child) => walk(child))
	);
	return [...immediateBundles, ...nestedBundles.flat()];
}

async function resolveSingleInput({ input, recursive }) {
	const absolute = path.resolve(input);
	const inputStat = await stat(absolute);
	if (inputStat.isDirectory()) {
		const directories = await discoverBundleDirectories({
			rootDirectory: absolute,
			recursive,
		});
		if (directories.length === 0) {
			throw new Error(`No data.json found under directory: ${absolute}`);
		}
		return directories.map((directory) => ({
			kind: "bundle",
			path: directory,
		}));
	}

	if (!inputStat.isFile()) {
		throw new Error(`Input is neither a file nor a directory: ${absolute}`);
	}

	if (KNOWN_TRACKING_FILES.has(path.basename(absolute))) {
		const directory = path.dirname(absolute);
		if (!(await directoryContainsData({ directory }))) {
			throw new Error(`Bundle has no data.json: ${directory}`);
		}
		return [{ kind: "bundle", path: directory }];
	}

	return [{ kind: "data-file", path: absolute }];
}

async function resolveInputs({ inputs, recursive }) {
	const groups = await Promise.all(
		inputs.map((input) => resolveSingleInput({ input, recursive }))
	);
	const resolved = groups.flat();

	const deduplicated = new Map();
	for (const input of resolved) {
		deduplicated.set(`${input.kind}:${input.path}`, input);
	}
	return [...deduplicated.values()];
}

async function readJsonFile({ filePath, required }) {
	if (!(await pathExists({ candidate: filePath }))) {
		if (required) {
			throw new Error(`Required JSON file is missing: ${filePath}`);
		}
		return null;
	}

	let source;
	try {
		source = await readFile(filePath, "utf8");
	} catch (error) {
		throw new Error(`Cannot read ${filePath}: ${error.message}`, {
			cause: error,
		});
	}

	try {
		return JSON.parse(source);
	} catch (error) {
		throw new Error(`Invalid JSON in ${filePath}: ${error.message}`, {
			cause: error,
		});
	}
}

async function loadResolvedInput({ input }) {
	if (input.kind === "data-file") {
		return {
			inputPath: input.path,
			desc: null,
			data: await readJsonFile({ filePath: input.path, required: true }),
			cache: null,
		};
	}

	const [desc, data, cache] = await Promise.all([
		readJsonFile({
			filePath: path.join(input.path, "desc.json"),
			required: false,
		}),
		readJsonFile({
			filePath: path.join(input.path, "data.json"),
			required: true,
		}),
		readJsonFile({
			filePath: path.join(input.path, "cache.json"),
			required: false,
		}),
	]);
	return {
		inputPath: input.path,
		desc,
		data,
		cache,
	};
}

function buildSourceLabel({ inputPath, showPaths }) {
	return showPaths ? inputPath : path.basename(inputPath);
}

function summarizeReports({ reports }) {
	return {
		total: reports.length,
		valid: reports.filter((report) => report.outcome.valid).length,
		invalid: reports.filter((report) => !report.outcome.valid).length,
		planar: reports.filter((report) => report.classification.kind === "planar")
			.length,
		motion: reports.filter((report) => report.classification.kind === "motion")
			.length,
		unknown: reports.filter(
			(report) => report.classification.kind === "unknown"
		).length,
		errors: reports.reduce((total, report) => total + report.outcome.errors, 0),
		warnings: reports.reduce(
			(total, report) => total + report.outcome.warnings,
			0
		),
	};
}

export async function runCli({ argv }) {
	let options;
	try {
		options = parseArguments({ argv });
	} catch (error) {
		process.stderr.write(`${error.message}\n\n${HELP}`);
		return 1;
	}

	if (options.help) {
		process.stdout.write(HELP);
		return 0;
	}
	if (options.inputs.length === 0) {
		process.stderr.write(`At least one input path is required.\n\n${HELP}`);
		return 1;
	}

	try {
		const resolvedInputs = await resolveInputs(options);
		const loadedInputs = await Promise.all(
			resolvedInputs.map((input) => loadResolvedInput({ input }))
		);
		const reports = loadedInputs.map((loaded) =>
			analyzeTrackingBundle({
				desc: loaded.desc,
				data: loaded.data,
				cache: loaded.cache,
				sourceLabel: buildSourceLabel({
					inputPath: loaded.inputPath,
					showPaths: options.showPaths,
				}),
			})
		);

		const summary = summarizeReports({ reports });
		if (options.emitJson) {
			process.stdout.write(
				`${JSON.stringify({ probeVersion: 1, reports, summary }, null, 2)}\n`
			);
		} else {
			process.stdout.write(
				`${reports.map((report) => formatHumanReport({ report })).join("\n\n")}\n\n`
			);
			process.stdout.write(
				`Scanned ${summary.total}: ${summary.valid} valid, ${summary.invalid} invalid; ${summary.errors} errors, ${summary.warnings} warnings\n`
			);
		}

		return options.failOnInvalid && summary.invalid > 0 ? 2 : 0;
	} catch (error) {
		process.stderr.write(`tracking-probe: ${error.message}\n`);
		return 1;
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	process.exitCode = await runCli({ argv: process.argv.slice(2) });
}

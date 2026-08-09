#!/usr/bin/env bun

import path from "node:path";
import {
	diffDraftFiles,
	inspectDraftFile,
	inventoryDraftRoot,
} from "./draft-evidence";

interface CliOptions {
	afterPath?: string;
	beforePath?: string;
	command: "diff" | "inspect" | "inventory";
	filePath?: string;
	includePaths: boolean;
	rootPath?: string;
}

const DEFAULT_PROJECT_ROOT = path.join(
	process.env.HOME ?? "",
	"Movies/JianyingPro/User Data/Projects/com.lveditor.draft",
);

function usage(): string {
	return [
		"Usage:",
		"  inspect-draft.ts inventory [--root <directory>] [--include-paths]",
		"  inspect-draft.ts inspect --file <draft-file> [--include-paths]",
		"  inspect-draft.ts diff --before <draft-file> --after <draft-file> [--include-paths]",
	].join("\n");
}

function optionValues({
	allowedOptions,
	args,
}: {
	allowedOptions: ReadonlySet<string>;
	args: string[];
}): Map<string, string> {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--include-paths") continue;
		if (!argument?.startsWith("--")) {
			throw new Error(`Unexpected argument ${argument}.`);
		}
		if (!allowedOptions.has(argument)) {
			throw new Error(`Unknown option ${argument}.`);
		}
		const value = args[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${argument}.`);
		}
		if (values.has(argument)) throw new Error(`Duplicate option ${argument}.`);
		values.set(argument, value);
		index += 1;
	}
	return values;
}

function resolvedOption({
	name,
	values,
}: {
	name: string;
	values: Map<string, string>;
}): string | undefined {
	const value = values.get(name);
	return value ? path.resolve(value) : undefined;
}

export function parseDraftInspectionOptions({
	args,
}: {
	args: string[];
}): CliOptions {
	const command = args[0];
	if (
		!(["diff", "inspect", "inventory"] as const).includes(
			command as CliOptions["command"],
		)
	) {
		throw new Error(usage());
	}
	const allowedOptions = new Set(
		command === "inventory"
			? ["--root"]
			: command === "inspect"
				? ["--file"]
				: ["--before", "--after"]
	);
	const values = optionValues({ allowedOptions, args: args.slice(1) });
	const includePaths = args.includes("--include-paths");
	const options: CliOptions = {
		command: command as CliOptions["command"],
		includePaths,
	};
	if (options.command === "inventory") {
		return {
			...options,
			rootPath:
				resolvedOption({ name: "--root", values }) ?? DEFAULT_PROJECT_ROOT,
		};
	}
	if (options.command === "inspect") {
		const filePath = resolvedOption({ name: "--file", values });
		if (!filePath) throw new Error(`inspect requires --file.\n${usage()}`);
		return { ...options, filePath };
	}
	const beforePath = resolvedOption({ name: "--before", values });
	const afterPath = resolvedOption({ name: "--after", values });
	if (!(beforePath && afterPath)) {
		throw new Error(`diff requires --before and --after.\n${usage()}`);
	}
	return { ...options, afterPath, beforePath };
}

export function runDraftInspectionCli({ args }: { args: string[] }): unknown {
	const options = parseDraftInspectionOptions({ args });
	if (options.command === "inventory" && options.rootPath) {
		return inventoryDraftRoot({
			rootPath: options.rootPath,
			includePaths: options.includePaths,
		});
	}
	if (options.command === "inspect" && options.filePath) {
		return inspectDraftFile({
			filePath: options.filePath,
			includePath: options.includePaths,
		});
	}
	if (options.command === "diff" && options.beforePath && options.afterPath) {
		return diffDraftFiles({
			beforePath: options.beforePath,
			afterPath: options.afterPath,
			includePaths: options.includePaths,
		});
	}
	throw new Error(usage());
}

if (import.meta.main) {
	try {
		process.stdout.write(
			`${JSON.stringify(runDraftInspectionCli({ args: process.argv.slice(2) }), null, 2)}\n`,
		);
	} catch (error) {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	}
}

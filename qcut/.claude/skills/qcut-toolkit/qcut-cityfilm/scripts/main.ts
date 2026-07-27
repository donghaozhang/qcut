/**
 * qcut-cityfilm CLI dispatcher.
 *
 * Subcommands mirror the stages in SKILL.md that are mechanical enough to
 * automate: understanding a reference film, narrating a plan, mixing the
 * final audio bed, and proving the result.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAnalyze } from "./analyze";
import { type LevelWindow, measureLevels, runMix } from "./mix";
import type { CityFilmPlan } from "./types";
import { runVoBatch } from "./vo";

const USAGE = `qcut-cityfilm — reference-driven city film workflow

Usage:
  main.ts analyze <reference-video> [-o <dir>] [--frames N] [--scene-threshold N]
  main.ts vo --plan <plan.json> [--concurrency N] [--force] [--model <key>]
  main.ts mix --plan <plan.json> --video <export.mp4> --output <final.mp4>
  main.ts verify --video <final.mp4> [--windows "0:5,30:5,60:5"]

Options:
  -o, --output-dir <dir>   Where artifacts are written
      --frames <n>         Contact-sheet frames (must fill whole sheets)
      --scene-threshold <n> Scene-cut sensitivity (default 0.4)
      --plan <file>        CityFilmPlan JSON
      --video <file>       Picture exported from QCut
      --output <file>      Mixed deliverable
      --concurrency <n>    Parallel TTS jobs (default 4)
      --force              Re-render VO that already exists
      --json               Machine-readable result
  -h, --help               Show this help
`;

interface ParsedArgs {
	command: string;
	positional: string[];
	flags: Map<string, string | boolean>;
}

/** Splits argv into a command, positionals, and `--flag[=value]` pairs. */
export function parseArgs({ argv }: { argv: string[] }): ParsedArgs {
	// A leading flag (`--help`, `--json`) means no subcommand was given.
	const hasCommand = argv.length > 0 && !argv[0].startsWith("-");
	const command = hasCommand ? argv[0] : "";
	const rest = hasCommand ? argv.slice(1) : argv;
	const positional: string[] = [];
	const flags = new Map<string, string | boolean>();
	const aliases: Record<string, string> = {
		"-o": "output-dir",
		"-h": "help",
	};

	for (let index = 0; index < rest.length; index++) {
		const token = rest[index];
		if (!token.startsWith("-")) {
			positional.push(token);
			continue;
		}
		const normalized = aliases[token] ?? token.replace(/^--?/, "");
		const [name, inlineValue] = normalized.split("=");
		if (inlineValue !== undefined) {
			flags.set(name, inlineValue);
			continue;
		}
		const next = rest[index + 1];
		if (next === undefined || next.startsWith("-")) {
			flags.set(name, true);
			continue;
		}
		flags.set(name, next);
		index++;
	}

	return { command, positional, flags };
}

function requireFlag({
	flags,
	name,
}: {
	flags: Map<string, string | boolean>;
	name: string;
}): string {
	const value = flags.get(name);
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Missing --${name}`);
	}
	return value;
}

function optionalNumber({
	flags,
	name,
}: {
	flags: Map<string, string | boolean>;
	name: string;
}): number | undefined {
	const value = flags.get(name);
	if (typeof value !== "string") return;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`--${name} must be a number, received ${value}`);
	}
	return parsed;
}

function loadPlan({ file }: { file: string }): CityFilmPlan {
	const path = resolve(file);
	const plan = JSON.parse(readFileSync(path, "utf8")) as CityFilmPlan;
	if (!Array.isArray(plan.cues) || !Array.isArray(plan.shots)) {
		throw new Error(`${path} is not a CityFilmPlan (missing cues/shots)`);
	}
	return plan;
}

/** Parses `"start:length,start:length"` into labelled measurement windows. */
export function parseWindows({ value }: { value?: string }): LevelWindow[] {
	if (!value) {
		return [
			{ label: "open", startSeconds: 0, endSeconds: 5 },
			{ label: "mid", startSeconds: 30, endSeconds: 35 },
		];
	}
	return value.split(",").map((entry, index) => {
		const [start, length] = entry.split(":").map(Number);
		if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) {
			throw new Error(`Invalid window "${entry}", expected start:length`);
		}
		return {
			label: `w${index + 1}`,
			startSeconds: start,
			endSeconds: start + length,
		};
	});
}

function emit({ json, payload }: { json: boolean; payload: unknown }): void {
	if (json) {
		process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
		return;
	}
	process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
	const { command, positional, flags } = parseArgs({
		argv: process.argv.slice(2),
	});
	const json = flags.get("json") === true || flags.get("json") === "true";

	if (!command || flags.get("help") === true || command === "help") {
		process.stdout.write(USAGE);
		return;
	}

	if (command === "analyze") {
		const input = positional[0];
		if (!input) throw new Error("analyze needs a reference video path");
		const result = await runAnalyze({
			input: resolve(input),
			outputDir: (flags.get("output-dir") as string) || undefined,
			frames: optionalNumber({ flags, name: "frames" }),
			sceneThreshold: optionalNumber({ flags, name: "scene-threshold" }),
		});
		emit({ json, payload: result });
		return;
	}

	if (command === "vo") {
		const plan = loadPlan({ file: requireFlag({ flags, name: "plan" }) });
		const result = await runVoBatch({
			plan,
			concurrency: optionalNumber({ flags, name: "concurrency" }),
			force: flags.get("force") === true,
			model: (flags.get("model") as string) || undefined,
		});
		emit({
			json,
			payload: {
				generated: result.generated.length,
				skipped: result.skipped.length,
				failed: result.failed,
			},
		});
		if (result.failed.length > 0) process.exitCode = 1;
		return;
	}

	if (command === "mix") {
		const plan = loadPlan({ file: requireFlag({ flags, name: "plan" }) });
		const result = await runMix({
			plan,
			videoPath: resolve(requireFlag({ flags, name: "video" })),
			outputPath: resolve(requireFlag({ flags, name: "output" })),
		});
		emit({ json, payload: result });
		return;
	}

	if (command === "verify") {
		const file = resolve(requireFlag({ flags, name: "video" }));
		const levels = await measureLevels({
			file,
			windows: parseWindows({ value: flags.get("windows") as string }),
		});
		emit({ json, payload: { file, levels } });
		return;
	}

	throw new Error(`Unknown command "${command}"\n\n${USAGE}`);
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exitCode = 1;
	});
}

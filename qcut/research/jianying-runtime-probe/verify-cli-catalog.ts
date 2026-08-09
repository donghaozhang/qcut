#!/usr/bin/env bun

import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { JIANYING_TRANSITIONS } from "../../electron/jianying-transition-catalog";

const projectRoot = path.resolve(import.meta.dir, "../..");
const cliEntry = path.join(projectRoot, "electron/native-pipeline/cli/cli.ts");

interface VerificationOptions {
	inputA: string;
	inputB: string;
	outputDirectory: string;
	duration: number;
	fps: number;
	width: number;
	height: number;
}

interface ProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface TransitionVerification {
	id: string;
	name: string;
	group: string;
	outputPath: string;
	passed: boolean;
	error?: string;
}

function requireString({
	value,
	flag,
}: {
	value: string | undefined;
	flag: string;
}): string {
	const trimmed = value?.trim();
	if (!trimmed) throw new Error(`${flag} is required.`);
	return path.resolve(trimmed);
}

function positiveNumber({
	value,
	fallback,
	flag,
}: {
	value: string | undefined;
	fallback: number;
	flag: string;
}): number {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive number.`);
	}
	return parsed;
}

function parseOptions(): VerificationOptions {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			"input-a": { type: "string" },
			"input-b": { type: "string" },
			"output-dir": { type: "string" },
			duration: { type: "string" },
			fps: { type: "string" },
			width: { type: "string" },
			height: { type: "string" },
		},
		strict: true,
	});
	return {
		inputA: requireString({ value: values["input-a"], flag: "--input-a" }),
		inputB: requireString({ value: values["input-b"], flag: "--input-b" }),
		outputDirectory: path.resolve(
			values["output-dir"] ??
				path.join(
					projectRoot,
					".local/jianying-runtime/category-five/cli-verification"
				)
		),
		duration: positiveNumber({
			value: values.duration,
			fallback: 0.5,
			flag: "--duration",
		}),
		fps: positiveNumber({ value: values.fps, fallback: 6, flag: "--fps" }),
		width: positiveNumber({
			value: values.width,
			fallback: 64,
			flag: "--width",
		}),
		height: positiveNumber({
			value: values.height,
			fallback: 64,
			flag: "--height",
		}),
	};
}

async function runProcess({
	command,
	args,
}: {
	command: string;
	args: string[];
}): Promise<ProcessResult> {
	const child = Bun.spawn([command, ...args], {
		cwd: projectRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

async function requireReadableFile({ filePath }: { filePath: string }) {
	await access(filePath, constants.R_OK);
}

async function requireIgnoredOutput({
	outputDirectory,
}: {
	outputDirectory: string;
}) {
	await mkdir(outputDirectory, { recursive: true });
	const check = await runProcess({
		command: "git",
		args: ["check-ignore", "--quiet", "--", outputDirectory],
	});
	if (check.exitCode !== 0) {
		throw new Error(`Verification output must be ignored: ${outputDirectory}`);
	}
}

function lastOutputLines({ result }: { result: ProcessResult }): string {
	return `${result.stderr}\n${result.stdout}`
		.trim()
		.split("\n")
		.slice(-8)
		.join(" | ");
}

async function validateVideo({
	outputPath,
	width,
	height,
}: {
	outputPath: string;
	width: number;
	height: number;
}) {
	const metadataResult = await runProcess({
		command: "ffprobe",
		args: [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=codec_name,width,height,nb_frames:format=duration",
			"-of",
			"json",
			outputPath,
		],
	});
	if (metadataResult.exitCode !== 0) {
		throw new Error(lastOutputLines({ result: metadataResult }));
	}
	const metadata = JSON.parse(metadataResult.stdout) as {
		streams?: Array<{
			codec_name?: string;
			width?: number;
			height?: number;
			nb_frames?: string;
		}>;
		format?: { duration?: string };
	};
	const stream = metadata.streams?.[0];
	if (
		stream?.codec_name !== "h264" ||
		stream.width !== width ||
		stream.height !== height ||
		Number(stream.nb_frames ?? 0) <= 0 ||
		Number(metadata.format?.duration ?? 0) <= 0
	) {
		throw new Error(`Invalid rendered video metadata: ${outputPath}`);
	}

	const signalResult = await runProcess({
		command: "ffmpeg",
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			outputPath,
			"-vf",
			"signalstats,metadata=print:file=-",
			"-an",
			"-f",
			"null",
			"-",
		],
	});
	if (signalResult.exitCode !== 0) {
		throw new Error(lastOutputLines({ result: signalResult }));
	}
	const lumaValues = Array.from(
		signalResult.stdout.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g),
		(match) => Number(match[1])
	);
	if (lumaValues.length === 0 || Math.max(...lumaValues) <= 1) {
		throw new Error(`Rendered video is empty or black: ${outputPath}`);
	}
}

async function verifyTransition({
	transition,
	options,
}: {
	transition: (typeof JIANYING_TRANSITIONS)[number];
	options: VerificationOptions;
}): Promise<TransitionVerification> {
	const outputPath = path.join(options.outputDirectory, `${transition.id}.mp4`);
	const result = await runProcess({
		command: process.execPath,
		args: [
			"run",
			cliEntry,
			"transition",
			"render",
			"--preset",
			transition.id,
			"--input-a",
			options.inputA,
			"--input-b",
			options.inputB,
			"--output",
			outputPath,
			"--duration",
			String(options.duration),
			"--fps",
			String(options.fps),
			"--width",
			String(options.width),
			"--height",
			String(options.height),
			"--force",
			"--json",
		],
	});
	if (result.exitCode !== 0) {
		return {
			id: transition.id,
			name: transition.localizedName,
			group: transition.group,
			outputPath,
			passed: false,
			error: lastOutputLines({ result }),
		};
	}
	try {
		await validateVideo({
			outputPath,
			width: options.width,
			height: options.height,
		});
		return {
			id: transition.id,
			name: transition.localizedName,
			group: transition.group,
			outputPath,
			passed: true,
		};
	} catch (cause) {
		return {
			id: transition.id,
			name: transition.localizedName,
			group: transition.group,
			outputPath,
			passed: false,
			error: cause instanceof Error ? cause.message : String(cause),
		};
	}
}

async function verifyCatalog({
	transitions,
	index,
	options,
	results,
}: {
	transitions: typeof JIANYING_TRANSITIONS;
	index: number;
	options: VerificationOptions;
	results: TransitionVerification[];
}): Promise<TransitionVerification[]> {
	const transition = transitions[index];
	if (!transition) return results;
	const result = await verifyTransition({ transition, options });
	console.log(
		`${result.passed ? "PASS" : "FAIL"} ${index + 1}/${transitions.length} ${transition.localizedName}`
	);
	return verifyCatalog({
		transitions,
		index: index + 1,
		options,
		results: [...results, result],
	});
}

async function run() {
	const options = parseOptions();
	await Promise.all([
		requireReadableFile({ filePath: options.inputA }),
		requireReadableFile({ filePath: options.inputB }),
		requireIgnoredOutput({ outputDirectory: options.outputDirectory }),
	]);
	const transitions = JIANYING_TRANSITIONS.filter(
		(transition) => transition.runtimeKind === "transition-segment"
	);
	const skipped = JIANYING_TRANSITIONS.filter(
		(transition) => transition.runtimeKind === "ai-generation"
	).map((transition) => transition.id);
	const results = await verifyCatalog({
		transitions,
		index: 0,
		options,
		results: [],
	});
	const failures = results.filter((result) => !result.passed);
	const report = {
		schemaVersion: 1,
		attempted: results.length,
		passed: results.length - failures.length,
		failed: failures.length,
		skippedAiGeneration: skipped,
		options,
		results,
	};
	const reportPath = path.join(options.outputDirectory, "verification.json");
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(
		JSON.stringify({ ...report, results: undefined, reportPath }, null, 2)
	);
	if (failures.length > 0) process.exitCode = 1;
}

await run();

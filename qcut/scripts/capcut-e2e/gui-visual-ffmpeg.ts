import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getBundledTargetKey, resolveBundledToolPath } from "./runtime.js";
import type { CapCutGuiVisualToolReport } from "./gui-visual-evidence-contract.js";
import { describeVisualFile } from "./visual-files.js";

const execFileAsync = promisify(execFile);
const MAXIMUM_OUTPUT_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MILLISECONDS = 120_000;

export async function runGuiVisualFfmpeg({
	args,
	ffmpegPath,
}: {
	args: readonly string[];
	ffmpegPath: string;
}) {
	await execFileAsync(ffmpegPath, [...args], {
		maxBuffer: MAXIMUM_OUTPUT_BYTES,
		timeout: TIMEOUT_MILLISECONDS,
	});
}

export async function runGuiVisualFfprobe({
	args,
	ffprobePath,
}: {
	args: readonly string[];
	ffprobePath: string;
}): Promise<string> {
	const { stdout } = await execFileAsync(ffprobePath, [...args], {
		maxBuffer: MAXIMUM_OUTPUT_BYTES,
		timeout: TIMEOUT_MILLISECONDS,
	});
	return stdout;
}

async function resolveGuiVisualTool({
	projectRoot,
	tool,
}: {
	projectRoot: string;
	tool: "ffmpeg" | "ffprobe";
}): Promise<{ path: string; report: CapCutGuiVisualToolReport }> {
	const path = await resolveBundledToolPath({
		projectRoot,
		targetKey: getBundledTargetKey(),
		tool,
	});
	const { stderr, stdout } = await execFileAsync(path, ["-version"], {
		maxBuffer: MAXIMUM_OUTPUT_BYTES,
		timeout: TIMEOUT_MILLISECONDS,
	});
	const banner = `${stdout}\n${stderr}`
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.find(Boolean);
	const versionPattern = new RegExp(
		`^${tool} version n?8\\.1\\.2(?:[-+\\s]|$)`,
		"iu"
	);
	if (!banner || !versionPattern.test(banner)) {
		throw new Error(
			`GUI visual extraction requires bundled ${tool} 8.1.2; received ${banner ?? "an empty banner"}.`
		);
	}
	return {
		path,
		report: {
			banner,
			binary: await describeVisualFile({ path }),
			path,
			version: "8.1.2",
		},
	};
}

export async function resolveGuiVisualFfmpeg({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<{ path: string; report: CapCutGuiVisualToolReport }> {
	return resolveGuiVisualTool({ projectRoot, tool: "ffmpeg" });
}

export async function resolveGuiVisualFfprobe({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<{ path: string; report: CapCutGuiVisualToolReport }> {
	return resolveGuiVisualTool({ projectRoot, tool: "ffprobe" });
}

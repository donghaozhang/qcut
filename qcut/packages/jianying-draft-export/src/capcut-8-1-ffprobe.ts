import { execFile } from "node:child_process";
import { promisify } from "node:util";

const MAX_VERSION_OUTPUT_BYTES = 64 * 1024;
const VERSION_TIMEOUT_MILLISECONDS = 15_000;
const execFileAsync = promisify(execFile);

export interface CapCut81FfprobeVersion {
	banner: string;
	major: 8;
	version: string;
}

function getErrorMessage({ value }: { value: unknown }): string {
	return value instanceof Error ? value.message : String(value);
}

export async function requireCapCut81Ffprobe({
	ffprobePath,
}: {
	ffprobePath: string;
}): Promise<CapCut81FfprobeVersion> {
	if (ffprobePath.trim().length === 0) {
		throw new Error("CapCut 8.1 migration requires a trusted FFprobe path.");
	}
	let stdout: string;
	try {
		const result = await execFileAsync(ffprobePath, ["-version"], {
			encoding: "utf8",
			maxBuffer: MAX_VERSION_OUTPUT_BYTES,
			timeout: VERSION_TIMEOUT_MILLISECONDS,
		});
		stdout = String(result.stdout);
	} catch (error) {
		throw new Error(
			`Unable to verify FFprobe 8 for CapCut migration: ${getErrorMessage({
				value: error,
			})}`
		);
	}
	const banner = stdout.split(/\r?\n/, 1)[0]?.trim() ?? "";
	const match = /^ffprobe version\s+([0-9]+)(?:\.([^\s]+))?/i.exec(banner);
	const major = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
	if (major !== 8) {
		throw new Error(
			`CapCut 8.1 migration requires FFprobe major 8; received ${banner || "an unrecognized version banner"}.`
		);
	}
	const version = match?.[2] ? `8.${match[2]}` : "8";
	return {
		banner,
		major: 8,
		version,
	};
}

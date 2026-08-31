import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { deflickerWithJianyingRuntime } from "../../jianying-basic-video-runtime/runtime.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

const resultProvider = "jianying-private-cache";

function defaultOutputPath({ inputPath }: { inputPath: string }) {
	const extension = extname(inputPath);
	const stem = basename(inputPath, extension);
	return resolve(dirname(inputPath), `${stem}-deflicker.mp4`);
}

function validateStrength({ value }: { value: number | undefined }) {
	const strength = value ?? 70;
	if (!Number.isInteger(strength) || strength < 1 || strength > 100) {
		throw new Error("--strength must be an integer from 1 to 100");
	}
	return strength;
}

async function pathExists({ filePath }: { filePath: string }) {
	try {
		await stat(filePath);
		return true;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

async function publishOutput({
	cachePath,
	force,
	outputPath,
}: {
	cachePath: string;
	force: boolean;
	outputPath: string;
}) {
	if (resolve(cachePath) === resolve(outputPath)) return;
	const outputExists = await pathExists({ filePath: outputPath });
	if (outputExists && !force)
		throw new Error(`Output already exists: ${outputPath}`);
	await mkdir(dirname(outputPath), { recursive: true });
	const temporaryPath = `${outputPath}.${process.pid}.partial.mp4`;
	try {
		await copyFile(cachePath, temporaryPath);
		await rm(outputPath, { force: true });
		await rename(temporaryPath, outputPath);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}

export async function handleVideoLabDeflicker(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		if (!options.input) throw new Error("--input is required");
		const sourcePath = resolve(options.input);
		const outputPath = options.output
			? resolve(options.output)
			: defaultOutputPath({ inputPath: sourcePath });
		if (sourcePath === outputPath) {
			throw new Error("Output must not overwrite the source video");
		}
		const strength = validateStrength({ value: options.strength });
		if ((await pathExists({ filePath: outputPath })) && !options.force) {
			throw new Error(`Output already exists: ${outputPath}`);
		}
		const result = await deflickerWithJianyingRuntime({
			request: {
				sourcePath,
				strength,
				taskId: options.commandId ?? `cli-deflicker-${Date.now()}`,
			},
			signal,
			onProgress: ({ progress, stage, status }) => {
				onProgress({
					message: status,
					model: resultProvider,
					percent: progress,
					stage,
				});
			},
		});
		await publishOutput({
			cachePath: result.outputPath,
			force: options.force ?? false,
			outputPath,
		});
		return {
			data: {
				cache_hit: result.cacheHit,
				fps: result.fps,
				frame_count: result.frameCount,
				has_audio: result.hasAudio,
				height: result.height,
				provider: result.provider,
				route: result.route,
				strength: result.strength,
				width: result.width,
			},
			duration: (Date.now() - startedAt) / 1000,
			outputPath,
			outputPaths: [outputPath],
			success: true,
		};
	} catch (error) {
		return {
			duration: (Date.now() - startedAt) / 1000,
			error: error instanceof Error ? error.message : String(error),
			success: false,
		};
	}
}

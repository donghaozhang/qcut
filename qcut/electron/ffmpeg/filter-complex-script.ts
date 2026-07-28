import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeTemporaryDirectory } from "./temporary-files.js";

export interface PreparedFFmpegFilterScripts {
	args: string[];
	scriptPaths: string[];
	cleanup: () => Promise<boolean>;
}

const MAX_INLINE_FFMPEG_ARGUMENT_CODE_UNITS = 16_000;

function retryableDirectoryCleanup({
	directory,
}: {
	directory: string;
}): () => Promise<boolean> {
	let cleanupPromise: Promise<boolean> | undefined;
	return () => {
		if (cleanupPromise) return cleanupPromise;
		cleanupPromise = removeTemporaryDirectory({ directory });
		cleanupPromise.then((removed) => {
			if (!removed) cleanupPromise = undefined;
		});
		return cleanupPromise;
	};
}

export function prepareFFmpegFilterComplexScripts({
	args,
	temporaryDirectory = os.tmpdir(),
	commandLengthThreshold = MAX_INLINE_FFMPEG_ARGUMENT_CODE_UNITS,
}: {
	args: readonly string[];
	temporaryDirectory?: string;
	commandLengthThreshold?: number;
}): PreparedFFmpegFilterScripts {
	let filterCount = 0;
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] !== "-filter_complex") continue;
		filterCount += 1;
		if (typeof args[index + 1] !== "string") {
			throw new Error("FFmpeg filter_complex is missing its graph");
		}
		index += 1;
	}
	const estimatedCommandCodeUnits = args.reduce(
		(total, argument) => total + argument.length + 3,
		0
	);
	if (filterCount === 0) {
		return {
			args: [...args],
			scriptPaths: [],
			cleanup: async () => true,
		};
	}
	if (estimatedCommandCodeUnits <= commandLengthThreshold) {
		return {
			args: [...args],
			scriptPaths: [],
			cleanup: async () => true,
		};
	}

	const directory = fs.mkdtempSync(
		path.join(temporaryDirectory, "qcut-ffmpeg-filter-")
	);
	const scriptPaths: string[] = [];
	const cleanup = retryableDirectoryCleanup({ directory });

	try {
		const preparedArgs: string[] = [];
		for (let index = 0; index < args.length; index += 1) {
			const argument = args[index];
			if (argument !== "-filter_complex") {
				preparedArgs.push(argument);
				continue;
			}
			const filterGraph = args[index + 1];
			if (typeof filterGraph !== "string") {
				throw new Error("FFmpeg filter_complex is missing its graph");
			}
			const scriptPath = path.join(
				directory,
				`graph-${scriptPaths.length}-${randomUUID()}.ffscript`
			);
			fs.writeFileSync(scriptPath, filterGraph, {
				encoding: "utf8",
				mode: 0o600,
			});
			scriptPaths.push(scriptPath);
			preparedArgs.push("-filter_complex_script", scriptPath);
			index += 1;
		}
		return { args: preparedArgs, scriptPaths, cleanup };
	} catch (error) {
		void cleanup();
		throw error;
	}
}

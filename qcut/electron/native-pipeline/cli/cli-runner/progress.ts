/**
 * Progress reporting utilities.
 * @module electron/native-pipeline/cli/cli-runner/progress
 */

import type { ProgressFn } from "./types.js";

export function guessExtFromCommand(command: string): string {
	switch (command) {
		case "generate-image":
			return ".png";
		case "create-video":
		case "generate-avatar":
			return ".mp4";
		case "generate-speech":
		case "convert-speech":
			return ".wav";
		default:
			return ".bin";
	}
}

export function createProgressReporter(options: {
	json: boolean;
	quiet: boolean;
}): ProgressFn {
	const isTTY = process.stdout.isTTY;

	return (progress) => {
		if (options.quiet) return;
		if (options.json) return;

		if (isTTY) {
			const bar = renderProgressBar(progress.percent, 30);
			process.stdout.write(`\r${bar} ${progress.message}`);
			if (progress.stage === "complete") {
				process.stdout.write("\n");
			}
		} else {
			console.error(JSON.stringify({ type: "progress", ...progress }));
		}
	};
}

export function renderProgressBar(percent: number, width: number): string {
	const filled = Math.round((percent / 100) * width);
	const empty = width - filled;
	return `[${"=".repeat(filled)}${" ".repeat(empty)}] ${String(percent).padStart(3)}%`;
}

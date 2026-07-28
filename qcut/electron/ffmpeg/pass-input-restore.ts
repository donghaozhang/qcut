import fs from "node:fs";

export function completeFFmpegPassOutput({
	temporaryInput,
	outputFile,
}: {
	temporaryInput: string;
	outputFile: string;
}): void {
	let outputStats: fs.Stats;
	try {
		outputStats = fs.statSync(outputFile);
	} catch {
		throw new Error(`FFmpeg pass output was not created: ${outputFile}`);
	}
	if (!outputStats.isFile() || outputStats.size === 0) {
		throw new Error(
			`FFmpeg pass output is not a non-empty file: ${outputFile}`
		);
	}

	try {
		fs.unlinkSync(temporaryInput);
	} catch {
		// output is committed; cleanup failure must not restore over it
	}
}

export function restoreFFmpegPassInput({
	temporaryInput,
	outputFile,
}: {
	temporaryInput: string;
	outputFile: string;
}): void {
	if (!fs.existsSync(temporaryInput)) {
		throw new Error(`FFmpeg pass input is missing: ${temporaryInput}`);
	}
	fs.renameSync(temporaryInput, outputFile);
}

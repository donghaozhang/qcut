const MAX_DIAGNOSTIC_LINES = 12;
const MAX_DIAGNOSTIC_CHARACTERS = 4_000;

export function formatFFmpegFailure({
	code,
	stderr,
}: {
	code: number | null;
	stderr: string;
}): string {
	const lines = stderr
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter(Boolean)
		.slice(-MAX_DIAGNOSTIC_LINES);
	const diagnostic = lines.join("\n").slice(-MAX_DIAGNOSTIC_CHARACTERS);
	if (!diagnostic) return `FFmpeg exited with code ${code}`;
	return `FFmpeg exited with code ${code}:\n${diagnostic}`;
}

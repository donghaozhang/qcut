import fs from "fs";

export function removeTemporaryDirectory({
	directory,
}: {
	directory: string;
}): void {
	try {
		fs.rmSync(directory, { recursive: true, force: true });
	} catch {
		fs.rm(
			directory,
			{ recursive: true, force: true, maxRetries: 5, retryDelay: 100 },
			() => undefined
		);
	}
}

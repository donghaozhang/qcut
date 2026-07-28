import fs from "fs";

const IMMEDIATE_REMOVAL_OPTIONS = {
	recursive: true,
	force: true,
} as const;

const ASYNC_REMOVAL_OPTIONS = {
	...IMMEDIATE_REMOVAL_OPTIONS,
	maxRetries: 5,
	retryDelay: 100,
} as const;

export async function removeTemporaryDirectory({
	directory,
}: {
	directory: string;
}): Promise<boolean> {
	try {
		fs.rmSync(directory, IMMEDIATE_REMOVAL_OPTIONS);
		return true;
	} catch (syncError) {
		return new Promise((resolve) => {
			fs.rm(directory, ASYNC_REMOVAL_OPTIONS, (error) => {
				if (!error) {
					resolve(true);
					return;
				}
				console.warn("[FFmpeg] Temporary directory cleanup failed", {
					directory,
					syncError,
					error,
				});
				resolve(false);
			});
		});
	}
}

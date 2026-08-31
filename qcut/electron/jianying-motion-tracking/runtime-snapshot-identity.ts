import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

const STAT_CONCURRENCY = 8;

export async function runtimeSnapshotIdentity({
	relativePaths,
	snapshotPath,
}: {
	relativePaths: string[];
	snapshotPath: string;
}) {
	const resolvedRoot = await realpath(snapshotPath);
	const entries = await mapWithConcurrency({
		items: ["manifest.json", ...relativePaths],
		limit: STAT_CONCURRENCY,
		task: async ({ item: relativePath }) => {
			const metadata = await stat(path.join(resolvedRoot, relativePath), {
				bigint: true,
			});
			if (!metadata.isFile()) {
				throw new Error(`Private runtime entry is not a file: ${relativePath}`);
			}
			return [
				relativePath,
				metadata.dev,
				metadata.ino,
				metadata.mode,
				metadata.size,
				metadata.mtimeNs,
				metadata.ctimeNs,
			].join("\0");
		},
	});
	return createHash("sha256")
		.update(resolvedRoot)
		.update("\0")
		.update(entries.join("\n"))
		.digest("hex");
}

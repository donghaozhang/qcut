import { readdir } from "node:fs/promises";
import path from "node:path";

export async function listJianyingResourceDatabasePaths({
	databaseRoot,
}: {
	databaseRoot: string;
}) {
	const entries = await readdir(databaseRoot, { withFileTypes: true }).catch(
		() => []
	);
	return entries
		.sort((left, right) => left.name.localeCompare(right.name))
		.flatMap((entry) => {
			if (entry.isFile() && entry.name === "rp_master.db") {
				return [path.join(databaseRoot, entry.name)];
			}
			return entry.isDirectory()
				? [path.join(databaseRoot, entry.name, "rp.db")]
				: [];
		});
}

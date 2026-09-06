import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
	backupCoverCatalog,
	cacheJianyingCovers,
	coverCacheRoot,
	coverEntryFiles,
	readCoverCatalog,
	verifyCoverCatalog,
} from "../electron/jianying-cover-private-cache";

const { values } = parseArgs({
	options: {
		observations: { type: "string" },
		source: { type: "string" },
		destination: { type: "string" },
		backup: { type: "string" },
		verify: { type: "boolean", default: false },
	},
});
const root = values.destination ?? coverCacheRoot();
if (values.verify) {
	const catalog = await readCoverCatalog({ root });
	if (!catalog) throw new Error("No QCut cover catalog to verify");
	await verifyCoverCatalog({ root, catalog });
} else {
	if (!values.observations)
		throw new Error(
			"--observations is required; categories must be observed, not inferred"
		);
	await cacheJianyingCovers({
		sourceRoot:
			values.source ??
			path.join(homedir(), "Movies/JianyingPro/User Data/Cache"),
		destination: root,
		observations: JSON.parse(await readFile(values.observations, "utf8")),
	});
}
if (values.backup)
	await backupCoverCatalog({ root, destination: values.backup });
const catalog = await readCoverCatalog({ root });
const entries = catalog?.entries ?? [];
const files = new Map(
	entries
		.flatMap((entry) => coverEntryFiles({ entry }))
		.map((file) => [file.path, file])
);
console.log(
	JSON.stringify(
		{
			root,
			backup: values.backup,
			templates: entries.length,
			complete: entries.filter((entry) => entry.cacheStatus === "complete")
				.length,
			files: files.size,
			bytes: [...files.values()].reduce((sum, file) => sum + file.bytes, 0),
			coverage: catalog?.coverage,
			missing: entries.flatMap((entry) =>
				entry.dependencies
					.filter((dependency) => dependency.status !== "cached")
					.map((dependency) => ({ template: entry.title, ...dependency }))
			),
		},
		null,
		2
	)
);

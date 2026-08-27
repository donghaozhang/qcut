import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { z } from "zod";
import { findAudioRecords } from "../.agents/skills/qcut-toolkit/jianying-audio-reference/scripts/inspect-audio-cache";
import { enrichSourceMap } from "./sound-effects-lab-jianying-metadata";

const sourceResourceSchema = z
	.object({
		resourceId: z.string().regex(/^\d{16,20}$/),
		contentMd5: z.string().regex(/^[a-f0-9]{32}$/),
		mappingStrategy: z.string(),
		source: z.unknown().optional(),
	})
	.passthrough();

const sourceMapSchema = z
	.object({
		schemaVersion: z.literal(1),
		generatedAt: z.string().datetime(),
		summary: z.record(z.string(), z.number()),
		resources: z.array(sourceResourceSchema).min(1),
	})
	.passthrough();

function databasePaths({ cacheRoot }: { cacheRoot: string }): string[] {
	const root = join(cacheRoot, "ressdk_db");
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(root, entry.name, "rp.db"))
		.filter((filePath) => existsSync(filePath))
		.sort();
}

function run(): void {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			input: { type: "string" },
			output: { type: "string" },
			report: { type: "string" },
			"cache-root": { type: "string" },
		},
		strict: true,
	});
	if (!(values.input && values.output)) {
		throw new Error(
			"Usage: bun scripts/enrich-sound-effects-lab-jianying-metadata.ts --input <combined-map.json> --output <enriched-map.json> [--report <report.json>] [--cache-root <Jianying Cache>]"
		);
	}
	const cacheRoot = resolve(
		values["cache-root"] ??
			join(homedir(), "Movies/JianyingPro/User Data/Cache")
	);
	const databases = databasePaths({ cacheRoot });
	if (databases.length === 0) {
		throw new Error(`No Jianying resource databases found under ${cacheRoot}`);
	}
	const source = sourceMapSchema.parse(
		JSON.parse(readFileSync(resolve(values.input), "utf8"))
	);
	const result = enrichSourceMap({
		records: findAudioRecords({ databasePaths: databases }),
		source,
	});
	const outputPath = resolve(values.output);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(result.source, null, 2)}\n`);
	if (values.report) {
		const reportPath = resolve(values.report);
		mkdirSync(dirname(reportPath), { recursive: true });
		writeFileSync(
			reportPath,
			`${JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					cacheRoot,
					databaseCount: databases.length,
					...result.summary,
					unmatchedResourceIds: result.unmatchedResourceIds,
				},
				null,
				2
			)}\n`
		);
	}
	process.stdout.write(
		`${JSON.stringify(
			{
				outputPath,
				...result.summary,
				unmatchedResourceIds: result.unmatchedResourceIds,
			},
			null,
			2
		)}\n`
	);
}

if (import.meta.main) run();

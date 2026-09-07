import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	readFile,
	realpath,
	rename,
	statfs,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
	coverVerificationSchema,
	mergeCoverObservations,
	planCoverCollectionBatches,
	summarizeCoverCollection,
	type CoverVerification,
} from "../electron/jianying-cover-collection";
import {
	backupCoverCatalog,
	cacheJianyingCovers,
	coverCacheRoot,
	readCoverCatalog,
	verifyCoverCatalog,
} from "../electron/jianying-cover-private-cache";
import { preparePrivateCoverTextLayout } from "../electron/jianying-cover-prepare-layout";
import { createCoverDependencyResolver } from "../electron/jianying-cover-dependency-recovery";

const { values } = parseArgs({
	options: {
		observations: { type: "string" },
		destination: { type: "string" },
		source: { type: "string" },
		backup: { type: "string" },
		verification: { type: "string" },
		"evidence-root": { type: "string" },
		"batch-size": { type: "string", default: "5" },
		"audit-only": { type: "boolean", default: false },
		"retry-missing": { type: "boolean", default: false },
		recover: { type: "boolean", default: false },
		"application-resources": { type: "string" },
	},
});
if (!values.backup)
	throw new Error("--backup is required for every collection run");
const rootPath = path.resolve(values.destination ?? coverCacheRoot());
const backupPath = path.resolve(values.backup);
const sourceRoot = path.resolve(
	values.source ?? path.join(homedir(), "Movies/JianyingPro/User Data/Cache")
);
const batchSize = Number(values["batch-size"]);
planCoverCollectionBatches({ observations: [], batchSize });

async function jsonFile({
	filename,
	fallback,
}: {
	filename: string;
	fallback?: unknown;
}): Promise<unknown> {
	try {
		const handle = await open(
			filename,
			constants.O_RDONLY | constants.O_NOFOLLOW
		);
		try {
			const info = await handle.stat();
			if (!info.isFile() || info.size > 10_000_000)
				throw new Error("Invalid or oversized collection metadata");
			return JSON.parse(await handle.readFile("utf8"));
		} finally {
			await handle.close();
		}
	} catch (error) {
		if (
			(error as NodeJS.ErrnoException).code === "ENOENT" &&
			fallback !== undefined
		)
			return fallback;
		throw error;
	}
}

async function publishBytes({
	filename,
	bytes,
}: {
	filename: string;
	bytes: Buffer;
}) {
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes, {
			flag: "wx",
			mode: 0o600,
		});
		await rename(temporary, filename);
	} finally {
		await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
}

function publish({ filename, value }: { filename: string; value: unknown }) {
	return publishBytes({
		filename,
		bytes: Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
	});
}

async function checkedRoot({ directory }: { directory: string }) {
	await mkdir(directory, { recursive: true });
	if ((await lstat(directory)).isSymbolicLink())
		throw new Error("Collection roots cannot use symlinks");
	return realpath(directory);
}
const root = await checkedRoot({ directory: rootPath });
const backup = await checkedRoot({ directory: backupPath });
const canonicalSource = values["audit-only"]
	? sourceRoot
	: await realpath(sourceRoot);
const roots = [root, backup, canonicalSource];
for (const [index, directory] of roots.entries()) {
	if (
		roots.some(
			(other, otherIndex) =>
				otherIndex !== index &&
				(directory === other || directory.startsWith(`${other}${path.sep}`))
		)
	) {
		throw new Error(
			"Source, owned cache and backup must be separate non-nested roots"
		);
	}
}
async function checkSpace() {
	await [root, backup].reduce(async (previous, directory) => {
		await previous;
		const info = await statfs(directory);
		if (info.bavail * info.bsize < 5_000_000_000)
			throw new Error(`Less than 5 GB free at ${directory}`);
	}, Promise.resolve());
}
await checkSpace();
const lockPath = path.join(root, ".collection.lock");
const lock = await open(lockPath, "wx", 0o600);
const runId = randomUUID();
const startedAt = new Date().toISOString();
const progress: {
	category: string;
	packageHashes: string[];
	status: string;
	error?: string;
}[] = [];
try {
	await lock.writeFile(JSON.stringify({ runId, pid: process.pid, startedAt }));
	const oldCatalog = await readCoverCatalog({ root });
	if (oldCatalog) await verifyCoverCatalog({ root, catalog: oldCatalog });
	const stored = await jsonFile({
		filename: path.join(root, "collection-observations.json"),
		fallback: [],
	});
	const prior = mergeCoverObservations({
		previous: stored,
		incoming: oldCatalog?.entries ?? [],
	});
	const incoming = values.observations
		? await jsonFile({ filename: values.observations })
		: [];
	const observations = mergeCoverObservations({ previous: prior, incoming });
	const preparedHashes: string[] = [];
	const preparationFailures: { packageHash: string; error: string }[] = [];
	const verifications: CoverVerification[] = [];
	const storedReceipts = z.array(coverVerificationSchema).parse(
		await jsonFile({
			filename: path.join(root, "collection-verifications.json"),
			fallback: [],
		})
	);
	if (values.verification && !values["evidence-root"])
		throw new Error("--evidence-root is required with --verification");
	const importedReceipts = values.verification
		? z
				.array(coverVerificationSchema)
				.parse(await jsonFile({ filename: values.verification }))
		: [];
	const receipts = [
		...storedReceipts.map((receipt) => ({
			receipt,
			evidenceRoot: path.join(root, "collection-evidence"),
		})),
		...importedReceipts.map((receipt) => ({
			receipt,
			evidenceRoot: values["evidence-root"] as string,
		})),
	];
	if (receipts.length) {
		const ownedEvidence = await checkedRoot({
			directory: path.join(root, "collection-evidence"),
		});
		const backupEvidence = await checkedRoot({
			directory: path.join(backup, "collection-evidence"),
		});
		await receipts.reduce(async (previous, source) => {
			await previous;
			const { receipt } = source;
			const evidenceRoot = await realpath(source.evidenceRoot);
			const retained: CoverVerification["artifacts"] = [];
			await receipt.artifacts.reduce(async (before, artifact) => {
				await before;
				if (
					path.isAbsolute(artifact.path) ||
					artifact.path.split(/[\\/]/).some((part) => part === "..")
				)
					throw new Error("Unsafe evidence path");
				const filename = path.join(evidenceRoot, artifact.path);
				if (
					!filename.startsWith(`${evidenceRoot}${path.sep}`) ||
					(await realpath(filename)) !== filename
				)
					throw new Error("Escaping or symlinked evidence path");
				const info = await lstat(filename);
				if (!info.isFile() || info.size > 20_000_000)
					throw new Error("Invalid evidence artifact");
				const bytes = await readFile(filename);
				if (
					createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
				)
					throw new Error("Evidence checksum mismatch");
				await publishBytes({
					filename: path.join(ownedEvidence, artifact.sha256),
					bytes,
				});
				await publishBytes({
					filename: path.join(backupEvidence, artifact.sha256),
					bytes,
				});
				if (
					!bytes.equals(
						await readFile(path.join(backupEvidence, artifact.sha256))
					)
				)
					throw new Error("Evidence backup mismatch");
				retained.push({ path: artifact.sha256, sha256: artifact.sha256 });
			}, Promise.resolve());
			const index = verifications.findIndex(
				(item) =>
					item.packageHash === receipt.packageHash &&
					item.fingerprint === receipt.fingerprint
			);
			const verified = { ...receipt, artifacts: retained };
			if (index < 0) verifications.push(verified);
			else verifications[index] = verified;
		}, Promise.resolve());
	}
	await publish({
		filename: path.join(root, "collection-verifications.json"),
		value: verifications,
	});
	await publish({
		filename: path.join(backup, "collection-verifications.json"),
		value: verifications,
	});
	const report = async ({ status }: { status: string }) => {
		const catalog = await readCoverCatalog({ root });
		if (catalog) await verifyCoverCatalog({ root, catalog });
		const summary = {
			...summarizeCoverCollection({
				observations,
				cachedEntries: catalog?.entries ?? [],
				preparedHashes,
				verifications,
			}),
			runId,
			startedAt,
			updatedAt: new Date().toISOString(),
			status,
			batches: progress,
			preparationFailures,
			categoryEnumeration:
				"incomplete: only explicitly supplied observations; native UI pagination is not automated",
		};
		await publish({
			filename: path.join(root, "collection-report.json"),
			value: summary,
		});
		return summary;
	};
	await publish({
		filename: path.join(root, "collection-observations.json"),
		value: observations,
	});
	await publish({
		filename: path.join(backup, "collection-observations.json"),
		value: observations,
	});
	if (oldCatalog) {
		const observed = new Map(
			observations.map((entry) => [entry.packageHash, entry])
		);
		const entries = oldCatalog.entries.map((entry) => ({
			...entry,
			categories:
				observed.get(entry.packageHash)?.categories ?? entry.categories,
		}));
		if (JSON.stringify(entries) !== JSON.stringify(oldCatalog.entries)) {
			await publish({
				filename: path.join(root, "catalog.json"),
				value: { ...oldCatalog, entries },
			});
		}
	}
	await report({ status: "discovery-recorded" });
	const known = new Map(
		oldCatalog?.entries.map((entry) => [entry.packageHash, entry]) ?? []
	);
	const pending = values["audit-only"]
		? []
		: observations.filter((entry) => {
				const cached = known.get(entry.packageHash);
				return (
					!cached ||
					(values["retry-missing"] && cached.cacheStatus !== "complete")
				);
			});
	const textCache = path.join(
		homedir(),
		"Library/Application Support/QCut/PrivateAssets/JianyingText/Cache"
	);
	const resolver = values.recover
		? createCoverDependencyResolver({
				cacheRoots: [textCache, sourceRoot],
				databaseRoots: [
					path.join(sourceRoot, "ressdk_db"),
					path.join(textCache, "ressdk_db"),
				],
				recoveryRoot: path.join(textCache, "recovered-resources"),
				filterRoot: path.join(
					homedir(),
					"Library/Application Support/QCut/JianyingFilterPackages"
				),
				applicationResources: values["application-resources"],
				allowDownload: true,
			})
		: undefined;
	await planCoverCollectionBatches({ observations: pending, batchSize }).reduce(
		async (previous, batch) => {
			await previous;
			const record: (typeof progress)[number] = {
				category: batch.category,
				packageHashes: batch.entries.map((entry) => entry.packageHash),
				status: "running",
			};
			progress.push(record);
			try {
				await checkSpace();
				await cacheJianyingCovers({
					sourceRoot,
					destination: root,
					observations: batch.entries,
					resolveDependency: resolver,
				});
				await backupCoverCatalog({ root, destination: backup });
				record.status = "cached-and-backup-verified";
				const summary = await report({ status: "batch-complete" });
				await publish({
					filename: path.join(backup, "collection-report.json"),
					value: summary,
				});
				console.log(
					JSON.stringify({
						category: batch.category,
						templates: batch.entries.length,
						status: record.status,
					})
				);
			} catch (error) {
				record.status = "failed";
				record.error = error instanceof Error ? error.message : String(error);
				await report({ status: "stopped-after-batch-failure" });
				throw error;
			}
		},
		Promise.resolve()
	);
	const catalog = await readCoverCatalog({ root });
	await (catalog?.entries ?? []).reduce(async (previous, entry) => {
		await previous;
		try {
			await preparePrivateCoverTextLayout({
				request: { packageHash: entry.packageHash },
				root,
			});
			preparedHashes.push(entry.packageHash);
		} catch (error) {
			preparationFailures.push({
				packageHash: entry.packageHash,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}, Promise.resolve());
	if (catalog) await backupCoverCatalog({ root, destination: backup });
	const summary = await report({
		status: "observed-subset-audited-and-backed-up",
	});
	await publish({
		filename: path.join(backup, "collection-report.json"),
		value: summary,
	});
	console.log(
		JSON.stringify(
			{
				root,
				backup,
				report: path.join(root, "collection-report.json"),
				totals: summary.totals,
				categories: summary.categories,
				preparationFailures,
			},
			null,
			2
		)
	);
} finally {
	await lock.close();
	await unlink(lockPath);
}

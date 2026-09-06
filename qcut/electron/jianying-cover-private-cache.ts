import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	lstat,
	mkdir,
	open,
	readdir,
	realpath,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { coverDependencyReferences } from "./jianying-cover-dependencies.js";
import {
	describeCoverDependencies,
	parseCoverTextLayout,
	resolveCoverLayoutFontDependency,
} from "./jianying-cover-layout.js";
export { coverDependencyReferences } from "./jianying-cover-dependencies.js";
import {
	coverCatalogSchema,
	coverObservationsSchema,
	type CoverCachedEntry,
	type CoverCachedFile,
	type CoverCatalog,
	type CoverLibraryResult,
	type CoverDependencyResolver,
} from "./jianying-cover-contract.js";

const MAX_FILE_BYTES = 200_000_000;
const templateSchema = z
	.object({
		cover: z.object({
			cover_draft: z
				.object({
					materials: z.record(z.unknown()),
					tracks: z.array(z.unknown()),
				})
				.passthrough(),
		}),
	})
	.passthrough();

export function coverCacheRoot(): string {
	return (
		process.env.QCUT_JIANYING_COVER_CACHE_ROOT ??
		path.join(
			homedir(),
			"Library/Application Support/QCut/PrivateAssets/JianyingCover"
		)
	);
}

function digest({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function readStableFile({
	root,
	relativePath,
}: {
	root: string;
	relativePath: string;
}): Promise<Buffer> {
	if (
		path.isAbsolute(relativePath) ||
		relativePath.split(/[\\/]/).some((part) => part === "..")
	) {
		throw new Error("Unsafe cache path");
	}
	const canonicalRoot = await realpath(root);
	const filename = path.join(canonicalRoot, relativePath);
	const canonical = await realpath(filename);
	if (
		canonical !== filename ||
		!canonical.startsWith(`${canonicalRoot}${path.sep}`)
	) {
		throw new Error(`Symlink or escaping cache path: ${relativePath}`);
	}
	const handle = await open(
		filename,
		constants.O_RDONLY | constants.O_NOFOLLOW
	);
	try {
		const before = await handle.stat();
		if (!before.isFile() || before.size > MAX_FILE_BYTES)
			throw new Error(`Invalid cache file: ${relativePath}`);
		const bytes = await handle.readFile();
		const after = await handle.stat();
		if (
			before.mtimeMs !== after.mtimeMs ||
			before.size !== after.size ||
			bytes.length !== before.size
		) {
			throw new Error(`Source changed while copying: ${relativePath}`);
		}
		return bytes;
	} finally {
		await handle.close();
	}
}

async function atomicWrite({
	filename,
	bytes,
}: {
	filename: string;
	bytes: Buffer;
}): Promise<void> {
	await mkdir(path.dirname(filename), { recursive: true });
	if ((await lstat(path.dirname(filename))).isSymbolicLink())
		throw new Error("Symlink cache destination");
	const temporary = `${filename}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
		await rename(temporary, filename);
	} finally {
		await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
}

async function retain({
	sourceRoot,
	relativePath,
	destination,
	logicalPath,
}: {
	sourceRoot: string;
	relativePath: string;
	destination: string;
	logicalPath: string;
}): Promise<CoverCachedFile> {
	const bytes = await readStableFile({ root: sourceRoot, relativePath });
	const sha256 = digest({ bytes });
	const stored = {
		path: `objects/${sha256}`,
		sha256,
		bytes: bytes.length,
		logicalPath,
	};
	await atomicWrite({ filename: path.join(destination, stored.path), bytes });
	await verifyCoverFile({ root: destination, file: stored });
	return stored;
}

export async function verifyCoverFile({
	root,
	file,
}: {
	root: string;
	file: CoverCachedFile;
}): Promise<Buffer> {
	const bytes = await readStableFile({ root, relativePath: file.path });
	if (bytes.length !== file.bytes || digest({ bytes }) !== file.sha256) {
		throw new Error(`Cover cache checksum mismatch: ${file.logicalPath}`);
	}
	return bytes;
}

export function coverEntryFiles({
	entry,
}: {
	entry: CoverCachedEntry;
}): CoverCachedFile[] {
	return [
		entry.definition,
		entry.preview,
		...entry.dependencies.flatMap((dependency) => dependency.files),
	];
}

// Work is serialized to avoid flooding external drives; completed content-addressed objects survive retries.
async function sequence<T, R>({
	values,
	run,
}: {
	values: T[];
	run: (value: T) => Promise<R>;
}): Promise<R[]> {
	const results: R[] = [];
	await values.reduce(
		(previous, value) =>
			previous.then(async () => {
				results.push(await run(value));
			}),
		Promise.resolve()
	);
	return results;
}

async function directoryFiles({
	root,
	relativePath,
	depth = 0,
}: {
	root: string;
	relativePath: string;
	depth?: number;
}): Promise<string[]> {
	if (depth > 12) throw new Error("Resource directory nesting exceeds limit");
	const entries = await readdir(path.join(root, relativePath), {
		withFileTypes: true,
	});
	const lists = await sequence({
		values: entries,
		run: async (entry) => {
			if (entry.name.startsWith("._") || entry.name === ".DS_Store") return [];
			const child = path.join(relativePath, entry.name);
			if (entry.isSymbolicLink())
				throw new Error(`Symlink in resource package: ${child}`);
			if (entry.isDirectory())
				return directoryFiles({ root, relativePath: child, depth: depth + 1 });
			if (!entry.isFile())
				throw new Error(`Non-file in resource package: ${child}`);
			return [child];
		},
	});
	return lists.flat().sort();
}

async function indexPackages({
	sourceRoot,
}: {
	sourceRoot: string;
}): Promise<Map<string, string[]>> {
	const index = new Map<string, string[]>();
	const visit = async ({
		relativePath,
		depth,
	}: {
		relativePath: string;
		depth: number;
	}): Promise<void> => {
		let entries;
		try {
			entries = await readdir(path.join(sourceRoot, relativePath), {
				withFileTypes: true,
			});
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		await sequence({
			values: entries,
			run: async (entry) => {
				if (!entry.isDirectory() || entry.isSymbolicLink()) return;
				const child = path.join(relativePath, entry.name);
				if (/^[a-f0-9]{32}$/.test(entry.name)) {
					index.set(entry.name, [...(index.get(entry.name) ?? []), child]);
					return;
				}
				if (depth < 3) await visit({ relativePath: child, depth: depth + 1 });
			},
		});
	};
	await sequence({
		values: ["effect", "artistEffect"],
		run: (relativePath) => visit({ relativePath, depth: 0 }),
	});
	return index;
}

export async function readCoverCatalog({
	root = coverCacheRoot(),
}: {
	root?: string;
} = {}): Promise<CoverCatalog | null> {
	try {
		const bytes = await readStableFile({ root, relativePath: "catalog.json" });
		return coverCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function cacheJianyingCovers({
	sourceRoot,
	destination = coverCacheRoot(),
	observations,
	resolveDependency,
}: {
	sourceRoot: string;
	destination?: string;
	observations: unknown;
	resolveDependency?: CoverDependencyResolver;
}): Promise<CoverCatalog> {
	const observed = coverObservationsSchema.parse(observations);
	if (
		new Set(observed.map((entry) => entry.packageHash)).size !== observed.length
	)
		throw new Error("Duplicate observed package");
	await mkdir(destination, { recursive: true });
	const source = await realpath(sourceRoot);
	const target = await realpath(destination);
	if (target === source || target.startsWith(`${source}${path.sep}`))
		throw new Error("Destination must be independent of Jianying's cache");
	const previous = await readCoverCatalog({ root: destination });
	const packages = await indexPackages({ sourceRoot });
	const imported = await sequence({
		values: observed,
		run: async (observation): Promise<CoverCachedEntry> => {
			const relativePath = `template/${observation.packageHash}/template.json`;
			const definition = await retain({
				sourceRoot,
				relativePath,
				destination,
				logicalPath: "template.json",
			});
			const template = templateSchema.parse(
				JSON.parse(
					(
						await verifyCoverFile({ root: destination, file: definition })
					).toString("utf8")
				)
			);
			const materials = template.cover.cover_draft.materials;
			const retainedEntry = previous?.entries.find(
				(entry) =>
					entry.packageHash === observation.packageHash &&
					entry.definition.sha256 === definition.sha256
			);
			const preview = await retain({
				sourceRoot,
				relativePath: `image/${observation.previewHash}`,
				destination,
				logicalPath: "preview.webp",
			});
			const previewBytes = await verifyCoverFile({
				root: destination,
				file: preview,
			});
			if (
				previewBytes.toString("ascii", 0, 4) !== "RIFF" ||
				previewBytes.toString("ascii", 8, 12) !== "WEBP"
			)
				throw new Error("Cover preview is not WebP");
			const dependencies = await sequence({
				values: coverDependencyReferences({ materials }),
				run: async (
					reference
				): Promise<CoverCachedEntry["dependencies"][number]> => {
					const hash =
						/^(?:text|textEffect|filter|effect|sticker|animation)\/([a-f0-9]{32})$/.exec(
							reference
						)?.[1];
					const candidates = hash ? (packages.get(hash) ?? []) : [];
					const recovered = candidates.length
						? undefined
						: await resolveDependency?.({ reference, materials });
					const resolved = recovered?.source;
					const relativeDirectory =
						resolved?.relativePath ?? candidates.sort()[0];
					if (!relativeDirectory) {
						const retainedDependency = retainedEntry?.dependencies.find(
							(dependency) =>
								dependency.reference === reference &&
								dependency.status === "cached" &&
								dependency.files.length > 0
						);
						if (retainedDependency) return retainedDependency;
						return {
							reference,
							files: [],
							status: hash ? "missing" : "unsupported-path",
							...(recovered?.reason ? { reason: recovered.reason } : {}),
						};
					}
					const root = resolved?.root ?? sourceRoot;
					const paths = resolved?.singleFile
						? [relativeDirectory]
						: await directoryFiles({ root, relativePath: relativeDirectory });
					const files = await sequence({
						values: paths,
						run: (file) =>
							retain({
								sourceRoot: root,
								relativePath: file,
								destination,
								logicalPath: `${reference}/${resolved?.singleFile ? path.basename(file) : path.relative(relativeDirectory, file)}`,
							}),
					});
					return {
						reference,
						files,
						status: files.length ? "cached" : "missing",
						...(resolved ? { resolution: resolved.resolution } : {}),
					};
				},
			});
			return {
				...observation,
				categories: [
					...new Set([
						...(retainedEntry?.categories ?? []),
						...observation.categories,
					]),
				],
				definition,
				preview,
				dependencies,
				textCount: Array.isArray(materials.texts) ? materials.texts.length : 0,
				cacheStatus: dependencies.every((item) => item.status === "cached")
					? "complete"
					: "missing-dependencies",
				renderStatus: "native-renderer-required",
			};
		},
	});
	const byHash = new Map(
		previous?.entries.map((entry) => [entry.packageHash, entry]) ?? []
	);
	for (const entry of imported) byHash.set(entry.packageHash, entry);
	const catalog: CoverCatalog = {
		schema: "qcut.private-jianying-cover",
		version: 1,
		capturedAt: new Date().toISOString(),
		coverage: "observed-downloaded-subset",
		entries: [...byHash.values()],
	};
	await verifyCoverCatalog({ root: destination, catalog });
	await atomicWrite({
		filename: path.join(destination, "catalog.json"),
		bytes: Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`),
	});
	return catalog;
}

export async function verifyCoverCatalog({
	root,
	catalog,
}: {
	root: string;
	catalog: CoverCatalog;
}): Promise<void> {
	const files = new Map(
		catalog.entries
			.flatMap((entry) => coverEntryFiles({ entry }))
			.map((file) => [file.path, file])
	);
	await sequence({
		values: [...files.values()],
		run: (file) => verifyCoverFile({ root, file }),
	});
}

export async function backupCoverCatalog({
	root,
	destination,
}: {
	root: string;
	destination: string;
}): Promise<void> {
	const catalog = await readCoverCatalog({ root });
	if (!catalog) throw new Error("Cover catalog not found");
	await verifyCoverCatalog({ root, catalog });
	const files = new Map(
		catalog.entries
			.flatMap((entry) => coverEntryFiles({ entry }))
			.map((file) => [file.path, file])
	);
	await sequence({
		values: [...files.values()],
		run: async (file) => {
			const bytes = await verifyCoverFile({ root, file });
			await atomicWrite({ filename: path.join(destination, file.path), bytes });
		},
	});
	await verifyCoverCatalog({ root: destination, catalog });
	await atomicWrite({
		filename: path.join(destination, "catalog.json"),
		bytes: Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`),
	});
}

export async function listPrivateCovers({
	root = coverCacheRoot(),
}: {
	root?: string;
} = {}): Promise<CoverLibraryResult> {
	const catalog = await readCoverCatalog({ root });
	if (!catalog)
		return {
			entries: [],
			coverage: "observed-downloaded-subset",
			capturedAt: null,
		};
	await verifyCoverCatalog({ root, catalog });
	const entries = await sequence({
		values: catalog.entries,
		run: async (entry) => {
			const definition = JSON.parse(
				(await verifyCoverFile({ root, file: entry.definition })).toString(
					"utf8"
				)
			);
			let dependencies = entry.dependencies;
			let textLayout: NonNullable<CoverCachedEntry["textLayout"]> = {
				ready: false,
				requiresNative: false,
				reason: "unsupported-layout",
			};
			try {
				dependencies = describeCoverDependencies({ entry, definition });
				const layout = parseCoverTextLayout({ definition });
				const ready = layout.texts.every(({ text, effect }) => {
					try {
						resolveCoverLayoutFontDependency({ text, entry, catalog });
					} catch {
						return false;
					}
					return (
						!effect ||
						dependencies.some(
							(item) =>
								item.reference === effect.path &&
								item.status === "cached" &&
								item.files.length
						)
					);
				});
				textLayout = {
					ready,
					requiresNative: layout.texts.some((text) => text.effect),
					...(ready ? {} : { reason: "missing-text-dependencies" }),
				};
			} catch (error) {
				if (error instanceof Error && error.message.startsWith("Vertical"))
					textLayout.reason = "vertical-text";
			}
			return {
				...entry,
				dependencies,
				textLayout,
				previewDataUrl: `data:image/webp;base64,${(await verifyCoverFile({ root, file: entry.preview })).toString("base64")}`,
			};
		},
	});
	return {
		entries,
		coverage: catalog.coverage,
		capturedAt: catalog.capturedAt,
	};
}

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	open,
	realpath,
	rename,
	unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PRIVATE_STICKER_CATALOG_BYTES } from "@qcut/editor-core/sticker-lab";
import {
	DEFAULT_UPLOAD_CONCURRENCY,
	type PreparedPrivateCatalog,
} from "./types";
import {
	createSupabaseStorageFetch,
	preparePrivateStickerCatalog,
	publishPrivateStickerCatalog,
} from "./index";

type CliMode = "dry-run" | "prepare" | "publish";

export interface PrivateCatalogCliOptions {
	againstManifestPaths: string[];
	catalogId: string;
	concurrency: number;
	manifestPath: string;
	maxCatalogBytes: number;
	mode: CliMode;
	outputPath?: string;
	replaceManifest: boolean;
	replaceOutput: boolean;
	reportPath: string;
}

function requiredValue({
	argv,
	flag,
	index,
}: {
	argv: string[];
	flag: string;
	index: number;
}): string {
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

function parsePositiveInteger({
	flag,
	value,
}: {
	flag: string;
	value: string;
}): number {
	if (!/^\d+$/.test(value))
		throw new Error(`${flag} requires a positive integer`);
	const parsed = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${flag} requires a positive safe integer`);
	}
	return parsed;
}

export function parsePrivateCatalogCliArguments({
	argv,
}: {
	argv: string[];
}): PrivateCatalogCliOptions {
	let catalogId = "";
	let concurrency = DEFAULT_UPLOAD_CONCURRENCY;
	let manifestPath = "";
	let maxCatalogBytes = MAX_PRIVATE_STICKER_CATALOG_BYTES;
	let mode: CliMode = "dry-run";
	let modeWasExplicit = false;
	let outputPath: string | undefined;
	let replaceManifest = false;
	let replaceOutput = false;
	let reportPath = "";
	const againstManifestPaths: string[] = [];

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag === "--catalog-id") {
			catalogId = requiredValue({ argv, flag, index });
			index += 1;
			continue;
		}
		if (flag === "--manifest") {
			manifestPath = requiredValue({ argv, flag, index });
			index += 1;
			continue;
		}
		if (flag === "--report") {
			reportPath = requiredValue({ argv, flag, index });
			index += 1;
			continue;
		}
		if (flag === "--against-manifest") {
			againstManifestPaths.push(requiredValue({ argv, flag, index }));
			index += 1;
			continue;
		}
		if (flag === "--output") {
			outputPath = requiredValue({ argv, flag, index });
			index += 1;
			continue;
		}
		if (flag === "--concurrency") {
			concurrency = parsePositiveInteger({
				flag,
				value: requiredValue({ argv, flag, index }),
			});
			index += 1;
			continue;
		}
		if (flag === "--max-catalog-bytes") {
			maxCatalogBytes = parsePositiveInteger({
				flag,
				value: requiredValue({ argv, flag, index }),
			});
			index += 1;
			continue;
		}
		if (["--dry-run", "--prepare", "--publish"].includes(flag ?? "")) {
			if (modeWasExplicit) throw new Error("Choose only one execution mode");
			mode = (flag as `--${CliMode}`).slice(2) as CliMode;
			modeWasExplicit = true;
			continue;
		}
		if (flag === "--replace-manifest") {
			replaceManifest = true;
			continue;
		}
		if (flag === "--replace-output") {
			replaceOutput = true;
			continue;
		}
		throw new Error(`Unknown argument: ${flag ?? "(missing)"}`);
	}

	if (!catalogId) throw new Error("--catalog-id is required");
	if (!manifestPath) throw new Error("--manifest is required");
	if (!reportPath) throw new Error("--report is required");
	if (mode !== "dry-run" && !outputPath) {
		throw new Error("--output is required for --prepare and --publish");
	}
	if (replaceManifest && mode !== "publish") {
		throw new Error("--replace-manifest is only valid with --publish");
	}
	if (replaceOutput && !outputPath) {
		throw new Error("--replace-output requires --output");
	}
	if (maxCatalogBytes > MAX_PRIVATE_STICKER_CATALOG_BYTES) {
		throw new Error(
			`--max-catalog-bytes cannot exceed ${MAX_PRIVATE_STICKER_CATALOG_BYTES}`
		);
	}
	return {
		againstManifestPaths,
		catalogId,
		concurrency,
		manifestPath,
		maxCatalogBytes,
		mode,
		outputPath,
		replaceManifest,
		replaceOutput,
		reportPath,
	};
}

function isPathInside({
	root,
	target,
}: {
	root: string;
	target: string;
}): boolean {
	const relativePath = relative(root, target);
	return (
		relativePath === "" ||
		(!relativePath.startsWith(`..${sep}`) &&
			relativePath !== ".." &&
			!isAbsolute(relativePath))
	);
}

async function pathExists({
	filePath,
}: {
	filePath: string;
}): Promise<boolean> {
	return lstat(filePath)
		.then(() => true)
		.catch((error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return false;
			}
			throw error;
		});
}

export async function findNearestGitRepositoryRoot({
	startPath,
}: {
	startPath: string;
}): Promise<string> {
	const canonicalStartPath = await realpath(resolve(startPath));
	const startStats = await lstat(canonicalStartPath);
	let candidate = startStats.isDirectory()
		? canonicalStartPath
		: dirname(canonicalStartPath);
	while (true) {
		const gitMarkerPath = join(candidate, ".git");
		if (await pathExists({ filePath: gitMarkerPath })) {
			const gitMarkerStats = await lstat(gitMarkerPath);
			if (
				gitMarkerStats.isSymbolicLink() ||
				!(gitMarkerStats.isFile() || gitMarkerStats.isDirectory())
			) {
				throw new Error("Git repository marker must be a file or directory");
			}
			return candidate;
		}
		const parent = dirname(candidate);
		if (parent === candidate) {
			throw new Error(`No Git repository found above: ${canonicalStartPath}`);
		}
		candidate = parent;
	}
}

function bytesEqual({
	left,
	right,
}: {
	left: Uint8Array;
	right: Uint8Array;
}): boolean {
	return (
		left.byteLength === right.byteLength &&
		left.every((value, index) => right[index] === value)
	);
}

export async function writePreparedManifest({
	outputPath,
	prepared,
	replaceOutput,
	repositoryRoot,
}: {
	outputPath: string;
	prepared: PreparedPrivateCatalog;
	replaceOutput: boolean;
	repositoryRoot: string;
}): Promise<void> {
	const absoluteOutputPath = resolve(outputPath);
	const canonicalRepositoryRoot = await realpath(repositoryRoot);
	if (
		isPathInside({ root: canonicalRepositoryRoot, target: absoluteOutputPath })
	) {
		throw new Error(
			"Private manifest output must stay outside the Git repository"
		);
	}
	const outputDirectory = dirname(absoluteOutputPath);
	await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
	const canonicalOutputDirectory = await realpath(outputDirectory);
	if (
		isPathInside({
			root: canonicalRepositoryRoot,
			target: canonicalOutputDirectory,
		})
	) {
		throw new Error(
			"Private manifest output must stay outside the Git repository"
		);
	}
	const outputExists = await pathExists({ filePath: absoluteOutputPath });
	if (outputExists) {
		const outputStats = await lstat(absoluteOutputPath);
		if (!outputStats.isFile() || outputStats.isSymbolicLink()) {
			throw new Error(
				"Private manifest output must be a regular non-symlink file"
			);
		}
		const outputHandle = await open(
			absoluteOutputPath,
			constants.O_RDONLY | constants.O_NOFOLLOW
		);
		let existingBytes: Uint8Array;
		try {
			existingBytes = new Uint8Array(await outputHandle.readFile());
		} finally {
			await outputHandle.close();
		}
		if (bytesEqual({ left: existingBytes, right: prepared.manifestBytes })) {
			await chmod(absoluteOutputPath, 0o600);
			return;
		}
		if (!replaceOutput) {
			throw new Error(
				"Private manifest output already exists; pass --replace-output"
			);
		}
	}

	const temporaryPath = resolve(
		canonicalOutputDirectory,
		`.${randomUUID()}.private-sticker-manifest.tmp`
	);
	const handle = await open(
		temporaryPath,
		constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
		0o600
	);
	let temporaryExists = true;
	try {
		await handle.writeFile(prepared.manifestBytes);
		await handle.sync();
		await handle.close();
		await rename(temporaryPath, absoluteOutputPath);
		temporaryExists = false;
		await chmod(absoluteOutputPath, 0o600);
	} finally {
		await handle.close().catch(() => undefined);
		if (temporaryExists) await unlink(temporaryPath).catch(() => undefined);
	}
}

function redactErrorMessage({
	error,
	secrets,
}: {
	error: unknown;
	secrets: Array<string | undefined>;
}): string {
	let message =
		error instanceof Error ? error.message : "Private catalog command failed";
	for (const secret of secrets) {
		if (secret) message = message.split(secret).join("[REDACTED]");
	}
	return message;
}

export async function runPrivateCatalogCli({
	argv,
	env,
	repositoryRoot,
}: {
	argv: string[];
	env: NodeJS.ProcessEnv;
	repositoryRoot: string;
}): Promise<Record<string, unknown>> {
	const options = parsePrivateCatalogCliArguments({ argv });
	const prepared = await preparePrivateStickerCatalog({
		againstManifestPaths: options.againstManifestPaths,
		catalogId: options.catalogId,
		manifestPath: options.manifestPath,
		maxCatalogBytes: options.maxCatalogBytes,
		reportPath: options.reportPath,
	});
	if (options.mode === "dry-run") {
		return { mode: options.mode, published: false, ...prepared.summary };
	}
	await writePreparedManifest({
		outputPath: options.outputPath as string,
		prepared,
		replaceOutput: options.replaceOutput,
		repositoryRoot,
	});
	if (options.mode === "prepare") {
		return { mode: options.mode, published: false, ...prepared.summary };
	}

	const supabaseUrl = env.SUPABASE_URL ?? "";
	const serviceKey = env.SUPABASE_SERVICE_KEY ?? "";
	const storageFetch = createSupabaseStorageFetch({
		serviceKey,
		supabaseUrl,
	});
	const publication = await publishPrivateStickerCatalog({
		concurrency: options.concurrency,
		prepared,
		replaceManifest: options.replaceManifest,
		storageFetch,
	});
	return {
		mode: options.mode,
		published: true,
		...prepared.summary,
		...publication,
	};
}

if (import.meta.main) {
	findNearestGitRepositoryRoot({
		startPath: dirname(fileURLToPath(import.meta.url)),
	})
		.then((repositoryRoot) =>
			runPrivateCatalogCli({
				argv: process.argv.slice(2),
				env: process.env,
				repositoryRoot,
			})
		)
		.then((result) => {
			process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
		})
		.catch((error: unknown) => {
			const message = redactErrorMessage({
				error,
				secrets: [process.env.SUPABASE_SERVICE_KEY, process.env.SUPABASE_URL],
			});
			process.stderr.write(`${message}\n`);
			process.exitCode = 1;
		});
}

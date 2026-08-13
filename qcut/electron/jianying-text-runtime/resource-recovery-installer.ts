import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
	type FileHandle,
	cp,
	lstat,
	mkdir,
	mkdtemp,
	open,
	readdir,
	realpath,
	rename,
	rm,
	unlink,
} from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import type {
	JianyingTextResourceRecoveryFailureReason,
	JianyingTextRuntimeDependencyRole,
} from "../jianying-text-runtime-contract.js";
import {
	asJianyingRecord,
	readBoundedJianyingTextJson,
} from "../jianying-text-package-metadata.js";
import type { JianyingTextResourceCatalogCandidate } from "./resource-catalog.js";
import { findJianyingPackageFontFile } from "./package-font-files.js";
import {
	calculateJianyingResourceArchiveMd5,
	extractValidatedJianyingResourceArchive,
	validateJianyingRecoveryArchiveEntry,
} from "./resource-recovery-archive.js";

export {
	extractValidatedJianyingResourceArchive,
	validateJianyingRecoveryArchiveEntry,
};

const MAXIMUM_ARCHIVE_BYTES = 256 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const INSTALL_LOCK_TIMEOUT_MS = 180_000;
const INSTALL_LOCK_STALE_MS = 10 * 60_000;
const INSTALL_LOCK_RETRY_MS = 50;
const TRUSTED_CDN_SUFFIXES = [
	".bytecdn.com",
	".byteeffecttos.com",
	".byteimg.com",
	".vlabvod.com",
] as const;

interface ResourceInstallLock {
	device: string;
	handle: FileHandle;
	inode: string;
	lockPath: string;
}

export interface JianyingTextResourceRecoveryResult {
	resourceId: string;
	state: "already-ready" | "recovered" | "unavailable";
	packageHash?: string;
	packagePath?: string;
	reason?: Exclude<
		JianyingTextResourceRecoveryFailureReason,
		"recovery-disabled"
	>;
}

export type ResourceFetcher = (
	input: string,
	init: RequestInit
) => Promise<Response>;

export type ResourceArchiveExtractor = ({
	archivePath,
	destination,
}: {
	archivePath: string;
	destination: string;
}) => Promise<void>;

export function isTrustedJianyingResourceUrl({ value }: { value: string }) {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			TRUSTED_CDN_SUFFIXES.some(
				(suffix) =>
					url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix)
			)
		);
	} catch {
		return false;
	}
}

async function downloadResourceArchive({
	archivePath,
	fetchResource,
	url,
}: {
	archivePath: string;
	fetchResource: ResourceFetcher;
	url: string;
}) {
	if (!isTrustedJianyingResourceUrl({ value: url })) {
		throw new Error("Jianying resource URL is not trusted");
	}
	const response = await fetchResource(url, {
		redirect: "follow",
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	});
	if (!response.ok || !response.body) {
		throw new Error("Jianying resource download failed");
	}
	if (response.url && !isTrustedJianyingResourceUrl({ value: response.url })) {
		throw new Error("Jianying resource redirect is not trusted");
	}
	const declaredSize = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredSize) && declaredSize > MAXIMUM_ARCHIVE_BYTES) {
		throw new Error("Jianying resource archive is too large");
	}
	let receivedBytes = 0;
	const limiter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			receivedBytes += chunk.length;
			if (receivedBytes > MAXIMUM_ARCHIVE_BYTES) {
				callback(new Error("Jianying resource archive is too large"));
				return;
			}
			callback(null, chunk);
		},
	});
	await pipeline(
		Readable.fromWeb(response.body),
		limiter,
		createWriteStream(archivePath, { flags: "wx", mode: 0o600 })
	);
}

function packageSupportsRole({
	config,
	role,
}: {
	config: unknown;
	role: JianyingTextRuntimeDependencyRole;
}) {
	const links = asJianyingRecord(asJianyingRecord(config)?.effect)?.Link;
	if (!Array.isArray(links)) return false;
	const linkTypes = new Set(
		links.flatMap((link) => {
			const type = asJianyingRecord(link)?.type;
			return typeof type === "string" ? [type] : [];
		})
	);
	if (role === "animation") {
		return linkTypes.has("InfoSticker") || linkTypes.has("TextAnimation");
	}
	if (role === "effect-style") return linkTypes.has("TextStyle");
	if (role === "font") return false;
	return linkTypes.has("InfoSticker") || linkTypes.has("ScriptInfoSticker");
}

async function isReadyPackage({
	packagePath,
	role,
}: {
	packagePath: string;
	role: JianyingTextRuntimeDependencyRole;
}) {
	try {
		const metadata = await lstat(packagePath);
		if (!metadata.isDirectory()) return false;
		if (role === "font") {
			return Boolean(await findJianyingPackageFontFile({ packagePath }));
		}
		const config = await readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "config.json"),
		});
		return packageSupportsRole({ config, role });
	} catch {
		return false;
	}
}

async function locateExtractedPackageRoot({
	extractionRoot,
	role,
}: {
	extractionRoot: string;
	role: JianyingTextRuntimeDependencyRole;
}) {
	if (await isReadyPackage({ packagePath: extractionRoot, role })) {
		return extractionRoot;
	}
	const entries = await readdir(extractionRoot, { withFileTypes: true });
	const directories = entries.filter(
		(entry) => entry.isDirectory() && entry.name !== "__MACOSX"
	);
	const candidates = await Promise.all(
		directories.map(async (entry) => {
			const candidate = path.join(extractionRoot, entry.name);
			return (await isReadyPackage({ packagePath: candidate, role }))
				? candidate
				: null;
		})
	);
	const ready = candidates.filter(
		(candidate): candidate is string => candidate !== null
	);
	if (ready.length !== 1) {
		throw new Error("Jianying resource archive has no unique package root");
	}
	return ready[0];
}

function nodeErrorCode({ error }: { error: unknown }) {
	return error && typeof error === "object" && "code" in error
		? String(error.code)
		: undefined;
}

async function discardStaleInstallLock({ lockPath }: { lockPath: string }) {
	try {
		const existing = await lstat(lockPath, { bigint: true });
		if (Date.now() - Number(existing.mtimeMs) < INSTALL_LOCK_STALE_MS) {
			return false;
		}
		const current = await lstat(lockPath, { bigint: true });
		if (current.dev !== existing.dev || current.ino !== existing.ino)
			return false;
		await unlink(lockPath);
		return true;
	} catch (error) {
		if (nodeErrorCode({ error }) === "ENOENT") return true;
		throw error;
	}
}

async function acquireInstallLock({
	deadline,
	lockPath,
}: {
	deadline: number;
	lockPath: string;
}): Promise<ResourceInstallLock> {
	let handle: FileHandle;
	try {
		handle = await open(lockPath, "wx", 0o600);
	} catch (error) {
		if (nodeErrorCode({ error }) !== "EEXIST") throw error;
		if (await discardStaleInstallLock({ lockPath })) {
			return acquireInstallLock({ deadline, lockPath });
		}
		if (Date.now() >= deadline) {
			throw new Error(`Timed out acquiring Jianying install lock: ${lockPath}`);
		}
		await delay(INSTALL_LOCK_RETRY_MS);
		return acquireInstallLock({ deadline, lockPath });
	}
	try {
		await handle.writeFile(
			JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
		);
		await handle.sync();
		const identity = await handle.stat({ bigint: true });
		return {
			device: identity.dev.toString(),
			handle,
			inode: identity.ino.toString(),
			lockPath,
		};
	} catch (error) {
		await handle.close().catch(() => undefined);
		await unlink(lockPath).catch(() => undefined);
		throw error;
	}
}

async function releaseInstallLock({ lock }: { lock: ResourceInstallLock }) {
	await lock.handle.close();
	try {
		const current = await lstat(lock.lockPath, { bigint: true });
		if (
			current.dev.toString() !== lock.device ||
			current.ino.toString() !== lock.inode
		) {
			return;
		}
		await unlink(lock.lockPath);
	} catch (error) {
		if (nodeErrorCode({ error }) !== "ENOENT") throw error;
	}
}

function recoveryContainer({
	role,
}: {
	role: JianyingTextRuntimeDependencyRole;
}) {
	return role === "animation" ? "effect" : "artistEffect";
}

async function installStagedPackage({
	destination,
	role,
	stagedPath,
}: {
	destination: string;
	role: JianyingTextRuntimeDependencyRole;
	stagedPath: string;
}) {
	try {
		await rename(stagedPath, destination);
	} catch (cause) {
		if (await isReadyPackage({ packagePath: destination, role })) return;
		await rm(destination, { recursive: true, force: true });
		await rename(stagedPath, destination).catch(() => {
			throw cause;
		});
	}
}

async function copyLocalPackage({
	destination,
	source,
}: {
	destination: string;
	source: string;
}) {
	const sourceRoot = await realpath(source);
	await cp(sourceRoot, destination, {
		errorOnExist: true,
		force: false,
		recursive: true,
		filter: async (sourcePath) => {
			const metadata = await lstat(sourcePath);
			if (metadata.isSymbolicLink()) {
				throw new Error("Jianying local package contains a symbolic link");
			}
			return true;
		},
	});
}

async function installLocalPackage({
	destination,
	resourceDirectory,
	role,
	sourcePackagePaths,
}: {
	destination: string;
	resourceDirectory: string;
	role: JianyingTextRuntimeDependencyRole;
	sourcePackagePaths: string[];
}) {
	const sourceChecks = await Promise.all(
		sourcePackagePaths.map(async (source) => ({
			ready: await isReadyPackage({ packagePath: source, role }),
			source,
		}))
	);
	const source = sourceChecks.find(({ ready }) => ready)?.source;
	if (!source) return false;
	const stagedPath = path.join(
		resourceDirectory,
		`.local-${path.basename(destination)}-${randomUUID()}`
	);
	try {
		await copyLocalPackage({ destination: stagedPath, source });
		await installStagedPackage({ destination, role, stagedPath });
		return await isReadyPackage({ packagePath: destination, role });
	} catch {
		return false;
	} finally {
		await rm(stagedPath, { recursive: true, force: true });
	}
}

export async function installJianyingTextCatalogCandidate({
	candidate,
	fetchResource,
	extractArchive,
	recoveryRoot,
	role,
	sourcePackagePaths = [],
}: {
	candidate: JianyingTextResourceCatalogCandidate;
	fetchResource: ResourceFetcher;
	extractArchive: ResourceArchiveExtractor;
	recoveryRoot: string;
	role: JianyingTextRuntimeDependencyRole;
	sourcePackagePaths?: string[];
}): Promise<JianyingTextResourceRecoveryResult> {
	const resourceDirectory = path.join(
		recoveryRoot,
		recoveryContainer({ role }),
		candidate.resourceId
	);
	const destination = path.join(resourceDirectory, candidate.packageHash);
	await mkdir(resourceDirectory, { recursive: true });
	const lock = await acquireInstallLock({
		deadline: Date.now() + INSTALL_LOCK_TIMEOUT_MS,
		lockPath: `${destination}.lock`,
	});
	try {
		if (await isReadyPackage({ packagePath: destination, role })) {
			return {
				resourceId: candidate.resourceId,
				state: "already-ready",
				packageHash: candidate.packageHash,
				packagePath: await realpath(destination),
			};
		}
		await rm(destination, { recursive: true, force: true });
		if (
			await installLocalPackage({
				destination,
				resourceDirectory,
				role,
				sourcePackagePaths,
			})
		) {
			return {
				resourceId: candidate.resourceId,
				state: "recovered",
				packageHash: candidate.packageHash,
				packagePath: await realpath(destination),
			};
		}
		const workspace = await mkdtemp(path.join(resourceDirectory, ".recover-"));
		try {
			let failureReason: NonNullable<
				JianyingTextResourceRecoveryResult["reason"]
			> = "download-failed";
			for (let index = 0; index < candidate.downloadUrls.length; index += 1) {
				const archivePath = path.join(workspace, `resource-${index}.zip`);
				const extractionRoot = path.join(workspace, `extracted-${index}`);
				try {
					await mkdir(extractionRoot, { recursive: true });
					await downloadResourceArchive({
						archivePath,
						fetchResource,
						url: candidate.downloadUrls[index],
					});
				} catch {
					continue;
				}
				if (
					(await calculateJianyingResourceArchiveMd5({
						filePath: archivePath,
					})) !== candidate.packageHash
				) {
					failureReason = "hash-mismatch";
					continue;
				}
				const stagedPath = `${destination}.staged-${randomUUID()}`;
				try {
					await extractArchive({ archivePath, destination: extractionRoot });
					const packageRoot = await locateExtractedPackageRoot({
						extractionRoot,
						role,
					});
					await rename(packageRoot, stagedPath);
					await installStagedPackage({ destination, role, stagedPath });
					if (!(await isReadyPackage({ packagePath: destination, role }))) {
						throw new Error("Recovered Jianying package is invalid");
					}
				} catch {
					failureReason = "package-invalid";
					continue;
				} finally {
					await rm(stagedPath, { recursive: true, force: true });
				}
				return {
					resourceId: candidate.resourceId,
					state: "recovered",
					packageHash: candidate.packageHash,
					packagePath: await realpath(destination),
				};
			}
			return {
				resourceId: candidate.resourceId,
				state: "unavailable",
				reason: failureReason,
			};
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	} finally {
		await releaseInstallLock({ lock });
	}
}

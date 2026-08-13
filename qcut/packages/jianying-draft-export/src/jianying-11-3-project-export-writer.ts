import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	JIANYING_11_3_BETA2_APP_ID,
	JIANYING_11_3_BETA2_APP_SOURCE,
	JIANYING_11_3_BETA2_APP_VERSION,
	JIANYING_11_3_BETA2_NEW_VERSION,
	JIANYING_11_3_BETA2_PROFILE_ID,
	JIANYING_11_3_BETA2_SCHEMA_VERSION,
	JIANYING_11_3_BETA2_TOP_LEVEL_KEYS,
} from "@qcut/editor-core/jianying-draft";
import {
	inspectJianying113ProjectSource,
	type Jianying113ProjectSource,
} from "./jianying-11-3-project-source.js";

const COPY_WORKERS = 4;
const COPY_BUFFER_BYTES = 1024 * 1024;

export interface Jianying113ProjectExportGuardContext {
	outputParentDirectory: string;
	sourceProjectDirectory: string;
}

export interface WriteJianying113ProjectExportOptions {
	assertTargetAppClosed: (
		context: Jianying113ProjectExportGuardContext
	) => Promise<void>;
	contentBytes: Uint8Array;
	draftName: string;
	expectedSourceSha256: string;
	outputParentDirectory: string;
	sourceProjectDirectory: string;
}

export interface Jianying113ProjectExportResult {
	contentRelativePath: string;
	contentSha256: string;
	copiedFileCount: number;
	outputDirectory: string;
	profileId: typeof JIANYING_11_3_BETA2_PROFILE_ID;
	subdraftId: string;
}

function readRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function assertExactJianying113Content({
	contentBytes,
}: {
	contentBytes: Uint8Array;
}): void {
	let parsed: unknown;
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes);
		parsed = JSON.parse(text);
	} catch {
		throw new Error("Jianying export content must be valid UTF-8 JSON.");
	}
	const parsedRecord = readRecord({ value: parsed });
	if (parsedRecord === undefined) {
		throw new Error("Jianying export content must be a JSON object.");
	}
	const platform = readRecord({ value: parsedRecord.last_modified_platform });
	const topLevelKeys = Object.keys(parsedRecord).sort();
	const expectedKeys = [...JIANYING_11_3_BETA2_TOP_LEVEL_KEYS].sort();
	if (
		parsedRecord.version !== JIANYING_11_3_BETA2_SCHEMA_VERSION ||
		parsedRecord.new_version !== JIANYING_11_3_BETA2_NEW_VERSION ||
		platform?.app_id !== JIANYING_11_3_BETA2_APP_ID ||
		platform.app_source !== JIANYING_11_3_BETA2_APP_SOURCE ||
		platform.app_version !== JIANYING_11_3_BETA2_APP_VERSION ||
		JSON.stringify(topLevelKeys) !== JSON.stringify(expectedKeys)
	) {
		throw new Error(
			"Jianying export content does not match the exact 11.3 beta 2 profile."
		);
	}
}

function sanitizeDraftName({ draftName }: { draftName: string }): string {
	const sanitized = draftName
		.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, 64);
	return sanitized.length > 0 ? sanitized : "QCut-Jianying-Export";
}

function isSameOrDescendant({
	candidatePath,
	parentPath,
}: {
	candidatePath: string;
	parentPath: string;
}): boolean {
	const relativePath = relative(parentPath, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

async function copyRegularFile({
	destinationPath,
	sourcePath,
}: {
	destinationPath: string;
	sourcePath: string;
}): Promise<void> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let sourceHandle: Awaited<ReturnType<typeof open>> | undefined;
	let destinationHandle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		sourceHandle = await open(sourcePath, constants.O_RDONLY | noFollowFlag);
		const before = await sourceHandle.stat({ bigint: true });
		if (!before.isFile())
			throw new Error("Jianying source entry is not a file.");
		await mkdir(dirname(destinationPath), { recursive: true });
		destinationHandle = await open(
			destinationPath,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
			Number(before.mode & 0o777n)
		);
		const activeSourceHandle = sourceHandle;
		const activeDestinationHandle = destinationHandle;
		const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
		const writeChunk = async ({
			bytes,
			offset,
		}: {
			bytes: number;
			offset: number;
		}): Promise<void> => {
			if (offset >= bytes) return;
			const { bytesWritten } = await activeDestinationHandle.write(
				buffer,
				offset,
				bytes - offset,
				null
			);
			if (bytesWritten <= 0) {
				throw new Error(
					"Jianying project copy stopped before writing a chunk."
				);
			}
			await writeChunk({ bytes, offset: offset + bytesWritten });
		};
		const copyNextChunk = async (): Promise<void> => {
			const { bytesRead } = await activeSourceHandle.read(
				buffer,
				0,
				buffer.length,
				null
			);
			if (bytesRead === 0) return;
			await writeChunk({ bytes: bytesRead, offset: 0 });
			await copyNextChunk();
		};
		await copyNextChunk();
		await destinationHandle.sync();
		const after = await sourceHandle.stat({ bigint: true });
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			before.size !== after.size ||
			before.mtimeNs !== after.mtimeNs
		) {
			throw new Error("Jianying source changed while it was copied.");
		}
	} finally {
		await Promise.all([
			sourceHandle?.close().catch(() => undefined),
			destinationHandle?.close().catch(() => undefined),
		]);
	}
}

async function writePreparedContent({
	contentBytes,
	destinationPath,
}: {
	contentBytes: Uint8Array;
	destinationPath: string;
}): Promise<void> {
	await mkdir(dirname(destinationPath), { recursive: true });
	const handle = await open(
		destinationPath,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
		0o600
	);
	try {
		await handle.writeFile(contentBytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function copyProjectFiles({
	contentBytes,
	source,
	stagingDirectory,
}: {
	contentBytes: Uint8Array;
	source: Jianying113ProjectSource;
	stagingDirectory: string;
}): Promise<void> {
	const copyWorker = async ({ index }: { index: number }): Promise<void> => {
		if (index >= source.fileRelativePaths.length) return;
		const relativePath = source.fileRelativePaths[index];
		if (relativePath === undefined) return;
		const destinationPath = join(stagingDirectory, ...relativePath.split("/"));
		if (relativePath === source.contentRelativePath) {
			await writePreparedContent({ contentBytes, destinationPath });
		} else {
			await copyRegularFile({
				destinationPath,
				sourcePath: join(
					source.projectRootRealPath,
					...relativePath.split("/")
				),
			});
		}
		await copyWorker({ index: index + COPY_WORKERS });
	};
	await Promise.all(
		Array.from({ length: COPY_WORKERS }, (_, index) => copyWorker({ index }))
	);
}

async function syncDirectory({
	directory,
}: {
	directory: string;
}): Promise<void> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(directory, constants.O_RDONLY);
		await handle.sync();
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

export async function writeJianying113ProjectExport({
	assertTargetAppClosed,
	contentBytes,
	draftName,
	expectedSourceSha256,
	outputParentDirectory,
	sourceProjectDirectory,
}: WriteJianying113ProjectExportOptions): Promise<Jianying113ProjectExportResult> {
	assertExactJianying113Content({ contentBytes });
	await assertTargetAppClosed({
		outputParentDirectory,
		sourceProjectDirectory,
	});
	const source = await inspectJianying113ProjectSource({
		expectedContentSha256: expectedSourceSha256,
		projectDirectory: sourceProjectDirectory,
	});
	const outputParentRealPath = await realpath(outputParentDirectory);
	if (
		isSameOrDescendant({
			candidatePath: outputParentRealPath,
			parentPath: source.projectRootRealPath,
		})
	) {
		throw new Error(
			"Jianying export destination cannot be inside the source project."
		);
	}
	const transactionId = randomUUID();
	const safeName = sanitizeDraftName({ draftName });
	const finalDirectory = resolve(
		outputParentRealPath,
		`${safeName}-qcut-${transactionId.slice(0, 8)}`
	);
	const stagingDirectory = resolve(
		outputParentRealPath,
		`.qcut-jianying-export-${transactionId}.tmp`
	);
	if (
		isSameOrDescendant({
			candidatePath: finalDirectory,
			parentPath: source.projectRootRealPath,
		}) ||
		isSameOrDescendant({
			candidatePath: stagingDirectory,
			parentPath: source.projectRootRealPath,
		})
	) {
		throw new Error("Jianying export paths overlap the source project.");
	}

	try {
		await mkdir(stagingDirectory, { recursive: false });
		await copyProjectFiles({ contentBytes, source, stagingDirectory });
		const sourceAfterCopy = await inspectJianying113ProjectSource({
			expectedContentSha256: expectedSourceSha256,
			projectDirectory: source.projectRootRealPath,
		});
		if (
			JSON.stringify(sourceAfterCopy.fileRelativePaths) !==
			JSON.stringify(source.fileRelativePaths)
		) {
			throw new Error("Jianying source tree changed while it was copied.");
		}
		const stagedContentPath = join(
			stagingDirectory,
			...source.contentRelativePath.split("/")
		);
		const stagedContent = await readFile(stagedContentPath);
		assertExactJianying113Content({ contentBytes: stagedContent });
		const contentSha256 = createHash("sha256")
			.update(stagedContent)
			.digest("hex");
		await assertTargetAppClosed({
			outputParentDirectory: outputParentRealPath,
			sourceProjectDirectory: source.projectRootRealPath,
		});
		await syncDirectory({ directory: stagingDirectory });
		await rename(stagingDirectory, finalDirectory);
		await syncDirectory({ directory: outputParentRealPath });
		return {
			contentRelativePath: source.contentRelativePath,
			contentSha256,
			copiedFileCount: source.fileRelativePaths.length,
			outputDirectory: finalDirectory,
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
			subdraftId: source.subdraftId,
		};
	} catch (error) {
		await rm(stagingDirectory, { recursive: true, force: true });
		throw error;
	}
}

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import {
	access,
	mkdir,
	open,
	realpath,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import {
	dirname,
	isAbsolute,
	join,
	posix,
	relative,
	resolve,
	sep,
} from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import {
	buildJianyingDraft,
	type JianyingDraftAssetCopy,
	type JianyingDraftBuildResult,
	type JianyingDraftIssue,
	type JianyingDraftMediaType,
	type JianyingDraftTargetPlatform,
	type QCutDraftExportMedia,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";

const COMPLETE_MARKER_FILE_NAME = "QCUT_EXPORT_COMPLETE.json";
const COPY_BUFFER_BYTES = 1024 * 1024;
const DEFAULT_FFPROBE_TIMEOUT_MILLISECONDS = 15_000;
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";
const EXPORT_MANIFEST_FILE_NAME = "qcut-export-manifest.json";
const MAX_CONCURRENT_ASSET_COPIES = 4;
const MAX_FFPROBE_OUTPUT_BYTES = 1024 * 1024;
const MAX_DURATION_TOLERANCE_SECONDS = 0.25;
const MIN_DURATION_TOLERANCE_SECONDS = 0.05;
const execFileAsync = promisify(execFile);

export interface WriteStandaloneJianyingDraftOptions {
	acceptedWarningFingerprints?: string[];
	createdAtUnixSeconds?: number;
	draftName: string;
	ffprobePath: string;
	ffprobeTimeoutMilliseconds?: number;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export interface JianyingDraftAssetProbeStream {
	codecName?: string;
	codecType: "audio" | "video";
	height?: number;
	width?: number;
}

export interface JianyingDraftAssetProbe {
	durationSeconds?: number;
	formatName?: string;
	streams: JianyingDraftAssetProbeStream[];
}

export interface CopiedJianyingDraftAsset {
	bytes: number;
	materialId: string;
	mediaId: string;
	probe: JianyingDraftAssetProbe;
	relativePath: string;
	sha256: string;
	type: JianyingDraftMediaType;
}

export type StandaloneJianyingDraftDurability =
	| "best-effort"
	| "fsync-complete";

export interface StandaloneJianyingDraftWriteResult {
	buildResult: JianyingDraftBuildResult;
	completeMarkerPath: string;
	contentPath: string;
	copiedAssets: CopiedJianyingDraftAsset[];
	durability: StandaloneJianyingDraftDurability;
	durabilityWarning?: string;
	durabilityWarnings: string[];
	manifestPath: string;
	outputDirectory: string;
}

interface ExportAllocation {
	finalDirectory: string;
	stagingDirectory: string;
}

interface FileState {
	ctimeNanoseconds: bigint;
	device: bigint;
	inode: bigint;
	modifiedNanoseconds: bigint;
	size: bigint;
}

interface DirectorySyncResult {
	warning?: string;
}

function sanitizeDraftDirectoryName({
	draftName,
}: {
	draftName: string;
}): string {
	const sanitized = draftName
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 64);
	return sanitized || "QCut-JianYing-Draft";
}

function isInsideJianyingDraftStore({
	directory,
}: {
	directory: string;
}): boolean {
	return resolve(directory)
		.split(/[\\/]+/)
		.some(
			(part) => part.toLowerCase() === DRAFT_STORE_DIRECTORY_NAME.toLowerCase()
		);
}

function isSameOrDescendantPath({
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

export function validateStandaloneAssetRelativePath({
	relativePath,
}: {
	relativePath: string;
}): void {
	const normalized = posix.normalize(relativePath);
	const isSafeAssetPath =
		relativePath.length > 0 &&
		!relativePath.includes("\\") &&
		!posix.isAbsolute(relativePath) &&
		normalized === relativePath &&
		normalized.startsWith("assets/") &&
		!normalized.split("/").includes("..");
	if (!isSafeAssetPath) {
		throw new Error(`Unsafe JianYing asset path: ${relativePath}`);
	}
}

export function createJianyingDraftIssueFingerprint({
	issue,
}: {
	issue: JianyingDraftIssue;
}): string {
	return [
		issue.code,
		issue.elementId ?? "",
		issue.trackId ?? "",
		issue.mediaId ?? "",
		issue.message,
	].join("\u001f");
}

function assertAcceptedWarnings({
	acceptedWarningFingerprints,
	buildResult,
}: {
	acceptedWarningFingerprints: string[];
	buildResult: JianyingDraftBuildResult;
}): void {
	const requiredFingerprints = buildResult.issues
		.filter(({ severity }) => severity === "warning")
		.map((issue) => createJianyingDraftIssueFingerprint({ issue }))
		.sort();
	const acceptedFingerprints = [...acceptedWarningFingerprints].sort();
	if (
		JSON.stringify(requiredFingerprints) !==
		JSON.stringify(acceptedFingerprints)
	) {
		throw new Error(
			`JianYing draft export requires exact warning acceptance: ${JSON.stringify(requiredFingerprints)}`
		);
	}
}

function getNodeErrorCode({ value }: { value: unknown }): string | undefined {
	if (!(value instanceof Error) || !("code" in value)) return undefined;
	const code = (value as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function getErrorMessage({ value }: { value: unknown }): string {
	return value instanceof Error ? value.message : String(value);
}

async function closeFileHandle({
	handle,
}: {
	handle: Awaited<ReturnType<typeof open>> | undefined;
}): Promise<void> {
	if (!handle) return;
	try {
		await handle.close();
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "EBADF") {
			throw error;
		}
	}
}

function getFileState({ metadata }: { metadata: BigIntStats }): FileState {
	return {
		ctimeNanoseconds: metadata.ctimeNs,
		device: metadata.dev,
		inode: metadata.ino,
		modifiedNanoseconds: metadata.mtimeNs,
		size: metadata.size,
	};
}

function assertSameFileIdentity({
	actual,
	expected,
	sourcePath,
}: {
	actual: FileState;
	expected: FileState;
	sourcePath: string;
}): void {
	if (actual.device !== expected.device || actual.inode !== expected.inode) {
		throw new Error(
			`JianYing asset source changed while opening: ${sourcePath}`
		);
	}
}

function assertSourceUnchanged({
	afterCopy,
	beforeCopy,
	sourcePath,
}: {
	afterCopy: FileState;
	beforeCopy: FileState;
	sourcePath: string;
}): void {
	const changed =
		afterCopy.size !== beforeCopy.size ||
		afterCopy.modifiedNanoseconds !== beforeCopy.modifiedNanoseconds ||
		afterCopy.ctimeNanoseconds !== beforeCopy.ctimeNanoseconds;
	if (changed) {
		throw new Error(
			`JianYing asset source changed while copying: ${sourcePath}`
		);
	}
}

async function writeEntireBuffer({
	buffer,
	destinationHandle,
	offset = 0,
}: {
	buffer: Buffer;
	destinationHandle: Awaited<ReturnType<typeof open>>;
	offset?: number;
}): Promise<void> {
	if (offset >= buffer.length) return;
	const { bytesWritten } = await destinationHandle.write(
		buffer,
		offset,
		buffer.length - offset,
		null
	);
	if (bytesWritten <= 0) {
		throw new Error(
			"JianYing asset copy stopped before the buffer was written."
		);
	}
	await writeEntireBuffer({
		buffer,
		destinationHandle,
		offset: offset + bytesWritten,
	});
}

async function copyFileContentsAndHash({
	destinationHandle,
	sourceHandle,
}: {
	destinationHandle: Awaited<ReturnType<typeof open>>;
	sourceHandle: Awaited<ReturnType<typeof open>>;
}): Promise<string> {
	const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
	const hash = createHash("sha256");
	const copyNextChunk = async (): Promise<void> => {
		const { bytesRead } = await sourceHandle.read(
			buffer,
			0,
			buffer.length,
			null
		);
		if (bytesRead === 0) return;
		const chunk = buffer.subarray(0, bytesRead);
		hash.update(chunk);
		await writeEntireBuffer({
			buffer: chunk,
			destinationHandle,
		});
		await copyNextChunk();
	};
	await copyNextChunk();
	return hash.digest("hex");
}

async function calculateFileSha256({
	filePath,
}: {
	filePath: string;
}): Promise<string> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	const hash = createHash("sha256");
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(filePath, constants.O_RDONLY | noFollowFlag);
		await pipeline(handle.createReadStream(), hash);
		return hash.digest("hex");
	} finally {
		await closeFileHandle({ handle });
	}
}

function getRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: undefined;
}

function getOptionalString({ value }: { value: unknown }): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getOptionalPositiveNumber({
	value,
}: {
	value: unknown;
}): number | undefined {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number.parseFloat(value)
				: Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeProbeStream({
	value,
}: {
	value: unknown;
}): JianyingDraftAssetProbeStream | undefined {
	const streamRecord = getRecord({ value });
	if (!streamRecord) return undefined;
	const codecType = streamRecord.codec_type;
	if (codecType !== "audio" && codecType !== "video") return undefined;
	const codecName = getOptionalString({ value: streamRecord.codec_name });
	const height = getOptionalPositiveNumber({ value: streamRecord.height });
	const width = getOptionalPositiveNumber({ value: streamRecord.width });
	return {
		...(codecName === undefined ? {} : { codecName }),
		codecType,
		...(height === undefined ? {} : { height }),
		...(width === undefined ? {} : { width }),
	};
}

function normalizeProbeOutput({
	output,
}: {
	output: unknown;
}): JianyingDraftAssetProbe {
	const outputRecord = getRecord({ value: output });
	if (!outputRecord) {
		throw new Error("FFprobe returned a non-object payload.");
	}
	const rawStreams = Array.isArray(outputRecord.streams)
		? outputRecord.streams
		: [];
	const streams: JianyingDraftAssetProbeStream[] = [];
	const streamDurations: number[] = [];
	for (const rawStream of rawStreams) {
		const stream = normalizeProbeStream({ value: rawStream });
		if (stream) streams.push(stream);
		const streamRecord = getRecord({ value: rawStream });
		if (streamRecord) {
			const duration = getOptionalPositiveNumber({
				value: streamRecord.duration,
			});
			if (duration !== undefined) streamDurations.push(duration);
		}
	}
	const rawFormat = getRecord({ value: outputRecord.format });
	const formatDuration = getOptionalPositiveNumber({
		value: rawFormat?.duration,
	});
	const durationSeconds =
		formatDuration ??
		(streamDurations.length > 0 ? Math.max(...streamDurations) : undefined);
	const formatName = getOptionalString({ value: rawFormat?.format_name });
	return {
		...(durationSeconds === undefined ? {} : { durationSeconds }),
		...(formatName === undefined ? {} : { formatName }),
		streams,
	};
}

function assertProbeMatchesAsset({
	asset,
	media,
	probe,
}: {
	asset: JianyingDraftAssetCopy;
	media: QCutDraftExportMedia;
	probe: JianyingDraftAssetProbe;
}): void {
	if (media.id !== asset.mediaId || media.type !== asset.type) {
		throw new Error(
			`Snapshot media does not match JianYing asset ${asset.relativePath}.`
		);
	}
	const audioStreams = probe.streams.filter(
		({ codecType }) => codecType === "audio"
	);
	const videoStreams = probe.streams.filter(
		({ codecType }) => codecType === "video"
	);
	if (media.type === "audio" && audioStreams.length === 0) {
		throw new Error(
			`FFprobe found no audio stream for JianYing asset: ${asset.relativePath}`
		);
	}
	if (media.type !== "audio") {
		// Snapshot dimensions are encoded-pixel dimensions; display rotation is
		// intentionally not inferred without probing rotation metadata.
		const hasMatchingVideoStream = videoStreams.some(
			({ height, width }) => height === media.height && width === media.width
		);
		if (!hasMatchingVideoStream) {
			throw new Error(
				`FFprobe dimensions do not match snapshot media ${media.id}: expected ${media.width}x${media.height}.`
			);
		}
	}
	if (media.type !== "image" && probe.durationSeconds === undefined) {
		throw new Error(
			`FFprobe found no positive duration for JianYing asset: ${asset.relativePath}`
		);
	}
	if (media.type !== "image" && probe.durationSeconds !== undefined) {
		const toleranceSeconds = Math.min(
			MAX_DURATION_TOLERANCE_SECONDS,
			Math.max(MIN_DURATION_TOLERANCE_SECONDS, media.duration * 0.001)
		);
		if (Math.abs(probe.durationSeconds - media.duration) > toleranceSeconds) {
			throw new Error(
				`FFprobe duration does not match snapshot media ${media.id}: expected ${media.duration}s, received ${probe.durationSeconds}s (tolerance ${toleranceSeconds}s).`
			);
		}
	}
}

async function probeAsset({
	asset,
	ffprobePath,
	ffprobeTimeoutMilliseconds,
	filePath,
	media,
}: {
	asset: JianyingDraftAssetCopy;
	ffprobePath: string;
	ffprobeTimeoutMilliseconds: number;
	filePath: string;
	media: QCutDraftExportMedia;
}): Promise<JianyingDraftAssetProbe> {
	let stdout: string;
	try {
		const result = await execFileAsync(
			ffprobePath,
			[
				"-v",
				"error",
				"-show_entries",
				"format=duration,format_name:stream=codec_type,codec_name,width,height,duration",
				"-of",
				"json",
				filePath,
			],
			{
				encoding: "utf8",
				maxBuffer: MAX_FFPROBE_OUTPUT_BYTES,
				timeout: ffprobeTimeoutMilliseconds,
			}
		);
		stdout = String(result.stdout);
	} catch (error) {
		const errorRecord = getRecord({ value: error });
		const stderr =
			errorRecord && typeof errorRecord.stderr === "string"
				? errorRecord.stderr.trim().slice(0, 500)
				: "";
		const detail = stderr || getErrorMessage({ value: error });
		throw new Error(
			`FFprobe rejected JianYing asset ${asset.relativePath}: ${detail}`
		);
	}

	let output: unknown;
	try {
		output = JSON.parse(stdout);
	} catch (error) {
		throw new Error(
			`FFprobe returned invalid JSON for JianYing asset ${asset.relativePath}: ${getErrorMessage({ value: error })}`
		);
	}
	const probe = normalizeProbeOutput({ output });
	assertProbeMatchesAsset({ asset, media, probe });
	return probe;
}

async function copyAsset({
	asset,
	ffprobePath,
	ffprobeTimeoutMilliseconds,
	media,
	stagingDirectory,
}: {
	asset: JianyingDraftAssetCopy;
	ffprobePath: string;
	ffprobeTimeoutMilliseconds: number;
	media: QCutDraftExportMedia;
	stagingDirectory: string;
}): Promise<CopiedJianyingDraftAsset> {
	validateStandaloneAssetRelativePath({ relativePath: asset.relativePath });
	const canonicalSourcePath = await realpath(asset.sourcePath);
	if (
		isSameOrDescendantPath({
			candidatePath: canonicalSourcePath,
			parentPath: stagingDirectory,
		})
	) {
		throw new Error(
			`JianYing asset source cannot be inside the export staging directory: ${asset.sourcePath}`
		);
	}
	const canonicalMetadata = await stat(canonicalSourcePath, {
		bigint: true,
	});
	if (!canonicalMetadata.isFile()) {
		throw new Error(
			`JianYing asset source must resolve to a regular file: ${asset.sourcePath}`
		);
	}

	const destinationPath = join(
		stagingDirectory,
		...asset.relativePath.split("/")
	);
	await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });

	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let sourceHandle: Awaited<ReturnType<typeof open>> | undefined;
	let destinationHandle: Awaited<ReturnType<typeof open>> | undefined;
	let sourceSha256: string;
	let bytes: number;
	try {
		sourceHandle = await open(
			canonicalSourcePath,
			constants.O_RDONLY | noFollowFlag
		);
		const openedSourceMetadata = await sourceHandle.stat({ bigint: true });
		const canonicalState = getFileState({ metadata: canonicalMetadata });
		const openedSourceState = getFileState({
			metadata: openedSourceMetadata,
		});
		assertSameFileIdentity({
			actual: openedSourceState,
			expected: canonicalState,
			sourcePath: asset.sourcePath,
		});
		if (!openedSourceMetadata.isFile()) {
			throw new Error(
				`JianYing asset source must be a regular file: ${asset.sourcePath}`
			);
		}

		destinationHandle = await open(destinationPath, "wx", 0o600);
		sourceSha256 = await copyFileContentsAndHash({
			destinationHandle,
			sourceHandle,
		});
		await destinationHandle.sync();

		const afterCopySourceState = getFileState({
			metadata: await sourceHandle.stat({ bigint: true }),
		});
		assertSourceUnchanged({
			afterCopy: afterCopySourceState,
			beforeCopy: openedSourceState,
			sourcePath: asset.sourcePath,
		});
		const destinationMetadata = await destinationHandle.stat({
			bigint: true,
		});
		if (destinationMetadata.size !== openedSourceMetadata.size) {
			throw new Error(
				`JianYing asset copy is incomplete: ${asset.relativePath}`
			);
		}
		if (destinationMetadata.size > BigInt(Number.MAX_SAFE_INTEGER)) {
			throw new Error(
				`JianYing asset is too large to report safely: ${asset.relativePath}`
			);
		}
		bytes = Number(destinationMetadata.size);
	} finally {
		await closeFileHandle({ handle: destinationHandle });
		await closeFileHandle({ handle: sourceHandle });
	}

	const destinationSha256 = await calculateFileSha256({
		filePath: destinationPath,
	});
	if (destinationSha256 !== sourceSha256) {
		throw new Error(
			`JianYing asset SHA-256 mismatch after copy: ${asset.relativePath}`
		);
	}
	const probe = await probeAsset({
		asset,
		ffprobePath,
		ffprobeTimeoutMilliseconds,
		filePath: destinationPath,
		media,
	});
	return {
		bytes,
		materialId: asset.materialId,
		mediaId: asset.mediaId,
		probe,
		relativePath: asset.relativePath,
		sha256: destinationSha256,
		type: asset.type,
	};
}

async function copyAssets({
	assets,
	ffprobePath,
	ffprobeTimeoutMilliseconds,
	mediaById,
	stagingDirectory,
}: {
	assets: JianyingDraftAssetCopy[];
	ffprobePath: string;
	ffprobeTimeoutMilliseconds: number;
	mediaById: ReadonlyMap<string, QCutDraftExportMedia>;
	stagingDirectory: string;
}): Promise<CopiedJianyingDraftAsset[]> {
	if (assets.length === 0) return [];
	const copiedAssets: Array<CopiedJianyingDraftAsset | undefined> = new Array(
		assets.length
	);
	let nextAssetIndex = 0;

	const copyNextAsset = async (): Promise<void> => {
		const assetIndex = nextAssetIndex;
		nextAssetIndex += 1;
		const asset = assets[assetIndex];
		if (!asset) return;
		const media = mediaById.get(asset.mediaId);
		if (!media) {
			throw new Error(
				`JianYing asset references missing snapshot media: ${asset.mediaId}`
			);
		}
		copiedAssets[assetIndex] = await copyAsset({
			asset,
			ffprobePath,
			ffprobeTimeoutMilliseconds,
			media,
			stagingDirectory,
		});
		await copyNextAsset();
	};

	const workers = Array.from(
		{ length: Math.min(MAX_CONCURRENT_ASSET_COPIES, assets.length) },
		() => copyNextAsset()
	);
	const workerResults = await Promise.allSettled(workers);
	const failedWorker = workerResults.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	if (failedWorker) {
		throw failedWorker.reason instanceof Error
			? failedWorker.reason
			: new Error(String(failedWorker.reason));
	}
	return copiedAssets.flatMap((asset) => (asset ? [asset] : []));
}

async function writeAtomicUtf8File({
	content,
	directory,
	fileName,
}: {
	content: string;
	directory: string;
	fileName: string;
}): Promise<string> {
	const finalPath = join(directory, fileName);
	const temporaryPath = join(directory, `.${fileName}.${randomUUID()}.tmp`);
	const handle = await open(temporaryPath, "wx", 0o600);
	try {
		await handle.writeFile(content, "utf8");
		await handle.sync();
	} finally {
		await closeFileHandle({ handle });
	}
	await rename(temporaryPath, finalPath);
	return finalPath;
}

async function syncDirectory({
	directory,
}: {
	directory: string;
}): Promise<DirectorySyncResult> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(directory, "r");
		await handle.sync();
		return {};
	} catch (error) {
		const code = getNodeErrorCode({ value: error });
		if (
			code !== undefined &&
			["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code)
		) {
			return {
				warning: `Directory fsync is unsupported on this filesystem (${code}).`,
			};
		}
		throw error;
	} finally {
		await closeFileHandle({ handle });
	}
}

async function syncDraftDirectories({
	directories,
}: {
	directories: string[];
}): Promise<string[]> {
	const uniqueDirectories = [...new Set(directories)].sort(
		(left, right) => right.split(sep).length - left.split(sep).length
	);
	const results = await Promise.all(
		uniqueDirectories.map((directory) => syncDirectory({ directory }))
	);
	return results.flatMap(({ warning }) => (warning ? [warning] : []));
}

function getDirectoryHierarchy({
	directory,
	rootDirectory,
}: {
	directory: string;
	rootDirectory: string;
}): string[] {
	const resolvedDirectory = resolve(directory);
	const resolvedRootDirectory = resolve(rootDirectory);
	if (
		!isSameOrDescendantPath({
			candidatePath: resolvedDirectory,
			parentPath: resolvedRootDirectory,
		})
	) {
		throw new Error(
			`JianYing asset directory escaped export staging: ${directory}`
		);
	}
	if (resolvedDirectory === resolvedRootDirectory) {
		return [resolvedRootDirectory];
	}
	return [
		resolvedDirectory,
		...getDirectoryHierarchy({
			directory: dirname(resolvedDirectory),
			rootDirectory: resolvedRootDirectory,
		}),
	];
}

async function createExportAllocation({
	attempt = 0,
	outputParentDirectory,
	safeDraftName,
}: {
	attempt?: number;
	outputParentDirectory: string;
	safeDraftName: string;
}): Promise<ExportAllocation> {
	if (attempt >= 5) {
		throw new Error("Unable to allocate a unique JianYing export directory.");
	}
	const exportId = randomUUID();
	const finalDirectory = join(
		outputParentDirectory,
		`${safeDraftName}-${exportId}`
	);
	const stagingDirectory = join(
		outputParentDirectory,
		`.qcut-jianying-${exportId}.staging`
	);
	try {
		await access(finalDirectory, constants.F_OK);
		return createExportAllocation({
			attempt: attempt + 1,
			outputParentDirectory,
			safeDraftName,
		});
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "ENOENT") throw error;
	}
	try {
		await mkdir(stagingDirectory, { mode: 0o700 });
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "EEXIST") throw error;
		return createExportAllocation({
			attempt: attempt + 1,
			outputParentDirectory,
			safeDraftName,
		});
	}
	return { finalDirectory, stagingDirectory };
}

async function cleanupFailedExport({
	directory,
	outputParentDirectory,
}: {
	directory: string;
	outputParentDirectory: string;
}): Promise<void> {
	await rm(directory, { force: true, recursive: true });
	await syncDirectory({ directory: outputParentDirectory });
}

function validateProbeOptions({
	ffprobePath,
	ffprobeTimeoutMilliseconds,
}: {
	ffprobePath: string;
	ffprobeTimeoutMilliseconds: number;
}): void {
	if (typeof ffprobePath !== "string" || ffprobePath.trim().length === 0) {
		throw new Error("JianYing export requires a non-empty FFprobe path.");
	}
	if (
		!Number.isFinite(ffprobeTimeoutMilliseconds) ||
		ffprobeTimeoutMilliseconds <= 0 ||
		ffprobeTimeoutMilliseconds > 120_000
	) {
		throw new Error(
			"JianYing export FFprobe timeout must be between 1 and 120000 milliseconds."
		);
	}
}

export async function writeStandaloneJianyingDraft({
	acceptedWarningFingerprints = [],
	createdAtUnixSeconds = 0,
	draftName,
	ffprobePath,
	ffprobeTimeoutMilliseconds = DEFAULT_FFPROBE_TIMEOUT_MILLISECONDS,
	outputParentDirectory,
	snapshot,
	targetPlatform,
}: WriteStandaloneJianyingDraftOptions): Promise<StandaloneJianyingDraftWriteResult> {
	validateProbeOptions({ ffprobePath, ffprobeTimeoutMilliseconds });
	const parentMetadata = await stat(outputParentDirectory);
	if (!parentMetadata.isDirectory()) {
		throw new Error(
			`JianYing export parent is not a directory: ${outputParentDirectory}`
		);
	}
	const realOutputParent = await realpath(outputParentDirectory);
	if (isInsideJianyingDraftStore({ directory: realOutputParent })) {
		throw new Error(
			"Standalone JianYing export refuses to write inside an application draft store."
		);
	}
	await access(realOutputParent, constants.W_OK);

	const safeDraftName = sanitizeDraftDirectoryName({ draftName });
	const preflightResult = buildJianyingDraft({
		createdAtUnixSeconds,
		draftOutputDirectory: join(realOutputParent, `${safeDraftName}-pending`),
		snapshot,
		targetPlatform,
	});
	if (!preflightResult.canWrite) {
		const blockingIssues = preflightResult.issues
			.filter(({ severity }) => severity === "error")
			.map(({ code, message }) => `${code}: ${message}`)
			.join("\n");
		throw new Error(`JianYing draft export is blocked:\n${blockingIssues}`);
	}
	assertAcceptedWarnings({
		acceptedWarningFingerprints,
		buildResult: preflightResult,
	});

	const allocation = await createExportAllocation({
		outputParentDirectory: realOutputParent,
		safeDraftName,
	});
	let published = false;
	try {
		const initialParentDirectorySync = await syncDirectory({
			directory: realOutputParent,
		});
		const durabilityWarnings = initialParentDirectorySync.warning
			? [initialParentDirectorySync.warning]
			: [];
		const buildResult = buildJianyingDraft({
			createdAtUnixSeconds,
			draftOutputDirectory: allocation.finalDirectory,
			snapshot,
			targetPlatform,
		});
		if (!buildResult.canWrite) {
			throw new Error("JianYing draft became invalid after output allocation.");
		}
		assertAcceptedWarnings({
			acceptedWarningFingerprints,
			buildResult,
		});

		const copiedAssets = await copyAssets({
			assets: buildResult.assets,
			ffprobePath,
			ffprobeTimeoutMilliseconds,
			mediaById: new Map(snapshot.media.map((media) => [media.id, media])),
			stagingDirectory: allocation.stagingDirectory,
		});
		const stagingContentPath = await writeAtomicUtf8File({
			content: `${JSON.stringify(buildResult.content, null, 2)}\n`,
			directory: allocation.stagingDirectory,
			fileName: buildResult.compatibility.contentFileName,
		});
		const contentSha256 = await calculateFileSha256({
			filePath: stagingContentPath,
		});
		const stagingManifestPath = await writeAtomicUtf8File({
			content: `${JSON.stringify(
				{
					assets: copiedAssets,
					compatibility: buildResult.compatibility,
					contentFile: buildResult.compatibility.contentFileName,
					contentSha256,
					generator: "QCut",
					schemaVersion: 2,
				},
				null,
				2
			)}\n`,
			directory: allocation.stagingDirectory,
			fileName: EXPORT_MANIFEST_FILE_NAME,
		});
		const manifestSha256 = await calculateFileSha256({
			filePath: stagingManifestPath,
		});
		const assetDirectories = copiedAssets.flatMap(({ relativePath }) =>
			getDirectoryHierarchy({
				directory: dirname(
					join(allocation.stagingDirectory, ...relativePath.split("/"))
				),
				rootDirectory: allocation.stagingDirectory,
			})
		);
		durabilityWarnings.push(
			...(await syncDraftDirectories({
				directories: [allocation.stagingDirectory, ...assetDirectories],
			}))
		);
		await writeAtomicUtf8File({
			content: `${JSON.stringify(
				{
					assetCount: copiedAssets.length,
					contentFile: buildResult.compatibility.contentFileName,
					manifestFile: EXPORT_MANIFEST_FILE_NAME,
					manifestSha256,
					status: "complete",
				},
				null,
				2
			)}\n`,
			directory: allocation.stagingDirectory,
			fileName: COMPLETE_MARKER_FILE_NAME,
		});
		const markerDirectorySync = await syncDirectory({
			directory: allocation.stagingDirectory,
		});
		if (markerDirectorySync.warning) {
			durabilityWarnings.push(markerDirectorySync.warning);
		}

		await rename(allocation.stagingDirectory, allocation.finalDirectory);
		published = true;
		const parentDirectorySync = await syncDirectory({
			directory: realOutputParent,
		});
		if (parentDirectorySync.warning) {
			durabilityWarnings.push(parentDirectorySync.warning);
		}

		const uniqueDurabilityWarnings = [...new Set(durabilityWarnings)];
		const durability: StandaloneJianyingDraftDurability =
			uniqueDurabilityWarnings.length === 0 ? "fsync-complete" : "best-effort";
		return {
			buildResult,
			completeMarkerPath: join(
				allocation.finalDirectory,
				COMPLETE_MARKER_FILE_NAME
			),
			contentPath: join(
				allocation.finalDirectory,
				buildResult.compatibility.contentFileName
			),
			copiedAssets,
			durability,
			durabilityWarning: uniqueDurabilityWarnings[0],
			durabilityWarnings: uniqueDurabilityWarnings,
			manifestPath: join(allocation.finalDirectory, EXPORT_MANIFEST_FILE_NAME),
			outputDirectory: allocation.finalDirectory,
		};
	} catch (error) {
		const cleanupDirectory = published
			? allocation.finalDirectory
			: allocation.stagingDirectory;
		try {
			await cleanupFailedExport({
				directory: cleanupDirectory,
				outputParentDirectory: realOutputParent,
			});
		} catch (cleanupError) {
			throw new AggregateError(
				[error, cleanupError],
				"JianYing export failed and its partial output could not be removed."
			);
		}
		throw error;
	}
}

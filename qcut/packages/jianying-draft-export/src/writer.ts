import { randomUUID } from "node:crypto";
import { constants, createWriteStream } from "node:fs";
import {
	access,
	lstat,
	mkdir,
	mkdtemp,
	open,
	realpath,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
	buildJianyingDraft,
	type JianyingDraftAssetCopy,
	type JianyingDraftBuildResult,
	type JianyingDraftIssue,
	type JianyingDraftTargetPlatform,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";

const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";
const COMPLETE_MARKER_FILE_NAME = "QCUT_EXPORT_COMPLETE.json";
const EXPORT_MANIFEST_FILE_NAME = "qcut-export-manifest.json";

export interface WriteStandaloneJianyingDraftOptions {
	acceptedWarningFingerprints?: string[];
	createdAtUnixSeconds?: number;
	draftName: string;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export interface CopiedJianyingDraftAsset {
	bytes: number;
	materialId: string;
	relativePath: string;
}

export interface StandaloneJianyingDraftWriteResult {
	buildResult: JianyingDraftBuildResult;
	completeMarkerPath: string;
	contentPath: string;
	copiedAssets: CopiedJianyingDraftAsset[];
	durabilityWarning?: string;
	manifestPath: string;
	outputDirectory: string;
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
		.slice(0, 80);
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

async function copyAsset({
	asset,
	outputDirectory,
}: {
	asset: JianyingDraftAssetCopy;
	outputDirectory: string;
}): Promise<CopiedJianyingDraftAsset> {
	validateStandaloneAssetRelativePath({ relativePath: asset.relativePath });
	const sourceMetadata = await lstat(asset.sourcePath);
	if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile()) {
		throw new Error(
			`JianYing asset source must be a regular file: ${asset.sourcePath}`
		);
	}

	const destinationPath = join(
		outputDirectory,
		...asset.relativePath.split("/")
	);
	await mkdir(dirname(destinationPath), { recursive: true });

	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let sourceHandle: Awaited<ReturnType<typeof open>> | undefined;
	let destinationHandle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		sourceHandle = await open(
			asset.sourcePath,
			constants.O_RDONLY | noFollowFlag
		);
		const openedSourceMetadata = await sourceHandle.stat();
		if (
			!openedSourceMetadata.isFile() ||
			openedSourceMetadata.dev !== sourceMetadata.dev ||
			openedSourceMetadata.ino !== sourceMetadata.ino
		) {
			throw new Error(
				`JianYing asset source changed while opening: ${asset.sourcePath}`
			);
		}

		await pipeline(
			sourceHandle.createReadStream(),
			createWriteStream(destinationPath, { flags: "wx", mode: 0o600 })
		);
		destinationHandle = await open(destinationPath, "r+");
		await destinationHandle.sync();
		const destinationMetadata = await destinationHandle.stat();
		if (destinationMetadata.size !== openedSourceMetadata.size) {
			throw new Error(
				`JianYing asset copy is incomplete: ${asset.relativePath}`
			);
		}
		return {
			bytes: openedSourceMetadata.size,
			materialId: asset.materialId,
			relativePath: asset.relativePath,
		};
	} finally {
		await closeFileHandle({ handle: destinationHandle });
		await closeFileHandle({ handle: sourceHandle });
	}
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

async function syncDirectoryBestEffort({
	directory,
}: {
	directory: string;
}): Promise<void> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(directory, "r");
		await handle.sync();
	} catch (error) {
		const code = getNodeErrorCode({ value: error });
		if (code === undefined || !["EINVAL", "ENOTSUP", "EPERM"].includes(code)) {
			throw error;
		}
	} finally {
		await closeFileHandle({ handle });
	}
}

function getSettledAssetCopies({
	results,
}: {
	results: PromiseSettledResult<CopiedJianyingDraftAsset>[];
}): CopiedJianyingDraftAsset[] {
	const failedResult = results.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	if (failedResult) {
		throw failedResult.reason instanceof Error
			? failedResult.reason
			: new Error(String(failedResult.reason));
	}
	return results.flatMap((result) =>
		result.status === "fulfilled" ? [result.value] : []
	);
}

function getErrorMessage({ value }: { value: unknown }): string {
	return value instanceof Error ? value.message : String(value);
}

export async function writeStandaloneJianyingDraft({
	acceptedWarningFingerprints = [],
	createdAtUnixSeconds = 0,
	draftName,
	outputParentDirectory,
	snapshot,
	targetPlatform,
}: WriteStandaloneJianyingDraftOptions): Promise<StandaloneJianyingDraftWriteResult> {
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

	const outputDirectory = await mkdtemp(
		join(realOutputParent, `${safeDraftName}-`)
	);
	let committed = false;
	try {
		const buildResult = buildJianyingDraft({
			createdAtUnixSeconds,
			draftOutputDirectory: outputDirectory,
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
		const copyResults = await Promise.allSettled(
			buildResult.assets.map((asset) => copyAsset({ asset, outputDirectory }))
		);
		const copiedAssets = getSettledAssetCopies({ results: copyResults });
		const contentPath = await writeAtomicUtf8File({
			content: `${JSON.stringify(buildResult.content, null, 2)}\n`,
			directory: outputDirectory,
			fileName: buildResult.compatibility.contentFileName,
		});
		const manifestPath = await writeAtomicUtf8File({
			content: `${JSON.stringify(
				{
					assets: copiedAssets,
					compatibility: buildResult.compatibility,
					contentFile: buildResult.compatibility.contentFileName,
					generator: "QCut",
					schemaVersion: 1,
				},
				null,
				2
			)}\n`,
			directory: outputDirectory,
			fileName: EXPORT_MANIFEST_FILE_NAME,
		});
		await syncDirectoryBestEffort({ directory: outputDirectory });
		const completeMarkerPath = await writeAtomicUtf8File({
			content: `${JSON.stringify(
				{
					contentFile: buildResult.compatibility.contentFileName,
					status: "complete",
				},
				null,
				2
			)}\n`,
			directory: outputDirectory,
			fileName: COMPLETE_MARKER_FILE_NAME,
		});
		committed = true;
		let durabilityWarning: string | undefined;
		try {
			await syncDirectoryBestEffort({ directory: outputDirectory });
			await syncDirectoryBestEffort({ directory: realOutputParent });
		} catch (error) {
			durabilityWarning = getErrorMessage({ value: error });
		}

		return {
			buildResult,
			completeMarkerPath,
			contentPath,
			copiedAssets,
			durabilityWarning,
			manifestPath,
			outputDirectory,
		};
	} catch (error) {
		if (!committed) {
			await rm(outputDirectory, { force: true, recursive: true });
		}
		throw error;
	}
}

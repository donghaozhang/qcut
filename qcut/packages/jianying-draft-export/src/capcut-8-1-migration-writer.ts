import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
	buildCapCut81ActiveContentMirrorPaths,
	buildCapCut81Draft,
	type CapCut81DraftBuildResult,
	type CapCut81DraftContent,
	type CapCut81GeneratedLutAsset,
	type JianyingDraftBuildResult,
	type JianyingDraftTargetPlatform,
	type QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import {
	cleanupCapCut81Bundle,
	createCapCut81BundleAllocation,
	publishCapCut81Bundle,
	syncCapCut81BundleDirectories,
	writeCapCut81BundleFile,
} from "./capcut-8-1-bundle-filesystem.js";
import {
	type CapCut81FfprobeVersion,
	requireCapCut81Ffprobe,
} from "./capcut-8-1-ffprobe.js";
import { buildCapCut81MigrationScaffold } from "./capcut-8-1-migration-scaffold.js";
import {
	type CopiedJianyingDraftAsset,
	createJianyingDraftIssueFingerprint,
	type StandaloneJianyingDraftDurability,
	writeStandaloneJianyingDraft,
} from "./writer.js";

const COMPLETE_MARKER_FILE_NAME = "QCUT_EXPORT_COMPLETE.json";
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";
const EXPORT_MANIFEST_FILE_NAME = "qcut-capcut-migration-manifest.json";

/**
 * Trusted main-process options. Renderer-owned values must pass through
 * `CapCut81MigrationExportSession` instead of calling the writer directly.
 */
export interface WriteTrustedCapCut81MigrationBundleOptions {
	acceptedWarningFingerprints?: string[];
	createdAtUnixSeconds?: number;
	draftName: string;
	ffprobePath: string;
	ffprobeTimeoutMilliseconds?: number;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export interface CapCut81MigrationBundleIds {
	draftId: string;
	placeholderId: string;
	projectId: string;
	timelineId: string;
}

export interface CapCut81MigrationBundleWriteResult {
	buildResult: JianyingDraftBuildResult;
	completeMarkerPath: string;
	content: CapCut81DraftContent;
	contentBackupPaths: readonly [string, string];
	contentMirrorPaths: readonly [string, string, string, string];
	contentSha256: string;
	copiedAssets: CopiedJianyingDraftAsset[];
	draftDirectory: string;
	draftFolderName: string;
	draftStoreDirectory: string;
	durability: StandaloneJianyingDraftDurability;
	durabilityWarnings: string[];
	ffprobeVersion: CapCut81FfprobeVersion;
	generatedAssets: WrittenCapCut81GeneratedAsset[];
	ids: CapCut81MigrationBundleIds;
	manifestPath: string;
	outputDirectory: string;
	scaffoldPaths: string[];
	timelineMaterialsSize: number;
}

export interface WrittenCapCut81GeneratedAsset {
	bytes: number;
	effectMaterialId: string;
	kind: CapCut81GeneratedLutAsset["kind"];
	relativePath: string;
	sha256: string;
}

function sanitizeName({
	fallback,
	maximumLength,
	value,
}: {
	fallback: string;
	maximumLength: number;
	value: string;
}): string {
	const sanitized = value
		.normalize("NFC")
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maximumLength);
	return sanitized || fallback;
}

function createSha256({ content }: { content: string }): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

function calculateTimelineMaterialsSize({
	contentBytes,
	copiedAssets,
	generatedAssets,
}: {
	contentBytes: number;
	copiedAssets: CopiedJianyingDraftAsset[];
	generatedAssets: WrittenCapCut81GeneratedAsset[];
}): number {
	let size = contentBytes;
	for (const asset of [...copiedAssets, ...generatedAssets]) {
		size += asset.bytes;
		if (!Number.isSafeInteger(size)) {
			throw new Error(
				"CapCut timeline material size exceeds JavaScript safe integers."
			);
		}
	}
	return size;
}

function getBaseBuildWarningFingerprints({
	buildResult,
}: {
	buildResult: JianyingDraftBuildResult;
}): string[] {
	return buildResult.issues
		.filter(({ severity }) => severity === "warning")
		.map((issue) => createJianyingDraftIssueFingerprint({ issue }));
}

function assertAcceptedCapCutWarnings({
	acceptedWarningFingerprints,
	issues,
}: {
	acceptedWarningFingerprints: readonly string[];
	issues: CapCut81DraftBuildResult["issues"];
}): void {
	const requiredFingerprints = issues
		.filter(({ severity }) => severity === "warning")
		.map((issue) => createJianyingDraftIssueFingerprint({ issue }))
		.sort();
	const acceptedFingerprints = [...acceptedWarningFingerprints].sort();
	if (
		JSON.stringify(requiredFingerprints) !==
		JSON.stringify(acceptedFingerprints)
	) {
		throw new Error(
			`CapCut 8.1 migration requires exact warning acceptance: ${JSON.stringify(requiredFingerprints)}`
		);
	}
}

async function writeGeneratedAssets({
	assets,
	draftRelativePath,
	rootDirectory,
}: {
	assets: CapCut81GeneratedLutAsset[];
	draftRelativePath: string;
	rootDirectory: string;
}): Promise<{
	relativePaths: string[];
	writtenAssets: WrittenCapCut81GeneratedAsset[];
}> {
	const seenPaths = new Set<string>();
	const writes = assets.map(async (asset) => {
		if (
			!asset.relativePath.startsWith("assets/lut/") ||
			asset.relativePath.includes("\\") ||
			seenPaths.has(asset.relativePath)
		) {
			throw new Error(
				`Invalid or duplicate generated LUT path: ${asset.relativePath}`
			);
		}
		seenPaths.add(asset.relativePath);
		const relativePath = `${draftRelativePath}/${asset.relativePath}`;
		await writeCapCut81BundleFile({
			content: asset.content,
			relativePath,
			rootDirectory,
		});
		return {
			relativePath,
			written: {
				bytes: Buffer.byteLength(asset.content, "utf8"),
				effectMaterialId: asset.effectMaterialId,
				kind: asset.kind,
				relativePath: asset.relativePath,
				sha256: createSha256({ content: asset.content }),
			} satisfies WrittenCapCut81GeneratedAsset,
		};
	});
	const results = await Promise.all(writes);
	return {
		relativePaths: results.map(({ relativePath }) => relativePath),
		writtenAssets: results.map(({ written }) => written),
	};
}

function toAbsolutePaths({
	finalDirectory,
	relativePaths,
}: {
	finalDirectory: string;
	relativePaths: readonly string[];
}): string[] {
	return relativePaths.map((relativePath) =>
		join(finalDirectory, ...relativePath.split("/"))
	);
}

function collectDirectoryPaths({
	relativePaths,
	rootDirectory,
}: {
	relativePaths: readonly string[];
	rootDirectory: string;
}): string[] {
	const directories = new Set([rootDirectory]);
	for (const relativePath of relativePaths) {
		let directory = dirname(join(rootDirectory, ...relativePath.split("/")));
		while (relative(rootDirectory, directory) !== "") {
			directories.add(directory);
			const parent = dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	}
	return [...directories];
}

async function moveCopiedAssets({
	copiedAssets,
	draftRelativePath,
	standaloneOutputDirectory,
	stagingDirectory,
}: {
	copiedAssets: CopiedJianyingDraftAsset[];
	draftRelativePath: string;
	standaloneOutputDirectory: string;
	stagingDirectory: string;
}): Promise<string[]> {
	const assetDirectories = ["audio", "image", "video"].map((mediaType) =>
		join(stagingDirectory, ...draftRelativePath.split("/"), "assets", mediaType)
	);
	await Promise.all(
		assetDirectories.map((directory) =>
			mkdir(directory, { recursive: true, mode: 0o700 })
		)
	);
	const destinationRelativePaths = copiedAssets.map(
		(asset) => `${draftRelativePath}/${asset.relativePath}`
	);
	await Promise.all(
		copiedAssets.map((asset, index) => {
			const sourcePath = join(
				standaloneOutputDirectory,
				...asset.relativePath.split("/")
			);
			const destinationRelativePath = destinationRelativePaths[index];
			if (!destinationRelativePath) {
				throw new Error("CapCut asset destination allocation failed.");
			}
			return rename(
				sourcePath,
				join(stagingDirectory, ...destinationRelativePath.split("/"))
			);
		})
	);
	return destinationRelativePaths;
}

function buildManifest({
	contentBackupRelativePaths,
	contentBytes,
	contentMirrorRelativePaths,
	contentSha256,
	copiedAssets,
	generatedAssets,
	draftFolderName,
	durabilityWarnings,
	ffprobeVersion,
	ids,
	scaffoldRelativePaths,
	timelineMaterialsSize,
}: {
	contentBackupRelativePaths: readonly string[];
	contentBytes: number;
	contentMirrorRelativePaths: readonly string[];
	contentSha256: string;
	copiedAssets: CopiedJianyingDraftAsset[];
	generatedAssets: WrittenCapCut81GeneratedAsset[];
	draftFolderName: string;
	durabilityWarnings: string[];
	ffprobeVersion: CapCut81FfprobeVersion;
	ids: CapCut81MigrationBundleIds;
	scaffoldRelativePaths: string[];
	timelineMaterialsSize: number;
}): string {
	return `${JSON.stringify(
		{
			assets: copiedAssets.map((asset) => ({
				...asset,
				relativePath: `${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/${asset.relativePath}`,
			})),
			generatedAssets: generatedAssets.map((asset) => ({
				...asset,
				relativePath: `${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/${asset.relativePath}`,
			})),
			content: {
				activeMirrors: contentMirrorRelativePaths,
				backups: contentBackupRelativePaths,
				bytes: contentBytes,
				sha256: contentSha256,
			},
			durabilityWarnings,
			ffprobe: {
				major: ffprobeVersion.major,
				version: ffprobeVersion.version,
			},
			generator: "QCut",
			ids,
			profile: "capcut-desktop-8.1-plaintext",
			scaffoldFiles: scaffoldRelativePaths,
			schemaVersion: 1,
			storeDirectory: DRAFT_STORE_DIRECTORY_NAME,
			timelineMaterialsSize,
		},
		null,
		2
	)}\n`;
}

export async function writeTrustedCapCut81MigrationBundle({
	acceptedWarningFingerprints = [],
	createdAtUnixSeconds = Math.floor(Date.now() / 1000),
	draftName,
	ffprobePath,
	ffprobeTimeoutMilliseconds,
	outputParentDirectory,
	snapshot,
	targetPlatform,
}: WriteTrustedCapCut81MigrationBundleOptions): Promise<CapCut81MigrationBundleWriteResult> {
	const ffprobeVersion = await requireCapCut81Ffprobe({ ffprobePath });
	const safeDraftName = sanitizeName({
		fallback: "QCut CapCut Migration",
		maximumLength: 128,
		value: draftName,
	});
	const namedSnapshot: QCutDraftExportSnapshotV1 = {
		...snapshot,
		project: {
			...snapshot.project,
			name: safeDraftName,
		},
	};
	const bundleName = sanitizeName({
		fallback: "QCut-CapCut-Migration",
		maximumLength: 48,
		value: safeDraftName,
	});
	const allocation = await createCapCut81BundleAllocation({
		bundleName,
		outputParentDirectory,
	});
	let published = false;
	try {
		const ids: CapCut81MigrationBundleIds = {
			draftId: randomUUID(),
			placeholderId: randomUUID(),
			projectId: randomUUID(),
			timelineId: randomUUID(),
		};
		const draftFolderPrefix = sanitizeName({
			fallback: "qcut",
			maximumLength: 39,
			value: safeDraftName,
		});
		const draftFolderName = `${draftFolderPrefix}-${ids.draftId.slice(0, 8)}`;
		const storeRelativePath = DRAFT_STORE_DIRECTORY_NAME;
		const draftRelativePath = `${storeRelativePath}/${draftFolderName}`;
		const finalDraftStoreDirectory = join(
			allocation.finalDirectory,
			storeRelativePath
		);
		const finalDraftDirectory = join(finalDraftStoreDirectory, draftFolderName);
		const legacyReuseDirectory = join(
			allocation.stagingDirectory,
			".standalone-reuse"
		);
		await mkdir(legacyReuseDirectory, { mode: 0o700 });
		const capCutBuildResult = buildCapCut81Draft({
			createdAtUnixSeconds,
			draftOutputDirectory: finalDraftDirectory,
			placeholderId: ids.placeholderId,
			snapshot: namedSnapshot,
			targetPlatform,
			timelineId: ids.timelineId,
		});
		if (!(capCutBuildResult.canWrite && capCutBuildResult.content)) {
			const blockers = capCutBuildResult.issues
				.filter(({ severity }) => severity === "error")
				.map(({ code, message }) => `${code}: ${message}`)
				.join("\n");
			throw new Error(`CapCut 8.1 migration is blocked:\n${blockers}`);
		}
		assertAcceptedCapCutWarnings({
			acceptedWarningFingerprints,
			issues: capCutBuildResult.issues,
		});
		const baseBuildWarningFingerprints = getBaseBuildWarningFingerprints({
			buildResult: capCutBuildResult.baseBuildResult,
		});
		const standaloneResult = await writeStandaloneJianyingDraft({
			acceptedWarningFingerprints: baseBuildWarningFingerprints,
			createdAtUnixSeconds,
			draftName: "capcut-asset-validation",
			...(ffprobeTimeoutMilliseconds === undefined
				? {}
				: { ffprobeTimeoutMilliseconds }),
			ffprobePath,
			outputParentDirectory: legacyReuseDirectory,
			snapshot: capCutBuildResult.projectedSnapshot,
			targetPlatform,
		});
		const content = capCutBuildResult.content;
		const contentText = JSON.stringify(content);
		const contentBytes = Buffer.byteLength(contentText, "utf8");
		const contentSha256 = createSha256({ content: contentText });

		const assetRelativePaths = await moveCopiedAssets({
			copiedAssets: standaloneResult.copiedAssets,
			draftRelativePath,
			standaloneOutputDirectory: standaloneResult.outputDirectory,
			stagingDirectory: allocation.stagingDirectory,
		});
		const generatedAssetWrite = await writeGeneratedAssets({
			assets: capCutBuildResult.generatedAssets,
			draftRelativePath,
			rootDirectory: allocation.stagingDirectory,
		});
		const timelineMaterialsSize = calculateTimelineMaterialsSize({
			contentBytes,
			copiedAssets: standaloneResult.copiedAssets,
			generatedAssets: generatedAssetWrite.writtenAssets,
		});
		const scaffold = buildCapCut81MigrationScaffold({
			canvasHeight: namedSnapshot.project.height,
			createdAtMicroseconds: content.create_time,
			draftFolderName,
			draftId: ids.draftId,
			draftName: safeDraftName,
			durationMicroseconds: content.duration,
			finalBundleRootPath: finalDraftStoreDirectory,
			projectId: ids.projectId,
			timelineId: ids.timelineId,
			timelineMaterialsSize,
			updatedAtMicroseconds: content.update_time,
		});
		await rm(legacyReuseDirectory, { force: true, recursive: true });

		const activeContentRelativePaths = buildCapCut81ActiveContentMirrorPaths({
			timelineId: ids.timelineId,
		}).map((relativePath) => `${draftRelativePath}/${relativePath}`);
		const contentBackupRelativePaths = [
			`${draftRelativePath}/draft_info.json.bak`,
			`${draftRelativePath}/Timelines/${ids.timelineId}/draft_info.json.bak`,
		] as const;
		const allContentRelativePaths = [
			...activeContentRelativePaths,
			...contentBackupRelativePaths,
		];
		const scaffoldRelativePaths = [...scaffold.keys()].map(
			(relativePath) => `${storeRelativePath}/${relativePath}`
		);
		await Promise.all([
			...allContentRelativePaths.map((relativePath) =>
				writeCapCut81BundleFile({
					content: contentText,
					relativePath,
					rootDirectory: allocation.stagingDirectory,
				})
			),
			...[...scaffold.entries()].map(([relativePath, text]) =>
				writeCapCut81BundleFile({
					content: text,
					relativePath: `${storeRelativePath}/${relativePath}`,
					rootDirectory: allocation.stagingDirectory,
				})
			),
		]);
		const durableRelativePaths = [
			...assetRelativePaths,
			...generatedAssetWrite.relativePaths,
			...allContentRelativePaths,
			...scaffoldRelativePaths,
		];
		const durabilityWarnings = [
			...standaloneResult.durabilityWarnings,
			...(await syncCapCut81BundleDirectories({
				directories: collectDirectoryPaths({
					relativePaths: durableRelativePaths,
					rootDirectory: allocation.stagingDirectory,
				}),
			})),
		];
		const manifestText = buildManifest({
			contentBackupRelativePaths,
			contentBytes,
			contentMirrorRelativePaths: activeContentRelativePaths,
			contentSha256,
			copiedAssets: standaloneResult.copiedAssets,
			generatedAssets: generatedAssetWrite.writtenAssets,
			draftFolderName,
			durabilityWarnings,
			ffprobeVersion,
			ids,
			scaffoldRelativePaths,
			timelineMaterialsSize,
		});
		await writeCapCut81BundleFile({
			content: manifestText,
			relativePath: EXPORT_MANIFEST_FILE_NAME,
			rootDirectory: allocation.stagingDirectory,
		});
		const manifestSha256 = createSha256({ content: manifestText });
		await syncCapCut81BundleDirectories({
			directories: [allocation.stagingDirectory],
		});
		await writeCapCut81BundleFile({
			content: `${JSON.stringify(
				{
					assetCount:
						standaloneResult.copiedAssets.length +
						generatedAssetWrite.writtenAssets.length,
					contentSha256,
					manifestFile: EXPORT_MANIFEST_FILE_NAME,
					manifestSha256,
					status: "complete",
					timelineMaterialsSize,
				},
				null,
				2
			)}\n`,
			relativePath: COMPLETE_MARKER_FILE_NAME,
			rootDirectory: allocation.stagingDirectory,
		});
		await syncCapCut81BundleDirectories({
			directories: [allocation.stagingDirectory],
		});
		durabilityWarnings.push(...(await publishCapCut81Bundle({ allocation })));
		published = true;

		const contentMirrorPaths = toAbsolutePaths({
			finalDirectory: allocation.finalDirectory,
			relativePaths: activeContentRelativePaths,
		}) as [string, string, string, string];
		const contentBackupPaths = toAbsolutePaths({
			finalDirectory: allocation.finalDirectory,
			relativePaths: contentBackupRelativePaths,
		}) as [string, string];
		const uniqueDurabilityWarnings = [...new Set(durabilityWarnings)];
		return {
			buildResult: capCutBuildResult.baseBuildResult,
			completeMarkerPath: join(
				allocation.finalDirectory,
				COMPLETE_MARKER_FILE_NAME
			),
			content,
			contentBackupPaths,
			contentMirrorPaths,
			contentSha256,
			copiedAssets: standaloneResult.copiedAssets,
			draftDirectory: finalDraftDirectory,
			draftFolderName,
			draftStoreDirectory: finalDraftStoreDirectory,
			durability:
				uniqueDurabilityWarnings.length === 0
					? "fsync-complete"
					: "best-effort",
			durabilityWarnings: uniqueDurabilityWarnings,
			ffprobeVersion,
			generatedAssets: generatedAssetWrite.writtenAssets,
			ids,
			manifestPath: join(allocation.finalDirectory, EXPORT_MANIFEST_FILE_NAME),
			outputDirectory: allocation.finalDirectory,
			scaffoldPaths: toAbsolutePaths({
				finalDirectory: allocation.finalDirectory,
				relativePaths: scaffoldRelativePaths,
			}),
			timelineMaterialsSize,
		};
	} catch (error) {
		if (!published) {
			await cleanupCapCut81Bundle({ allocation });
		}
		throw error;
	}
}

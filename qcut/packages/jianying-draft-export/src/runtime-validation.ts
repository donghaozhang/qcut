import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
	JianyingDraftTargetPlatform,
	QCutDraftExportSnapshotV1,
} from "@qcut/editor-core/jianying-draft";
import {
	assertNoUnknownKeys,
	assertStringLiteral,
	cloneJsonValue,
	deepFreeze,
	getFiniteNumber,
	getRecord,
	getString,
	StandaloneJianyingDraftRequestValidationError,
	type StandaloneJianyingDraftRequestValidationIssue,
	validationIssue,
} from "./runtime-json.js";
import { validateSnapshot } from "./snapshot-runtime-validation.js";

const PLAN_REQUEST_KEYS = new Set([
	"createdAtUnixSeconds",
	"draftName",
	"outputParentDirectory",
	"snapshot",
	"targetPlatform",
]);
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";
const MAX_CONCURRENT_MEDIA_PATH_OPERATIONS = 8;

export interface NormalizedMediaSourceIdentity {
	ctimeNanoseconds: string;
	device: string;
	inode: string;
	mtimeNanoseconds: string;
	realPath: string;
	size: string;
}

export interface StandaloneJianyingDraftPlanRequest {
	createdAtUnixSeconds?: number;
	draftName: string;
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export interface NormalizedStandaloneJianyingDraftPlanRequest {
	createdAtUnixSeconds: number;
	draftName: string;
	mediaSourceIdentities: readonly NormalizedMediaSourceIdentity[];
	outputParentDirectory: string;
	snapshot: QCutDraftExportSnapshotV1;
	targetPlatform: JianyingDraftTargetPlatform;
}

export {
	StandaloneJianyingDraftRequestValidationError,
	type StandaloneJianyingDraftRequestValidationIssue,
};

async function mapWithConcurrency<Item, Result>({
	concurrency,
	items,
	mapItem,
}: {
	concurrency: number;
	items: readonly Item[];
	mapItem: ({ index, item }: { index: number; item: Item }) => Promise<Result>;
}): Promise<Result[]> {
	const results = new Array<Result>(items.length);
	let firstError: unknown;
	let hasError = false;
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		if (hasError) return;
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		const item = items[index] as Item;
		try {
			results[index] = await mapItem({ index, item });
		} catch (error) {
			if (!hasError) {
				firstError = error;
				hasError = true;
			}
			return;
		}
		await runNext();
	};
	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, () => runNext()));
	if (hasError) throw firstError;
	return results;
}

async function getMediaSourceIdentity({
	sourcePath,
}: {
	sourcePath: string;
}): Promise<NormalizedMediaSourceIdentity> {
	const realPath = await realpath(resolve(sourcePath));
	const metadata = await stat(realPath, { bigint: true });
	if (!metadata.isFile()) {
		throw new Error("Media source must resolve to a regular file.");
	}
	return {
		ctimeNanoseconds: metadata.ctimeNs.toString(),
		device: metadata.dev.toString(),
		inode: metadata.ino.toString(),
		mtimeNanoseconds: metadata.mtimeNs.toString(),
		realPath,
		size: metadata.size.toString(),
	};
}

function mediaSourceIdentityMatches({
	actual,
	expected,
}: {
	actual: NormalizedMediaSourceIdentity;
	expected: NormalizedMediaSourceIdentity;
}): boolean {
	return (
		actual.realPath === expected.realPath &&
		actual.device === expected.device &&
		actual.inode === expected.inode &&
		actual.size === expected.size &&
		actual.mtimeNanoseconds === expected.mtimeNanoseconds &&
		actual.ctimeNanoseconds === expected.ctimeNanoseconds
	);
}

function isLexicallyInsideDirectory({
	candidatePath,
	parentDirectory,
}: {
	candidatePath: string;
	parentDirectory: string;
}): boolean {
	const relativePath = relative(parentDirectory, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

async function normalizeMediaSources({
	allowedSourceRootDirectory,
	snapshot,
}: {
	allowedSourceRootDirectory?: string;
	snapshot: QCutDraftExportSnapshotV1;
}): Promise<{
	identities: NormalizedMediaSourceIdentity[];
	snapshot: QCutDraftExportSnapshotV1;
}> {
	const canonicalAllowedSourceRoot =
		allowedSourceRootDirectory === undefined
			? undefined
			: await realpath(allowedSourceRootDirectory);
	const normalized = await mapWithConcurrency({
		concurrency: MAX_CONCURRENT_MEDIA_PATH_OPERATIONS,
		items: snapshot.media,
		mapItem: async ({ index, item }) => {
			const lexicalSourcePath = resolve(item.sourcePath);
			if (
				allowedSourceRootDirectory !== undefined &&
				!isLexicallyInsideDirectory({
					candidatePath: lexicalSourcePath,
					parentDirectory: allowedSourceRootDirectory,
				})
			) {
				throw validationIssue({
					message: "Media source is outside the trusted project root.",
					path: `$.snapshot.media[${index}].sourcePath`,
				});
			}
			let identity: NormalizedMediaSourceIdentity;
			let sourcePath: string;
			try {
				identity = await getMediaSourceIdentity({
					sourcePath: lexicalSourcePath,
				});
				sourcePath = identity.realPath;
			} catch (error) {
				throw validationIssue({
					message: `Media source cannot be resolved: ${
						error instanceof Error ? error.message : String(error)
					}`,
					path: `$.snapshot.media[${index}].sourcePath`,
				});
			}
			if (
				canonicalAllowedSourceRoot !== undefined &&
				!isLexicallyInsideDirectory({
					candidatePath: identity.realPath,
					parentDirectory: canonicalAllowedSourceRoot,
				})
			) {
				throw validationIssue({
					message: "Media source resolves outside the trusted project root.",
					path: `$.snapshot.media[${index}].sourcePath`,
				});
			}
			return {
				identity,
				item: { ...item, sourcePath },
			};
		},
	});
	return {
		identities: normalized.map(({ identity }) => identity),
		snapshot: {
			...snapshot,
			media: normalized.map(({ item }) => item),
		},
	};
}

export async function assertNormalizedMediaSourcesUnchanged({
	request,
}: {
	request: NormalizedStandaloneJianyingDraftPlanRequest;
}): Promise<void> {
	await mapWithConcurrency({
		concurrency: MAX_CONCURRENT_MEDIA_PATH_OPERATIONS,
		items: request.mediaSourceIdentities,
		mapItem: async ({ item: expected }) => {
			const actual = await getMediaSourceIdentity({
				sourcePath: expected.realPath,
			});
			if (!mediaSourceIdentityMatches({ actual, expected })) {
				throw new Error(
					`Media source changed after planning: ${expected.realPath}`
				);
			}
		},
	});
}

export async function normalizeStandaloneJianyingDraftPlanRequest({
	allowedSourceRootDirectory,
	input,
	nowUnixMilliseconds,
}: {
	allowedSourceRootDirectory?: string;
	input: unknown;
	nowUnixMilliseconds: number;
}): Promise<NormalizedStandaloneJianyingDraftPlanRequest> {
	const request = getRecord({
		path: "$",
		value: cloneJsonValue({ value: input }),
	});
	assertNoUnknownKeys({
		allowed: PLAN_REQUEST_KEYS,
		path: "$",
		record: request,
	});
	const draftName = getString({ path: "$.draftName", value: request.draftName })
		.normalize("NFC")
		.trim();
	const outputParentInput = getString({
		path: "$.outputParentDirectory",
		value: request.outputParentDirectory,
	});
	const targetPlatform = assertStringLiteral({
		allowed: new Set(["macos", "windows"]),
		path: "$.targetPlatform",
		value: request.targetPlatform,
	}) as JianyingDraftTargetPlatform;
	const createdAtUnixSeconds =
		request.createdAtUnixSeconds === undefined
			? Math.floor(nowUnixMilliseconds / 1000)
			: getFiniteNumber({
					path: "$.createdAtUnixSeconds",
					value: request.createdAtUnixSeconds,
				});
	const snapshot = validateSnapshot({
		path: "$.snapshot",
		value: request.snapshot,
	});

	let outputParentDirectory: string;
	try {
		outputParentDirectory = await realpath(resolve(outputParentInput));
		const outputParentMetadata = await stat(outputParentDirectory);
		if (!outputParentMetadata.isDirectory()) {
			throw new Error("Path is not a directory.");
		}
		const targetsApplicationDraftStore = outputParentDirectory
			.split(/[\\/]+/)
			.some(
				(part) =>
					part.toLowerCase() === DRAFT_STORE_DIRECTORY_NAME.toLowerCase()
			);
		if (targetsApplicationDraftStore) {
			throw new Error(
				"Standalone export cannot target an application draft store."
			);
		}
	} catch (error) {
		throw validationIssue({
			message: `Output parent cannot be resolved as a directory: ${
				error instanceof Error ? error.message : String(error)
			}`,
			path: "$.outputParentDirectory",
		});
	}

	const normalizedMedia = await normalizeMediaSources({
		...(allowedSourceRootDirectory === undefined
			? {}
			: { allowedSourceRootDirectory: resolve(allowedSourceRootDirectory) }),
		snapshot,
	});
	return deepFreeze({
		value: {
			createdAtUnixSeconds,
			draftName,
			mediaSourceIdentities: normalizedMedia.identities,
			outputParentDirectory,
			snapshot: normalizedMedia.snapshot,
			targetPlatform,
		},
	});
}

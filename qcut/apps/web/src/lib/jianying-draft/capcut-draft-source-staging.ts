import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import type { ElectronAPI } from "@/types/electron/electron-api";
import type { JianyingDraftIssueDto } from "@/types/electron/api-jianying-draft-export";

export interface CapCutDraftSourceGrant {
	grantMediaId: string;
	mediaId: string;
	projectId: string;
}

export interface CapCutDraftSourceStagingResult {
	grants: CapCutDraftSourceGrant[];
	snapshot: QCutDraftExportSnapshotV1;
}

type MediaImportAPI = NonNullable<ElectronAPI["mediaImport"]>;
const MAX_CONCURRENT_SOURCE_IMPORTS = 8;

interface SourceImportFailure {
	message: string;
	sourcePath: string;
}

interface SourceImportSuccess {
	grant: CapCutDraftSourceGrant;
	mediaId: string;
	targetPath: string;
}

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
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		results[index] = await mapItem({ index, item: items[index] as Item });
		await runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () =>
			runNext()
		)
	);
	return results;
}

export class CapCutDraftSourceStagingError extends Error {
	readonly grants: CapCutDraftSourceGrant[];
	readonly issues: JianyingDraftIssueDto[];

	constructor({
		grants = [],
		issues,
		message,
	}: {
		grants?: CapCutDraftSourceGrant[];
		issues: JianyingDraftIssueDto[];
		message: string;
	}) {
		super(message);
		this.name = "CapCutDraftSourceStagingError";
		this.grants = grants;
		this.issues = issues;
	}
}

function createGrantMediaId({
	index,
	mediaId,
	sessionId,
}: {
	index: number;
	mediaId: string;
	sessionId: string;
}): string {
	const safeMediaId = mediaId.replace(/[^a-zA-Z0-9_-]/gu, "-").slice(0, 80);
	return `qcut-capcut-export-${sessionId}-${index}-${safeMediaId}`;
}

function describeSourceImportFailures({
	failures,
}: {
	failures: readonly SourceImportFailure[];
}): string {
	return failures
		.map(({ message, sourcePath }) => `${sourcePath} (${message})`)
		.join("; ");
}

async function importFirstAvailableSource({
	candidates,
	failures,
	grantMediaId,
	mediaId,
	mediaImport,
	projectId,
}: {
	candidates: readonly string[];
	failures: readonly SourceImportFailure[];
	grantMediaId: string;
	mediaId: string;
	mediaImport: MediaImportAPI;
	projectId: string;
}): Promise<SourceImportSuccess | { failures: SourceImportFailure[] }> {
	const [sourcePath, ...remainingCandidates] = candidates;
	if (!sourcePath) return { failures: [...failures] };

	try {
		const result = await mediaImport.import({
			mediaId: grantMediaId,
			preferSymlink: false,
			projectId,
			sourcePath,
		});
		if (result.success && result.targetPath) {
			return {
				grant: { grantMediaId, mediaId, projectId },
				mediaId,
				targetPath: result.targetPath,
			};
		}
		return importFirstAvailableSource({
			candidates: remainingCandidates,
			failures: [
				...failures,
				{
					message: result.error ?? "the media import returned no output path",
					sourcePath,
				},
			],
			grantMediaId,
			mediaId,
			mediaImport,
			projectId,
		});
	} catch (error) {
		return importFirstAvailableSource({
			candidates: remainingCandidates,
			failures: [
				...failures,
				{
					message: error instanceof Error ? error.message : String(error),
					sourcePath,
				},
			],
			grantMediaId,
			mediaId,
			mediaImport,
			projectId,
		});
	}
}

export async function cleanupCapCutDraftSourceGrants({
	grants,
	mediaImport,
}: {
	grants: readonly CapCutDraftSourceGrant[];
	mediaImport: MediaImportAPI;
}): Promise<JianyingDraftIssueDto[]> {
	const cleanupResults = await Promise.all(
		grants.map(async ({ grantMediaId, mediaId, projectId }) => {
			try {
				await mediaImport.remove(projectId, grantMediaId);
				return null;
			} catch (error) {
				return {
					code: "SOURCE_STAGING_CLEANUP_FAILED",
					mediaId,
					message: `Could not remove temporary export source ${grantMediaId}: ${
						error instanceof Error ? error.message : String(error)
					}`,
					severity: "warning" as const,
				};
			}
		})
	);
	return cleanupResults.flatMap((issue) => (issue ? [issue] : []));
}

export async function stageCapCutDraftSources({
	mediaImport,
	projectId,
	sessionId,
	sourceCandidatesByMediaId = {},
	snapshot,
}: {
	mediaImport: MediaImportAPI;
	projectId: string;
	sessionId: string;
	sourceCandidatesByMediaId?: Readonly<Record<string, readonly string[]>>;
	snapshot: QCutDraftExportSnapshotV1;
}): Promise<CapCutDraftSourceStagingResult> {
	try {
		await mediaImport.getMediaPath(projectId);
	} catch (error) {
		throw new CapCutDraftSourceStagingError({
			issues: [],
			message: `QCut could not locate the trusted project media directory: ${
				error instanceof Error ? error.message : String(error)
			}`,
		});
	}

	const stagedResults = await mapWithConcurrency({
		concurrency: MAX_CONCURRENT_SOURCE_IMPORTS,
		items: snapshot.media,
		mapItem: async ({ index, item: media }) => {
			const grantMediaId = createGrantMediaId({
				index,
				mediaId: media.id,
				sessionId,
			});
			const candidates = [
				...new Set([
					media.sourcePath,
					...(sourceCandidatesByMediaId[media.id] ?? []),
				]),
			];
			const result = await importFirstAvailableSource({
				candidates,
				failures: [],
				grantMediaId,
				mediaId: media.id,
				mediaImport,
				projectId,
			});
			if ("grant" in result) {
				return {
					...result,
				};
			}
			return {
				issue: {
					code: "SOURCE_STAGING_FAILED",
					mediaId: media.id,
					message: `QCut could not stage ${media.name}. Tried: ${describeSourceImportFailures(
						{ failures: result.failures }
					)}.`,
					severity: "error" as const,
				},
			};
		},
	});
	const grants = stagedResults.flatMap((result) =>
		"grant" in result && result.grant ? [result.grant] : []
	);
	const issues = stagedResults.flatMap((result) =>
		"issue" in result && result.issue ? [result.issue] : []
	);
	if (issues.length > 0) {
		throw new CapCutDraftSourceStagingError({
			grants,
			issues,
			message: "QCut could not prepare every media source for CapCut export.",
		});
	}

	const targetPathByMediaId = new Map(
		stagedResults.flatMap((result) =>
			"targetPath" in result && result.targetPath && "mediaId" in result
				? [[result.mediaId, result.targetPath] as const]
				: []
		)
	);
	return {
		grants,
		snapshot: {
			...snapshot,
			media: snapshot.media.map((media) => ({
				...media,
				sourcePath: targetPathByMediaId.get(media.id) ?? media.sourcePath,
			})),
		},
	};
}

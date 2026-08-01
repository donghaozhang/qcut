import { isAbsolute, resolve } from "node:path";
import { buildCapCut81Draft } from "@qcut/editor-core/jianying-draft";
import {
	normalizeCapCut81MigrationPlanRequest,
	type CapCut81MigrationPlanRequest,
} from "./capcut-8-1-migration-runtime-validation.js";
import {
	type CapCut81MigrationBundleWriteResult,
	writeTrustedCapCut81MigrationBundle,
} from "./capcut-8-1-migration-writer.js";
import type { CapCut81FontGlyphCoverageInspector } from "./capcut-8-1-system-font-stack.js";
import { collectCapCut81RuntimeFontIssues } from "./capcut-8-1-text-font-preflight.js";
import {
	StandaloneJianyingDraftPlanBlockedError,
	StandaloneJianyingDraftPlanConsumedError,
	StandaloneJianyingDraftPlanExpiredError,
	StandaloneJianyingDraftPlanNotFoundError,
	StandaloneJianyingDraftPlanStateChangedError,
	StandaloneJianyingDraftWarningAcceptanceError,
	TrustedJianyingDraftExportSessionCore,
	type TrustedJianyingDraftExportPlan,
} from "./trusted-export-session.js";

export interface CapCut81MigrationExportSessionOptions {
	/** Trusted main-process project scope; renderer IPC must never provide it. */
	allowedSourceRootDirectory?: string;
	/** Trusted main-process application bundle; renderer IPC must never provide it. */
	capCutAppPath?: string;
	/** Trusted main-process executable; renderer IPC must never provide it. */
	ffprobePath: string;
	ffprobeTimeoutMilliseconds?: number;
	/** Trusted host test seam; renderer IPC cannot provide functions. */
	inspectFontGlyphCoverage?: CapCut81FontGlyphCoverageInspector;
	maxConcurrentCommits?: number;
	maxConcurrentPlans?: number;
	maxStoredPlans?: number;
	/** Trusted main-process export scope; renderer IPC must never provide it. */
	outputParentDirectory: string;
	planTtlMilliseconds?: number;
}

export type CapCut81MigrationExportPlan = TrustedJianyingDraftExportPlan;
export type { CapCut81MigrationPlanRequest };

export {
	StandaloneJianyingDraftPlanBlockedError as CapCut81MigrationPlanBlockedError,
	StandaloneJianyingDraftPlanConsumedError as CapCut81MigrationPlanConsumedError,
	StandaloneJianyingDraftPlanExpiredError as CapCut81MigrationPlanExpiredError,
	StandaloneJianyingDraftPlanNotFoundError as CapCut81MigrationPlanNotFoundError,
	StandaloneJianyingDraftPlanStateChangedError as CapCut81MigrationPlanStateChangedError,
	StandaloneJianyingDraftWarningAcceptanceError as CapCut81MigrationWarningAcceptanceError,
};

interface BoundMigrationOptions {
	allowedSourceRootDirectory?: string;
	capCutAppPath?: string;
	ffprobePath: string;
	ffprobeTimeoutMilliseconds?: number;
	inspectFontGlyphCoverage?: CapCut81FontGlyphCoverageInspector;
	outputParentDirectory: string;
}

const PREFLIGHT_PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000001";
const PREFLIGHT_TIMELINE_ID = "00000000-0000-4000-8000-000000000002";

function validateMigrationOptions({
	options,
}: {
	options: BoundMigrationOptions;
}): void {
	if (
		options.allowedSourceRootDirectory !== undefined &&
		(options.allowedSourceRootDirectory.trim().length === 0 ||
			!isAbsolute(options.allowedSourceRootDirectory))
	) {
		throw new Error(
			"CapCut 8.1 migration allowedSourceRootDirectory must be absolute."
		);
	}
	if (
		options.capCutAppPath !== undefined &&
		(options.capCutAppPath.trim().length === 0 ||
			!isAbsolute(options.capCutAppPath))
	) {
		throw new Error("CapCut 8.1 migration capCutAppPath must be absolute.");
	}
	if (options.ffprobePath.trim().length === 0) {
		throw new Error("CapCut 8.1 migration ffprobePath must not be empty.");
	}
	if (options.outputParentDirectory.trim().length === 0) {
		throw new Error(
			"CapCut 8.1 migration outputParentDirectory must not be empty."
		);
	}
	if (
		options.ffprobeTimeoutMilliseconds !== undefined &&
		(!Number.isFinite(options.ffprobeTimeoutMilliseconds) ||
			options.ffprobeTimeoutMilliseconds <= 0 ||
			options.ffprobeTimeoutMilliseconds > 120_000)
	) {
		throw new Error(
			"CapCut 8.1 migration ffprobeTimeoutMilliseconds must be between 1 and 120000."
		);
	}
}

export class CapCut81MigrationExportSession {
	readonly #core: TrustedJianyingDraftExportSessionCore<CapCut81MigrationBundleWriteResult>;

	constructor({
		allowedSourceRootDirectory,
		capCutAppPath,
		ffprobePath,
		ffprobeTimeoutMilliseconds,
		inspectFontGlyphCoverage,
		maxConcurrentCommits,
		maxConcurrentPlans,
		maxStoredPlans,
		outputParentDirectory,
		planTtlMilliseconds,
	}: CapCut81MigrationExportSessionOptions) {
		validateMigrationOptions({
			options: {
				...(allowedSourceRootDirectory === undefined
					? {}
					: { allowedSourceRootDirectory }),
				...(capCutAppPath === undefined ? {} : { capCutAppPath }),
				ffprobePath,
				...(ffprobeTimeoutMilliseconds === undefined
					? {}
					: { ffprobeTimeoutMilliseconds }),
				outputParentDirectory,
			},
		});
		const boundOptions: BoundMigrationOptions = Object.freeze({
			...(allowedSourceRootDirectory === undefined
				? {}
				: { allowedSourceRootDirectory: resolve(allowedSourceRootDirectory) }),
			...(capCutAppPath === undefined
				? {}
				: { capCutAppPath: resolve(capCutAppPath) }),
			ffprobePath: resolve(ffprobePath),
			...(ffprobeTimeoutMilliseconds === undefined
				? {}
				: { ffprobeTimeoutMilliseconds }),
			...(inspectFontGlyphCoverage === undefined
				? {}
				: { inspectFontGlyphCoverage }),
			outputParentDirectory: resolve(outputParentDirectory),
		});
		this.#core =
			new TrustedJianyingDraftExportSessionCore<CapCut81MigrationBundleWriteResult>(
				{
					...(maxConcurrentCommits === undefined
						? {}
						: { maxConcurrentCommits }),
					...(maxConcurrentPlans === undefined ? {} : { maxConcurrentPlans }),
					...(maxStoredPlans === undefined ? {} : { maxStoredPlans }),
					normalizePlanRequest: ({ input, nowUnixMilliseconds }) =>
						normalizeCapCut81MigrationPlanRequest({
							...(boundOptions.allowedSourceRootDirectory === undefined
								? {}
								: {
										allowedSourceRootDirectory:
											boundOptions.allowedSourceRootDirectory,
									}),
							input,
							nowUnixMilliseconds,
							outputParentDirectory: boundOptions.outputParentDirectory,
						}),
					preflight: async ({ request, requestFingerprint }) => {
						const buildResult = buildCapCut81Draft({
							createdAtUnixSeconds: request.createdAtUnixSeconds,
							draftOutputDirectory: resolve(
								request.outputParentDirectory,
								`.qcut-capcut-plan-${requestFingerprint.slice(0, 16)}`
							),
							placeholderId: PREFLIGHT_PLACEHOLDER_ID,
							snapshot: request.snapshot,
							targetPlatform: request.targetPlatform,
							timelineId: PREFLIGHT_TIMELINE_ID,
						});
						const runtimeFontIssues = await collectCapCut81RuntimeFontIssues({
							...(boundOptions.capCutAppPath === undefined
								? {}
								: { capCutAppPath: boundOptions.capCutAppPath }),
							...(boundOptions.inspectFontGlyphCoverage === undefined
								? {}
								: {
										inspectGlyphCoverage: boundOptions.inspectFontGlyphCoverage,
									}),
							snapshot: request.snapshot,
							targetPlatform: request.targetPlatform,
						});
						return {
							...buildResult,
							issues: [...buildResult.issues, ...runtimeFontIssues],
						};
					},
					...(planTtlMilliseconds === undefined ? {} : { planTtlMilliseconds }),
					trustedBinding: Object.freeze({
						...(boundOptions.allowedSourceRootDirectory === undefined
							? {}
							: {
									allowedSourceRootDirectory:
										boundOptions.allowedSourceRootDirectory,
								}),
						...(boundOptions.capCutAppPath === undefined
							? {}
							: { capCutAppPath: boundOptions.capCutAppPath }),
						exportKind: "capcut-8.1-migration",
						ffprobePath: boundOptions.ffprobePath,
						...(boundOptions.ffprobeTimeoutMilliseconds === undefined
							? {}
							: {
									ffprobeTimeoutMilliseconds:
										boundOptions.ffprobeTimeoutMilliseconds,
								}),
						outputParentDirectory: boundOptions.outputParentDirectory,
					}),
					write: ({ acceptedWarningFingerprints, request }) =>
						writeTrustedCapCut81MigrationBundle({
							acceptedWarningFingerprints: [...acceptedWarningFingerprints],
							createdAtUnixSeconds: request.createdAtUnixSeconds,
							draftName: request.draftName,
							ffprobePath: boundOptions.ffprobePath,
							...(boundOptions.ffprobeTimeoutMilliseconds === undefined
								? {}
								: {
										ffprobeTimeoutMilliseconds:
											boundOptions.ffprobeTimeoutMilliseconds,
									}),
							outputParentDirectory: request.outputParentDirectory,
							snapshot: request.snapshot,
							targetPlatform: request.targetPlatform,
						}),
				}
			);
	}

	plan({ input }: { input: unknown }): Promise<CapCut81MigrationExportPlan> {
		return this.#core.plan({ input });
	}

	commit({
		input,
	}: {
		input: unknown;
	}): Promise<CapCut81MigrationBundleWriteResult> {
		return this.#core.commit({ input });
	}

	dispose(): void {
		this.#core.dispose();
	}
}

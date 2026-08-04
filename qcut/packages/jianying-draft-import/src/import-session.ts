/**
 * Import session — the inspect/plan/commit lifecycle (JYI-012).
 *
 * Composes every runtime building block behind three verbs:
 *
 *   inspect  read-only report: discovery, snapshot, profile detection,
 *            and (for exact plaintext profiles) the semantic document —
 *            never creates state.
 *   plan     inspect + asset resolution + plan artifact + shared bundle;
 *            stores the plan under a single-use token.
 *   commit   CAS-consumes the token, re-verifies the live source, demands
 *            exact warning acceptance, and returns the bundle plus bounded
 *            media payloads. The session NEVER writes QCut storage — the
 *            renderer transaction (JYI-010) owns that.
 *
 * All outward DTOs are redacted: no absolute paths, ever.
 *
 * @module @qcut/jianying-draft-import/import-session
 */

import { basename } from "node:path";
import {
	type DraftInteropDocumentV1,
	type DraftSourceDescriptor,
	type ForeignDraftEnvelopeV1,
	ImportStageMetricsRecorder,
	type ImportPlanStageId,
	type ImportStageMetricsV1,
	type InteropIssue,
	type QCutImportBundleV1,
	type RawNodeBinding,
} from "@qcut/editor-core/draft-interop";
import {
	detectDraftProfile,
	getDraftProfile,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
	type DraftContentSummary,
	type ProfileDetectionResult,
} from "@qcut/editor-core/jianying-draft";
import {
	resolveImportAssets,
	type ResolvedImportAsset,
} from "./asset-resolver.js";
import type { AssetResolutionCacheMetrics } from "./asset-resolution-work-cache.js";
import { discoverDraftDirectory } from "./discovery.js";
import {
	createImportPlanArtifact,
	redactImportPlanArtifactForLog,
	type ImportPlanArtifactV1,
	type ImportPlanBuildIdentity,
	type RedactedImportPlanArtifact,
} from "./import-plan-artifact.js";
import { ImportPlanStore } from "./import-plan-store.js";
import { PersistentImportPlanStore } from "./persistent-import-plan-store.js";
import { buildQCutImportBundle } from "./qcut-import-bundle-builder.js";
import { buildForeignEnvelopeCapture } from "./foreign-envelope-capture.js";
import {
	MediaPayloadGrantStore,
	type MediaPayloadChunkDto,
	type MediaPayloadGrantDto,
	type VerifiedRestrictedMediaPayloadSource,
} from "./media-payload-grant-store.js";
import {
	MediaPayloadReadError,
	readVerifiedMediaPayload,
} from "./media-payload-reader.js";
import {
	readDraftSourceSnapshot,
	verifyDraftSourceUnchanged,
	type DraftSourceSnapshot,
} from "./snapshot-reader.js";
import { validateDraftInspectRequest } from "./runtime-validation.js";

const MAX_TOTAL_MEDIA_PAYLOAD_BYTES = 512 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
	mp4: "video/mp4",
	mov: "video/quicktime",
	m4v: "video/x-m4v",
	webm: "video/webm",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	wav: "audio/wav",
	flac: "audio/flac",
	aac: "audio/aac",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
};

function createPlanStageMetrics({
	now,
}: {
	now: () => number;
}): ImportStageMetricsRecorder<ImportPlanStageId> {
	return new ImportStageMetricsRecorder({ now, phase: "runtime-plan" });
}

export class ImportSessionError extends Error {
	readonly code:
		| "invalid-request"
		| "no-content-file"
		| "profile-not-exact"
		| "plan-blocked"
		| "warning-acceptance-mismatch"
		| "source-changed"
		| "payload-too-large";

	constructor({
		code,
		message,
	}: {
		code: ImportSessionError["code"];
		message: string;
	}) {
		super(message);
		this.name = "ImportSessionError";
		this.code = code;
	}
}

export interface DraftImportInspectDto {
	outcome: ProfileDetectionResult["outcome"];
	profileId?: string;
	canWrite: boolean;
	fileCount: number;
	skippedEntryCount: number;
	hasContentFile: boolean;
	/** Present only for an exact plaintext profile. */
	semantic?: {
		trackCount: number;
		segmentCount: number;
		resourceCount: number;
		capabilityCounts: Record<string, number>;
	};
	issues: InteropIssue[];
}

export interface DraftImportPlanDto {
	plan: RedactedImportPlanArtifact;
	inspect: DraftImportInspectDto;
	assetStatuses: Record<string, ResolvedImportAsset["status"]>;
	cacheMetrics: {
		assetResolution: AssetResolutionCacheMetrics;
	};
	stageMetrics: ImportStageMetricsV1<ImportPlanStageId>;
}

export interface DraftImportMediaPayloadDto {
	resourceId: string;
	fileName: string;
	mimeType: string;
	bytesBase64: string;
}

export interface DraftImportEnvelopeCaptureDto {
	envelope: ForeignDraftEnvelopeV1;
	payloadBase64: string;
	payloadSha256: string;
}

export interface DraftImportCommitDto {
	bundle: QCutImportBundleV1;
	mediaPayloads: DraftImportMediaPayloadDto[];
	envelopeCapture?: DraftImportEnvelopeCaptureDto;
}

export interface DraftImportGrantedCommitDto {
	bundle: QCutImportBundleV1;
	mediaGrants: MediaPayloadGrantDto[];
	envelopeCapture?: DraftImportEnvelopeCaptureDto;
}

interface PlannedSessionState {
	snapshot: DraftSourceSnapshot;
	bundle: QCutImportBundleV1;
	resolvedAssets: ResolvedImportAsset[];
	bindings: RawNodeBinding[];
}

interface PreparedExactImport {
	inspect: DraftImportInspectDto;
	snapshot: DraftSourceSnapshot;
	detection: ProfileDetectionResult;
	document: DraftInteropDocumentV1;
	assets: ResolvedImportAsset[];
	assetResolutionCacheMetrics: AssetResolutionCacheMetrics;
	bindings: RawNodeBinding[];
}

interface PreparedCommit {
	session: PlannedSessionState;
	envelopeCapture?: DraftImportEnvelopeCaptureDto;
}

function toVerifiedMediaSource({
	asset,
}: {
	asset: ResolvedImportAsset;
}): VerifiedRestrictedMediaPayloadSource {
	if (
		asset.status !== "resolved" ||
		asset.restrictedAbsolutePath === undefined ||
		asset.byteLength === undefined ||
		asset.sha256 === undefined ||
		asset.identity === undefined
	) {
		throw new ImportSessionError({
			code: "source-changed",
			message: "resolved media evidence is incomplete",
		});
	}
	const fileName = basename(asset.restrictedAbsolutePath);
	const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
	return {
		resourceId: asset.resourceId,
		fileName,
		mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
		byteLength: asset.byteLength,
		sha256: asset.sha256,
		restrictedAbsolutePath: asset.restrictedAbsolutePath,
		identity: asset.identity,
	};
}

async function grantResolvedMedia({
	assets,
	grantStore,
}: {
	assets: readonly ResolvedImportAsset[];
	grantStore: MediaPayloadGrantStore;
}): Promise<MediaPayloadGrantDto[]> {
	const sources = assets
		.filter((asset) => asset.status === "resolved")
		.map((asset) => toVerifiedMediaSource({ asset }));
	const grants = new Array<MediaPayloadGrantDto>(sources.length);
	let nextIndex = 0;
	const grantNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= sources.length) return;
		grants[index] = await grantStore.grantVerifiedSource({
			source: sources[index],
		});
		return grantNext();
	};
	try {
		await Promise.all(
			Array.from({ length: Math.min(4, sources.length) }, () => grantNext())
		);
		return grants;
	} catch (error) {
		grantStore.release({
			input: {
				grantTokens: grants
					.filter((grant) => grant !== undefined)
					.map((grant) => grant.grantToken),
			},
		});
		throw error;
	}
}

interface ImportPlanStoreAdapter {
	put({ artifact }: { artifact: ImportPlanArtifactV1 }): void | Promise<void>;
	get({
		planToken,
	}: {
		planToken: string;
	}): ImportPlanArtifactV1 | Promise<ImportPlanArtifactV1>;
	consume({
		planToken,
	}: {
		planToken: string;
	}): ImportPlanArtifactV1 | Promise<ImportPlanArtifactV1>;
	dispose?(): void;
}

export function buildContentSummary({
	snapshot,
}: {
	snapshot: DraftSourceSnapshot;
}): DraftContentSummary | undefined {
	const contentFile = snapshot.files.find(
		(file) =>
			file.role === "content" && file.classification === "plaintext-json"
	);
	if (contentFile === undefined) {
		return undefined;
	}
	const parsed = snapshot.parsedJsonByPath[contentFile.relativePath];
	if (typeof parsed !== "object" || parsed === null) {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	const platform =
		typeof record.platform === "object" && record.platform !== null
			? (record.platform as Record<string, unknown>)
			: {};
	return {
		fileName: contentFile.relativePath,
		topLevelKeys: Object.keys(record),
		...(typeof platform.app_id === "number" ? { appId: platform.app_id } : {}),
		...(typeof platform.app_source === "string"
			? { appSource: platform.app_source }
			: {}),
		...(typeof platform.app_version === "string"
			? { appVersion: platform.app_version }
			: {}),
		...(typeof record.version === "number"
			? { schemaVersion: record.version }
			: {}),
		...(typeof record.new_version === "string"
			? { newVersion: record.new_version }
			: {}),
	};
}

function countCapabilities({
	document,
}: {
	document: DraftInteropDocumentV1;
}): Record<string, number> {
	const counts: Record<string, number> = {
		exact: 0,
		downgrade: 0,
		opaque: 0,
		blocked: 0,
	};
	for (const timeline of document.timelines) {
		for (const track of timeline.tracks) {
			for (const segment of track.segments) {
				counts[segment.capability] += 1;
			}
		}
	}
	return counts;
}

async function readResolvedAssetPayload({
	asset,
	remainingBudget,
}: {
	asset: ResolvedImportAsset;
	remainingBudget: number;
}): Promise<Buffer> {
	if (
		asset.status !== "resolved" ||
		asset.restrictedAbsolutePath === undefined ||
		asset.byteLength === undefined ||
		asset.sha256 === undefined
	) {
		throw new ImportSessionError({
			code: "source-changed",
			message: "resolved media evidence is incomplete",
		});
	}
	try {
		return await readVerifiedMediaPayload({
			absolutePath: asset.restrictedAbsolutePath,
			expectedByteLength: asset.byteLength,
			expectedSha256: asset.sha256,
			remainingBudget,
		});
	} catch (error) {
		if (error instanceof MediaPayloadReadError) {
			throw new ImportSessionError({
				code: error.code,
				message: error.message,
			});
		}
		throw error;
	}
}

function arraysEqual({
	left,
	right,
}: {
	left: readonly string[];
	right: readonly string[];
}): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

export class JianyingDraftImportSession {
	readonly #buildIdentity: ImportPlanBuildIdentity;
	readonly #metricsNow: () => number;
	readonly #mediaGrantStore: MediaPayloadGrantStore;
	readonly #now: () => number;
	readonly #planStore: ImportPlanStoreAdapter;
	readonly #planTtlMilliseconds: number | undefined;

	constructor({
		buildIdentity,
		metricsNow = () => performance.now(),
		mediaGrantStore = new MediaPayloadGrantStore(),
		planTtlMilliseconds,
		now = Date.now,
		planStore,
	}: {
		buildIdentity: ImportPlanBuildIdentity;
		metricsNow?: () => number;
		mediaGrantStore?: MediaPayloadGrantStore;
		planTtlMilliseconds?: number;
		now?: () => number;
		planStore?: ImportPlanStoreAdapter;
	}) {
		this.#buildIdentity = { ...buildIdentity };
		this.#metricsNow = metricsNow;
		this.#mediaGrantStore = mediaGrantStore;
		this.#planTtlMilliseconds = planTtlMilliseconds;
		this.#now = now;
		this.#planStore = planStore ?? new ImportPlanStore({ buildIdentity, now });
	}

	static async open({
		buildIdentity,
		metricsNow = () => performance.now(),
		mediaGrantStore = new MediaPayloadGrantStore(),
		planTtlMilliseconds,
		now = Date.now,
		storageDirectory,
	}: {
		buildIdentity: ImportPlanBuildIdentity;
		metricsNow?: () => number;
		mediaGrantStore?: MediaPayloadGrantStore;
		planTtlMilliseconds?: number;
		now?: () => number;
		storageDirectory: string;
	}): Promise<JianyingDraftImportSession> {
		const planStore = await PersistentImportPlanStore.open({
			buildIdentity,
			now,
			storageDirectory,
		});
		return new JianyingDraftImportSession({
			buildIdentity,
			metricsNow,
			mediaGrantStore,
			...(planTtlMilliseconds === undefined ? {} : { planTtlMilliseconds }),
			now,
			planStore,
		});
	}

	async #inspectInternal({
		input,
		stageMetrics,
	}: {
		input: unknown;
		stageMetrics: ImportStageMetricsRecorder<ImportPlanStageId>;
	}): Promise<{
		inspect: DraftImportInspectDto;
		snapshot: DraftSourceSnapshot;
		detection: ProfileDetectionResult;
		document?: DraftInteropDocumentV1;
		bindings: RawNodeBinding[];
		restrictedSourcePathsByResourceId: Record<string, string>;
	}> {
		const validated = stageMetrics.measureSync({
			run: () => validateDraftInspectRequest(input),
			stage: "request-validation",
		});
		if (!validated.ok) {
			throw new ImportSessionError({
				code: "invalid-request",
				message: validated.issues
					.map((issue) => `${issue.field}: ${issue.message}`)
					.join("; "),
			});
		}
		const discovery = await stageMetrics.measure({
			run: () =>
				discoverDraftDirectory({
					draftDirectory: validated.request.draftPath,
				}),
			stage: "source-discovery",
		});
		const snapshot = await stageMetrics.measure({
			run: () =>
				readDraftSourceSnapshot({
					rootRealPath: discovery.rootRealPath,
					files: discovery.files,
					...(validated.request.maxFileBytes === undefined
						? {}
						: { maxFileBytes: validated.request.maxFileBytes }),
					...(validated.request.maxTotalBytes === undefined
						? {}
						: { maxTotalBytes: validated.request.maxTotalBytes }),
				}),
			stage: "snapshot-read",
		});
		const { contentSummary, detection } = stageMetrics.measureSync({
			run: () => {
				const summary = buildContentSummary({ snapshot });
				return {
					contentSummary: summary,
					detection: detectDraftProfile({
						files: snapshot.files,
						...(summary === undefined ? {} : { contentSummary: summary }),
					}),
				};
			},
			stage: "profile-detection",
		});

		const inspect: DraftImportInspectDto = {
			outcome: detection.outcome,
			...(detection.profileId === undefined
				? {}
				: { profileId: detection.profileId }),
			canWrite: detection.canWrite,
			fileCount: discovery.files.length,
			skippedEntryCount: discovery.skipped.length,
			hasContentFile: discovery.hasContentFile,
			issues: [...snapshot.issues],
		};

		if (
			detection.outcome !== "exact" ||
			detection.profileId === undefined ||
			contentSummary === undefined
		) {
			return {
				inspect,
				snapshot,
				detection,
				bindings: [],
				restrictedSourcePathsByResourceId: {},
			};
		}

		const profile = getDraftProfile({ profileId: detection.profileId });
		const source: DraftSourceDescriptor = {
			product: profile?.product ?? "jianying",
			profileId: detection.profileId,
			...(contentSummary.appVersion === undefined
				? {}
				: { appVersion: contentSummary.appVersion }),
			...(contentSummary.newVersion === undefined
				? {}
				: { schemaVersion: contentSummary.newVersion }),
			platform: "macos",
			files: snapshot.files.map(({ identity: _identity, ...file }) => file),
		};
		const normalized = stageMetrics.measureSync({
			run: () =>
				normalizeRawDraft({
					content: snapshot.parsedJsonByPath[contentSummary.fileName] as Record<
						string,
						unknown
					>,
					source,
					contentFileName: contentSummary.fileName,
				}),
			stage: "document-normalization",
		});
		const document = normalized.document;
		inspect.issues = [...snapshot.issues, ...document.issues];
		inspect.semantic = {
			trackCount: document.timelines.reduce(
				(total, timeline) => total + timeline.tracks.length,
				0
			),
			segmentCount: document.timelines.reduce(
				(total, timeline) =>
					total +
					timeline.tracks.reduce(
						(trackTotal, track) => trackTotal + track.segments.length,
						0
					),
				0
			),
			resourceCount: document.resources.length,
			capabilityCounts: countCapabilities({ document }),
		};
		return {
			inspect,
			snapshot,
			detection,
			document,
			bindings: normalized.bindings,
			restrictedSourcePathsByResourceId:
				normalized.restrictedSourcePathsByResourceId,
		};
	}

	/** Read-only report. Creates no state. */
	async inspect({ input }: { input: unknown }): Promise<DraftImportInspectDto> {
		const { inspect } = await this.#inspectInternal({
			input,
			stageMetrics: createPlanStageMetrics({ now: this.#metricsNow }),
		});
		return inspect;
	}

	async #prepareExactImport({
		input,
		stageMetrics,
	}: {
		input: unknown;
		stageMetrics: ImportStageMetricsRecorder<ImportPlanStageId>;
	}): Promise<PreparedExactImport> {
		const {
			inspect,
			snapshot,
			detection,
			document,
			bindings,
			restrictedSourcePathsByResourceId,
		} = await this.#inspectInternal({ input, stageMetrics });
		if (detection.outcome !== "exact" || document === undefined) {
			throw new ImportSessionError({
				code: "profile-not-exact",
				message: `cannot plan an import for a ${detection.outcome} profile`,
			});
		}

		const { assets, cacheMetrics, resolvedResources } =
			await stageMetrics.measure({
				run: () =>
					resolveImportAssets({
						resources: document.resources,
						restrictedSourcePathsByResourceId,
						rootRealPath: snapshot.rootRealPath,
					}),
				stage: "asset-resolution",
			});
		const assetIssues = assets.flatMap((asset) => asset.issues);
		return {
			inspect: {
				...inspect,
				issues: [...inspect.issues, ...assetIssues],
			},
			snapshot,
			detection,
			document: {
				...document,
				resources: resolvedResources,
				issues: [...document.issues, ...assetIssues],
			},
			assets,
			assetResolutionCacheMetrics: cacheMetrics,
			bindings,
		};
	}

	/** Inspect + resolve + plan artifact + shared bundle under one token. */
	async plan({ input }: { input: unknown }): Promise<DraftImportPlanDto> {
		const stageMetrics = createPlanStageMetrics({ now: this.#metricsNow });
		const {
			inspect,
			snapshot,
			detection,
			document,
			assets,
			assetResolutionCacheMetrics,
		} = await this.#prepareExactImport({ input, stageMetrics });

		const artifact = createImportPlanArtifact({
			snapshot,
			document,
			detectionOutcome: detection.outcome,
			...(detection.profileId === undefined
				? {}
				: { profileId: detection.profileId }),
			buildIdentity: this.#buildIdentity,
			nowUnixMilliseconds: this.#now(),
			...(this.#planTtlMilliseconds === undefined
				? {}
				: { planTtlMilliseconds: this.#planTtlMilliseconds }),
		});
		const timelinePlan = stageMetrics.measureSync({
			run: () => mapInteropDocumentToQCutPlan({ document }),
			stage: "timeline-mapping",
		});
		const bundleResult = stageMetrics.measureSync({
			run: () => buildQCutImportBundle({ artifact, document, timelinePlan }),
			stage: "bundle-validation",
		});
		if (!bundleResult.ok) {
			throw new ImportSessionError({
				code: "plan-blocked",
				message: "bundle failed shared validation during planning",
			});
		}

		await stageMetrics.measure({
			run: async () => this.#planStore.put({ artifact }),
			stage: "plan-persistence",
		});

		return {
			plan: redactImportPlanArtifactForLog({ artifact }),
			inspect: {
				...inspect,
			},
			assetStatuses: Object.fromEntries(
				assets.map((asset) => [asset.resourceId, asset.status])
			),
			cacheMetrics: {
				assetResolution: assetResolutionCacheMetrics,
			},
			stageMetrics: stageMetrics.snapshot(),
		};
	}

	async #rebuildPlannedState({
		artifact,
	}: {
		artifact: ImportPlanArtifactV1;
	}): Promise<PlannedSessionState> {
		let prepared: PreparedExactImport;
		try {
			const stageMetrics = createPlanStageMetrics({ now: this.#metricsNow });
			prepared = await this.#prepareExactImport({
				input: { draftPath: artifact.restricted.rootRealPath },
				stageMetrics,
			});
		} catch (error) {
			throw new ImportSessionError({
				code: "source-changed",
				message:
					error instanceof Error
						? `source draft can no longer be reconstructed: ${error.message}`
						: "source draft can no longer be reconstructed",
			});
		}
		const currentArtifact = createImportPlanArtifact({
			snapshot: prepared.snapshot,
			document: prepared.document,
			detectionOutcome: prepared.detection.outcome,
			...(prepared.detection.profileId === undefined
				? {}
				: { profileId: prepared.detection.profileId }),
			buildIdentity: this.#buildIdentity,
			nowUnixMilliseconds: artifact.createdAtUnixMilliseconds,
			planTtlMilliseconds:
				artifact.expiresAtUnixMilliseconds - artifact.createdAtUnixMilliseconds,
			planToken: artifact.planToken,
		});
		const isSamePlanInput =
			currentArtifact.requestFingerprint === artifact.requestFingerprint &&
			currentArtifact.issueSetFingerprint === artifact.issueSetFingerprint &&
			currentArtifact.profileId === artifact.profileId &&
			currentArtifact.detectionOutcome === artifact.detectionOutcome &&
			currentArtifact.canCommit === artifact.canCommit &&
			arraysEqual({
				left: currentArtifact.warningFingerprints,
				right: artifact.warningFingerprints,
			}) &&
			arraysEqual({
				left: currentArtifact.blockerFingerprints,
				right: artifact.blockerFingerprints,
			});
		if (!isSamePlanInput) {
			throw new ImportSessionError({
				code: "source-changed",
				message: "source draft or import issues changed since planning",
			});
		}

		const timelinePlan = mapInteropDocumentToQCutPlan({
			document: prepared.document,
		});
		const bundleResult = buildQCutImportBundle({
			artifact,
			document: prepared.document,
			timelinePlan,
		});
		if (!bundleResult.ok) {
			throw new ImportSessionError({
				code: "source-changed",
				message: "reconstructed import bundle failed shared validation",
			});
		}
		return {
			snapshot: prepared.snapshot,
			bundle: bundleResult.bundle,
			resolvedAssets: prepared.assets,
			bindings: prepared.bindings,
		};
	}

	async #prepareCommit({ input }: { input: unknown }): Promise<PreparedCommit> {
		if (
			typeof input !== "object" ||
			input === null ||
			typeof (input as { planToken?: unknown }).planToken !== "string" ||
			!Array.isArray(
				(input as { acceptedWarningFingerprints?: unknown })
					.acceptedWarningFingerprints
			) ||
			!(
				input as { acceptedWarningFingerprints: unknown[] }
			).acceptedWarningFingerprints.every(
				(value) =>
					typeof value === "string" && value.length > 0 && value.length <= 256
			)
		) {
			throw new ImportSessionError({
				code: "invalid-request",
				message: "commit needs planToken and acceptedWarningFingerprints",
			});
		}
		const { planToken, acceptedWarningFingerprints } = input as {
			planToken: string;
			acceptedWarningFingerprints: string[];
		};

		const artifact = await this.#planStore.get({ planToken });
		if (artifact.blockerFingerprints.length > 0) {
			throw new ImportSessionError({
				code: "plan-blocked",
				message: "plan contains blocking issues",
			});
		}
		if (
			!arraysEqual({
				left: acceptedWarningFingerprints,
				right: artifact.warningFingerprints,
			})
		) {
			throw new ImportSessionError({
				code: "warning-acceptance-mismatch",
				message: "accepted warnings must exactly match the planned warnings",
			});
		}
		const session = await this.#rebuildPlannedState({ artifact });
		const changed = await verifyDraftSourceUnchanged({
			snapshot: session.snapshot,
		});
		if (changed.length > 0) {
			throw new ImportSessionError({
				code: "source-changed",
				message: "source draft changed since the plan was created",
			});
		}
		const profile = getDraftProfile({
			profileId: session.bundle.document.source.profileId,
		});
		const envelopeCapture =
			profile === null
				? undefined
				: buildForeignEnvelopeCapture({
						acceptedDowngradeFingerprints: acceptedWarningFingerprints,
						allowlist: profile.envelopeAllowlist,
						bindings: session.bindings,
						importId: planToken,
						profileId: profile.profileId,
						snapshot: session.snapshot,
					});
		// CAS after all retryable validation: only one concurrent caller proceeds.
		await this.#planStore.consume({ planToken });
		return {
			session,
			...(envelopeCapture === undefined ? {} : { envelopeCapture }),
		};
	}

	/** Legacy bounded Base64 commit retained for existing offline callers. */
	async commit({ input }: { input: unknown }): Promise<DraftImportCommitDto> {
		const { envelopeCapture, session } = await this.#prepareCommit({ input });

		let remainingBudget = MAX_TOTAL_MEDIA_PAYLOAD_BYTES;
		const mediaPayloads: DraftImportMediaPayloadDto[] = [];
		for (const asset of session.resolvedAssets) {
			if (
				asset.status !== "resolved" ||
				asset.restrictedAbsolutePath === undefined
			) {
				continue;
			}
			const bytes = await readResolvedAssetPayload({ asset, remainingBudget });
			remainingBudget -= bytes.length;
			const fileName = basename(asset.restrictedAbsolutePath);
			const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
			mediaPayloads.push({
				resourceId: asset.resourceId,
				fileName,
				mimeType: MIME_BY_EXTENSION[extension] ?? "application/octet-stream",
				bytesBase64: bytes.toString("base64"),
			});
		}
		return {
			bundle: session.bundle,
			mediaPayloads,
			...(envelopeCapture === undefined ? {} : { envelopeCapture }),
		};
	}

	/** Path-free live commit whose media stays behind short-lived grants. */
	async commitWithMediaGrants({
		input,
	}: {
		input: unknown;
	}): Promise<DraftImportGrantedCommitDto> {
		const { envelopeCapture, session } = await this.#prepareCommit({ input });
		const mediaGrants = await grantResolvedMedia({
			assets: session.resolvedAssets,
			grantStore: this.#mediaGrantStore,
		});
		return {
			bundle: session.bundle,
			mediaGrants,
			...(envelopeCapture === undefined ? {} : { envelopeCapture }),
		};
	}

	readMediaPayloadChunk({
		input,
	}: {
		input: unknown;
	}): Promise<MediaPayloadChunkDto> {
		return this.#mediaGrantStore.readChunk({ input });
	}

	releaseMediaPayloadGrants({ input }: { input: unknown }): {
		releasedCount: number;
	} {
		return this.#mediaGrantStore.release({ input });
	}

	dispose(): void {
		this.#planStore.dispose?.();
		this.#mediaGrantStore.dispose();
	}
}

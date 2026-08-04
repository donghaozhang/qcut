/**
 * QCut import transaction (JYI-010).
 *
 * The renderer-side commit of a draft import: re-validates the bundle with
 * the SAME shared parser the runtime used, verifies the digest byte-level,
 * journals intent, stages media and timelines under an invisible project
 * id, re-reads what it staged, and only then publishes the project record —
 * the single step that makes the import visible. Any failure after staging
 * begins triggers a full journaled rollback.
 *
 * @module lib/jianying-draft/qcut-import-transaction
 */

import {
	canonicalizeQCutImportBundleForDigest,
	deriveImportInternalId,
	parseForeignDraftEnvelopeV1,
	parseQCutImportBundleV1,
	type ForeignDraftEnvelopeV1,
	type InteropIssue,
	type QCutImportBundleV1,
} from "@qcut/editor-core/draft-interop";
import { isDraftProfileWritable } from "@qcut/editor-core/jianying-draft";
import { debugError, debugLog } from "@/lib/debug/debug-config";
import { generateUUID } from "@/lib/utils";
import type { ImportJournal } from "@/lib/storage/import-journal";
import { importJournal } from "@/lib/storage/import-journal";
import type { ImportStagingStorage } from "@/lib/storage/import-staging-adapter";
import { ImportStagingSession } from "@/lib/storage/import-staging-adapter";
import { storageService } from "@/lib/storage/storage-service";
import type { MediaItem, MediaType } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import {
	deleteEnvelopePayload,
	storeEnvelopePayload,
} from "./envelope-key-adapter";
import { buildQCutImportTimelineElement } from "./qcut-import-element-builder";

/** Decrypted media bytes for one staged resource, provided by transport. */
export interface ImportMediaPayload {
	resourceId: string;
	fileName: string;
	mimeType: string;
	bytes: Uint8Array;
}

export interface ImportEnvelopeCapture {
	envelope: unknown;
	payload: Uint8Array;
	payloadSha256: string;
}

export type ImportTransactionFailureReason =
	| "bundle-invalid"
	| "digest-mismatch"
	| "quota-exceeded"
	| "project-conflict"
	| "payload-missing"
	| "envelope-invalid"
	| "envelope-store-failed"
	| "staging-failed"
	| "verify-failed"
	| "publish-failed";

export type ImportTransactionResult =
	| { ok: true; projectId: string }
	| {
			ok: false;
			reason: ImportTransactionFailureReason;
			message: string;
			issues?: InteropIssue[];
	  };

export type ImportTransactionStorage = ImportStagingStorage & {
	checkStorageQuota: () => Promise<{ available: boolean }>;
};

export interface ImportTransactionDeps {
	storage?: ImportTransactionStorage;
	journal?: ImportJournal;
	now?: () => Date;
	envelopeStore?: ImportEnvelopeStore;
}

export interface ImportEnvelopeStore {
	store: (options: { importId: string; payload: Uint8Array }) => Promise<
		| {
				ok: true;
				value: { location: string; keyVersion: number; sha256: string };
		  }
		| { ok: false; code: string; message: string }
	>;
	delete: (options: { importId: string }) => Promise<unknown>;
}

const defaultEnvelopeStore: ImportEnvelopeStore = {
	store: storeEnvelopePayload,
	delete: deleteEnvelopePayload,
};

async function verifyBundleDigest({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): Promise<boolean> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle === undefined) {
		// Fail closed: without WebCrypto we cannot prove integrity.
		return false;
	}
	const canonical = canonicalizeQCutImportBundleForDigest({ bundle });
	const digest = await subtle.digest(
		"SHA-256",
		new TextEncoder().encode(canonical)
	);
	const hex = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return hex === bundle.bundleDigest;
}

function mediaTypeForResourceKind({ kind }: { kind: string }): MediaType {
	if (kind === "audio") return "audio";
	if (kind === "image") return "image";
	return "video";
}

function buildTimelineTracks({
	bundle,
	mediaItemIdByResourceId,
}: {
	bundle: QCutImportBundleV1;
	mediaItemIdByResourceId: ReadonlyMap<string, string>;
}): TimelineTrack[] {
	const tracks: TimelineTrack[] = [];
	for (const planTrack of bundle.timelinePlan.tracks) {
		const elements = planTrack.elements.map((planElement) =>
			buildQCutImportTimelineElement({
				planElement,
				internalIdBySemanticId: bundle.internalIdBySemanticId,
				mediaItemIdByResourceId,
			})
		);
		const transitions = (planTrack.transitions ?? []).map((transition) => ({
			id: bundle.internalIdBySemanticId[transition.id],
			fromElementId: bundle.internalIdBySemanticId[transition.fromElementId],
			toElementId: bundle.internalIdBySemanticId[transition.toElementId],
			presetId: transition.presetId,
			type: transition.type,
			duration: transition.duration,
			easing: transition.easing,
		}));
		tracks.push({
			id: bundle.internalIdBySemanticId[planTrack.id],
			name: planTrack.name,
			type: planTrack.type,
			elements,
			...(transitions.length === 0 ? {} : { transitions }),
			order: planTrack.order,
			...(planTrack.isMain === true ? { isMain: true } : {}),
		});
	}
	return tracks;
}

/**
 * Stable identity of the source draft: its content hashes, not the bundle
 * digest (which shifts with policy or plan changes for the same source).
 */
function deriveSourceSeed({ bundle }: { bundle: QCutImportBundleV1 }): string {
	const fileHashes = bundle.document.source.files
		.map((file) => file.sha256)
		.sort();
	return fileHashes.length > 0 ? fileHashes.join(",") : bundle.bundleDigest;
}

function buildDraftInteropBinding({
	bundle,
	envelope,
}: {
	bundle: QCutImportBundleV1;
	envelope?: ForeignDraftEnvelopeV1;
}): NonNullable<TProject["draftInterop"]> {
	const writeback =
		envelope === undefined
			? {
					status: "unavailable" as const,
					reason: "envelope-not-captured" as const,
				}
			: isDraftProfileWritable({ profileId: bundle.document.source.profileId })
				? { status: "ready" as const }
				: {
						status: "unavailable" as const,
						reason: "profile-not-writable" as const,
					};
	return {
		schemaVersion: 1,
		importId: bundle.planToken,
		profileId: bundle.document.source.profileId,
		bundleDigest: bundle.bundleDigest,
		sourceFileSha256: bundle.document.source.files
			.map((file) => file.sha256)
			.sort(),
		internalIdBySemanticId: { ...bundle.internalIdBySemanticId },
		baselineDocument: bundle.document,
		writeback,
		...(envelope === undefined ? {} : { envelope }),
	};
}

function validateEnvelopeCapture({
	bundle,
	capture,
}: {
	bundle: QCutImportBundleV1;
	capture: ImportEnvelopeCapture;
}):
	| { ok: true; envelope: ForeignDraftEnvelopeV1 }
	| { ok: false; message: string } {
	const parsed = parseForeignDraftEnvelopeV1(capture.envelope);
	if (!parsed.ok) return { ok: false, message: parsed.reason };
	const envelope = parsed.envelope;
	if (
		envelope.importId !== bundle.planToken ||
		envelope.profileId !== bundle.document.source.profileId ||
		envelope.payloadRef !== undefined ||
		!/^[0-9a-f]{64}$/.test(capture.payloadSha256) ||
		capture.payload.byteLength === 0
	) {
		return {
			ok: false,
			message: "envelope capture metadata does not match the import bundle",
		};
	}
	const sourceFileByPath = new Map(
		bundle.document.source.files.map((file) => [file.relativePath, file])
	);
	for (const entry of envelope.entries) {
		const sourceFile = sourceFileByPath.get(entry.relativePath);
		if (
			sourceFile === undefined ||
			sourceFile.sha256 !== entry.sha256 ||
			sourceFile.byteLength !== entry.byteLength
		) {
			return {
				ok: false,
				message: `envelope entry ${entry.relativePath} is not source-bound`,
			};
		}
	}
	return { ok: true, envelope };
}

async function resolveProjectIdentity({
	bundle,
	storage,
	reuseExistingProject,
}: {
	bundle: QCutImportBundleV1;
	storage: ImportTransactionStorage;
	reuseExistingProject: boolean;
}): Promise<
	| {
			ok: true;
			projectId: string;
			projectName: string;
			reused: boolean;
	  }
	| { ok: false; message: string }
> {
	const deterministicId = deriveImportInternalId({
		seed: deriveSourceSeed({ bundle }),
		semanticId: "qcut-project",
	});
	const existing = await storage.loadProject({ id: deterministicId });
	if (existing === null) {
		return {
			ok: true,
			projectId: deterministicId,
			projectName: bundle.timelinePlan.project.name,
			reused: false,
		};
	}
	if (reuseExistingProject) {
		return {
			ok: true,
			projectId: deterministicId,
			projectName: existing.name,
			reused: true,
		};
	}
	if (bundle.conflictPolicy.projectName === "fail") {
		return {
			ok: false,
			message: "this draft was already imported and the policy is fail",
		};
	}
	// rename: keep both — a fresh id and a disambiguated name.
	return {
		ok: true,
		projectId: generateUUID(),
		projectName: `${bundle.timelinePlan.project.name} (imported)`,
		reused: false,
	};
}

/**
 * Runs the full staged import. `bundleValue` is untrusted input — the
 * transport hands over exactly what it received.
 */
export async function runQCutImportTransaction({
	bundleValue,
	mediaPayloads,
	envelopeCapture,
	reuseExistingProject = false,
	deps = {},
}: {
	bundleValue: unknown;
	mediaPayloads: readonly ImportMediaPayload[];
	envelopeCapture?: ImportEnvelopeCapture;
	/** Offline delivery retry: reuse the deterministic, already-published project. */
	reuseExistingProject?: boolean;
	deps?: ImportTransactionDeps;
}): Promise<ImportTransactionResult> {
	const storage = deps.storage ?? storageService;
	const journal = deps.journal ?? importJournal;
	const now = deps.now ?? (() => new Date());

	const parsed = parseQCutImportBundleV1(bundleValue);
	if (!parsed.ok) {
		return {
			ok: false,
			reason: "bundle-invalid",
			message: "bundle failed shared validation",
			issues: parsed.issues,
		};
	}
	const bundle = parsed.bundle;
	if (!(await verifyBundleDigest({ bundle }))) {
		return {
			ok: false,
			reason: "digest-mismatch",
			message: "bundle digest does not match its canonical serialization",
		};
	}
	let capturedEnvelope: ForeignDraftEnvelopeV1 | undefined;
	if (envelopeCapture !== undefined) {
		const envelopeValidation = validateEnvelopeCapture({
			bundle,
			capture: envelopeCapture,
		});
		if (!envelopeValidation.ok) {
			return {
				ok: false,
				reason: "envelope-invalid",
				message: envelopeValidation.message,
			};
		}
		capturedEnvelope = envelopeValidation.envelope;
	}

	const quota = await storage.checkStorageQuota();
	if (!quota.available) {
		return {
			ok: false,
			reason: "quota-exceeded",
			message: "storage quota is too low to import safely",
		};
	}

	const identity = await resolveProjectIdentity({
		bundle,
		storage,
		reuseExistingProject,
	});
	if (!identity.ok) {
		return { ok: false, reason: "project-conflict", message: identity.message };
	}
	if (identity.reused) return { ok: true, projectId: identity.projectId };

	const payloadByResourceId = new Map(
		mediaPayloads.map((payload) => [payload.resourceId, payload])
	);
	for (const staging of bundle.resourceStaging) {
		if (
			staging.status === "resolved" &&
			!payloadByResourceId.has(staging.resourceId)
		) {
			return {
				ok: false,
				reason: "payload-missing",
				message: `no media payload for resolved resource ${staging.resourceId}`,
			};
		}
	}

	const sceneId = deriveImportInternalId({
		seed: identity.projectId,
		semanticId: "qcut-main-scene",
	});
	const session = new ImportStagingSession({
		importId: bundle.planToken,
		bundleDigest: bundle.bundleDigest,
		projectId: identity.projectId,
		sceneId,
		journal,
		storage,
	});
	await session.begin();

	const mediaItemIdByResourceId = new Map<string, string>();
	try {
		for (const staging of bundle.resourceStaging) {
			const payload = payloadByResourceId.get(staging.resourceId);
			if (payload === undefined) {
				continue; // missing/opaque resources stage nothing
			}
			const mediaItemId = bundle.internalIdBySemanticId[staging.resourceId];
			// Copy into a fresh, exactly-sized buffer — the payload view may
			// share a larger transport buffer.
			const file = new File(
				[new Uint8Array(payload.bytes).buffer as ArrayBuffer],
				payload.fileName,
				{ type: payload.mimeType }
			);
			const mediaItem: MediaItem = {
				id: mediaItemId,
				name: payload.fileName,
				type: mediaTypeForResourceKind({ kind: staging.kind }),
				file,
			};
			await session.stageMediaItem({ mediaItem });
			mediaItemIdByResourceId.set(staging.resourceId, mediaItemId);
		}

		const tracks = buildTimelineTracks({ bundle, mediaItemIdByResourceId });
		await session.stageTimeline({ tracks });

		const verification = await session.verifyStaged({
			expectedMediaCount: mediaItemIdByResourceId.size,
		});
		if (!verification.ok) {
			await session.rollback();
			return {
				ok: false,
				reason: "verify-failed",
				message: verification.reason ?? "staged data failed verification",
			};
		}
	} catch (error) {
		debugError("[QCutImport] Staging failed, rolling back", error);
		await session.rollback();
		return {
			ok: false,
			reason: "staging-failed",
			message: error instanceof Error ? error.message : "staging failed",
		};
	}

	const createdAt = now();
	let storedEnvelope: ForeignDraftEnvelopeV1 | undefined;
	if (envelopeCapture !== undefined && capturedEnvelope !== undefined) {
		const envelopeStore = deps.envelopeStore ?? defaultEnvelopeStore;
		const stored = await envelopeStore.store({
			importId: capturedEnvelope.importId,
			payload: envelopeCapture.payload,
		});
		if (!stored.ok || stored.value.sha256 !== envelopeCapture.payloadSha256) {
			if (stored.ok) {
				await envelopeStore.delete({
					importId: capturedEnvelope.importId,
				});
			}
			await session.rollback();
			return {
				ok: false,
				reason: "envelope-store-failed",
				message: stored.ok
					? "encrypted envelope payload digest mismatch"
					: stored.message,
			};
		}
		storedEnvelope = {
			...capturedEnvelope,
			payloadRef: {
				cipher: "os-keychain-wrapped",
				location: stored.value.location,
				keyVersion: stored.value.keyVersion,
			},
		};
	}
	const project: TProject = {
		id: identity.projectId,
		name: identity.projectName,
		thumbnail: "",
		createdAt,
		updatedAt: createdAt,
		scenes: [
			{
				id: sceneId,
				name: "Main Scene",
				isMain: true,
				createdAt,
				updatedAt: createdAt,
			},
		],
		currentSceneId: sceneId,
		canvasSize: {
			width: bundle.timelinePlan.project.width,
			height: bundle.timelinePlan.project.height,
		},
		canvasMode: "custom",
		fps: bundle.timelinePlan.project.fps,
		draftInterop: buildDraftInteropBinding({
			bundle,
			...(storedEnvelope === undefined ? {} : { envelope: storedEnvelope }),
		}),
	};
	try {
		await session.publishProject({ project });
	} catch (error) {
		debugError("[QCutImport] Publish failed, rolling back", error);
		if (storedEnvelope !== undefined) {
			const envelopeStore = deps.envelopeStore ?? defaultEnvelopeStore;
			await envelopeStore.delete({ importId: storedEnvelope.importId });
		}
		await session.rollback();
		return {
			ok: false,
			reason: "publish-failed",
			message: error instanceof Error ? error.message : "publish failed",
		};
	}
	debugLog("[QCutImport] Imported project", identity.projectId);
	return { ok: true, projectId: identity.projectId };
}

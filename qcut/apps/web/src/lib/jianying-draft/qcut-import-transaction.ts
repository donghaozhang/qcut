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
	parseQCutImportBundleV1,
	type InteropIssue,
	type QCutImportBundleV1,
} from "@qcut/editor-core/draft-interop";
import { debugError, debugLog } from "@/lib/debug/debug-config";
import { generateUUID } from "@/lib/utils";
import type { ImportJournal } from "@/lib/storage/import-journal";
import { importJournal } from "@/lib/storage/import-journal";
import type { ImportStagingStorage } from "@/lib/storage/import-staging-adapter";
import { ImportStagingSession } from "@/lib/storage/import-staging-adapter";
import { storageService } from "@/lib/storage/storage-service";
import type { MediaItem, MediaType } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

/** Decrypted media bytes for one staged resource, provided by transport. */
export interface ImportMediaPayload {
	resourceId: string;
	fileName: string;
	mimeType: string;
	bytes: Uint8Array;
}

export type ImportTransactionFailureReason =
	| "bundle-invalid"
	| "digest-mismatch"
	| "quota-exceeded"
	| "project-conflict"
	| "payload-missing"
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
}

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
		const elements: MediaElement[] = [];
		for (const planElement of planTrack.elements) {
			const mediaId = mediaItemIdByResourceId.get(planElement.resourceId);
			if (mediaId === undefined) {
				throw new Error(
					`plan element ${planElement.id} has no staged media item`
				);
			}
			elements.push({
				id: bundle.internalIdBySemanticId[planElement.id],
				type: "media",
				mediaId,
				name: planElement.name,
				duration: planElement.duration,
				startTime: planElement.startTime,
				trimStart: planElement.trimStart,
				trimEnd: planElement.trimEnd,
				...(planElement.speed === undefined
					? {}
					: { playbackRate: planElement.speed }),
			});
		}
		tracks.push({
			id: bundle.internalIdBySemanticId[planTrack.id],
			name: planTrack.name,
			type: planTrack.type,
			elements,
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

async function resolveProjectIdentity({
	bundle,
	storage,
}: {
	bundle: QCutImportBundleV1;
	storage: ImportTransactionStorage;
}): Promise<
	| { ok: true; projectId: string; projectName: string }
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
	};
}

/**
 * Runs the full staged import. `bundleValue` is untrusted input — the
 * transport hands over exactly what it received.
 */
export async function runQCutImportTransaction({
	bundleValue,
	mediaPayloads,
	deps = {},
}: {
	bundleValue: unknown;
	mediaPayloads: readonly ImportMediaPayload[];
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

	const quota = await storage.checkStorageQuota();
	if (!quota.available) {
		return {
			ok: false,
			reason: "quota-exceeded",
			message: "storage quota is too low to import safely",
		};
	}

	const identity = await resolveProjectIdentity({ bundle, storage });
	if (!identity.ok) {
		return { ok: false, reason: "project-conflict", message: identity.message };
	}

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
	};
	try {
		await session.publishProject({ project });
	} catch (error) {
		debugError("[QCutImport] Publish failed, rolling back", error);
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

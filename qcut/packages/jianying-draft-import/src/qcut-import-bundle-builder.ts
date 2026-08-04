/**
 * QCutImportBundle builder (JYI-009).
 *
 * Assembles the shared bundle from a consumed plan artifact, the semantic
 * document, and the QCut timeline plan. Internal ids derive
 * deterministically from the artifact's requestFingerprint, so re-planning
 * the same source yields the same QCut entity ids. The digest is sha256
 * over the canonical serialization defined in editor-core — the renderer
 * re-hashes the same canonical string before staging anything.
 *
 * @module @qcut/jianying-draft-import/qcut-import-bundle-builder
 */

import { createHash } from "node:crypto";
import {
	canonicalizeQCutImportBundleForDigest,
	deriveImportInternalId,
	parseQCutImportBundleV1,
	QCUT_IMPORT_BUNDLE_SCHEMA_VERSION,
	type DraftInteropDocumentV1,
	type InteropIssue,
	type QCutImportBundleResourceStaging,
	type QCutImportBundleV1,
	type QCutImportProjectNameConflictPolicy,
} from "@qcut/editor-core/draft-interop";
import type { QCutImportTimelinePlanV1 } from "@qcut/editor-core/jianying-draft";
import type { ImportPlanArtifactV1 } from "./import-plan-artifact.js";

function sha256Hex({ value }: { value: string }): string {
	return createHash("sha256").update(value).digest("hex");
}

/** Computes the bundle digest over the shared canonical serialization. */
export function computeQCutImportBundleDigest({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): string {
	return sha256Hex({
		value: canonicalizeQCutImportBundleForDigest({ bundle }),
	});
}

/** Byte-level digest verification for a received (already parsed) bundle. */
export function verifyQCutImportBundleDigest({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): boolean {
	return computeQCutImportBundleDigest({ bundle }) === bundle.bundleDigest;
}

export type BuildQCutImportBundleResult =
	| { ok: true; bundle: QCutImportBundleV1 }
	| { ok: false; issues: InteropIssue[] };

/**
 * Builds and self-validates the bundle. The builder runs the SAME
 * fail-closed parser the renderer runs — a bundle that cannot be parsed is
 * never handed out.
 */
export function buildQCutImportBundle({
	artifact,
	document,
	timelinePlan,
	conflictPolicy = "rename",
}: {
	artifact: ImportPlanArtifactV1;
	document: DraftInteropDocumentV1;
	timelinePlan: QCutImportTimelinePlanV1;
	conflictPolicy?: QCutImportProjectNameConflictPolicy;
}): BuildQCutImportBundleResult {
	const seed = artifact.requestFingerprint;
	const internalIdBySemanticId: Record<string, string> = {};
	for (const track of timelinePlan.tracks) {
		internalIdBySemanticId[track.id] = deriveImportInternalId({
			seed,
			semanticId: track.id,
		});
		for (const element of track.elements) {
			internalIdBySemanticId[element.id] = deriveImportInternalId({
				seed,
				semanticId: element.id,
			});
		}
	}

	const referencedResourceIds = new Set(timelinePlan.resourceIds);
	const resourceStaging: QCutImportBundleResourceStaging[] = [];
	for (const resource of document.resources) {
		if (!referencedResourceIds.has(resource.id)) {
			continue;
		}
		internalIdBySemanticId[resource.id] = deriveImportInternalId({
			seed,
			semanticId: resource.id,
		});
		resourceStaging.push({
			resourceId: resource.id,
			// Storage-internal key, deterministic per plan; never a path.
			stagingKey: `import-${artifact.planToken}-${deriveImportInternalId({
				seed,
				semanticId: resource.id,
			})}`,
			kind: resource.kind,
			status: resource.status,
			...(resource.sha256 === undefined ? {} : { sha256: resource.sha256 }),
			...(resource.byteLength === undefined
				? {}
				: { byteLength: resource.byteLength }),
		});
	}

	const unsigned: QCutImportBundleV1 = {
		schemaVersion: QCUT_IMPORT_BUNDLE_SCHEMA_VERSION,
		bundleDigest: "0".repeat(64),
		planToken: artifact.planToken,
		buildIdentity: { ...artifact.buildIdentity },
		createdAtUnixMilliseconds: artifact.createdAtUnixMilliseconds,
		conflictPolicy: { projectName: conflictPolicy },
		document,
		timelinePlan,
		resourceStaging,
		internalIdBySemanticId,
	};
	const bundle: QCutImportBundleV1 = {
		...unsigned,
		bundleDigest: computeQCutImportBundleDigest({ bundle: unsigned }),
	};

	const parsed = parseQCutImportBundleV1(JSON.parse(JSON.stringify(bundle)));
	if (!parsed.ok) {
		return { ok: false, issues: parsed.issues };
	}
	return { ok: true, bundle: parsed.bundle };
}

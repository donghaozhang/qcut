/**
 * Import provenance: profile evidence and raw-node bindings (JYI-002).
 *
 * Provenance ties every semantic node back to the exact raw file and JSON
 * location it came from, and records how the profile was detected. Original
 * user paths are RESTRICTED: they live only in the local provenance record
 * and must never reach logs, issues, CLI output, or exported evidence —
 * `redactProvenanceForEvidence` is the only sanctioned serialization.
 *
 * @module @qcut/editor-core/draft-interop/provenance
 */

import type { DraftSourceDescriptor } from "./document.js";

/** Stable binding from a raw draft node to a semantic id. */
export interface RawNodeBinding {
	/** Binding key referenced by document/envelope nodes, e.g. "raw:0". */
	foreignRef: string;
	/** Relative path of the file inside the source snapshot manifest. */
	file: string;
	/** JSON-pointer location of the node inside that file. */
	jsonPointer: string;
	/** Bound semantic id; unknown subtrees bind their owner instead. */
	semanticId?: string;
}

export type ProfileDetectionOutcome =
	| "exact"
	| "ambiguous"
	| "unsupported"
	| "encrypted";

export type ProfileDetectionSignalKind =
	| "app-metadata"
	| "schema-version"
	| "top-level-keys"
	| "file-layout"
	| "timeline-registry"
	| "path-pattern";

export interface ProfileDetectionSignal {
	kind: ProfileDetectionSignalKind;
	/** What was observed — a version string, key-set digest, layout name. */
	value: string;
	matched: boolean;
}

export interface ProfileDetectionEvidence {
	profileId: string;
	outcome: ProfileDetectionOutcome;
	signals: ProfileDetectionSignal[];
}

export interface DraftImportProvenanceV1 {
	schemaVersion: 1;
	importId: string;
	source: DraftSourceDescriptor;
	detection: ProfileDetectionEvidence;
	bindings: RawNodeBinding[];
	/**
	 * RESTRICTED. Original absolute source paths for local re-resolution
	 * only. Excluded from every serialization except local private storage.
	 */
	restrictedSourcePaths?: string[];
}

/** Keys that must never leave the local provenance record. */
export const PROVENANCE_RESTRICTED_KEYS = ["restrictedSourcePaths"] as const;

export interface RedactedProvenanceEvidence {
	schemaVersion: 1;
	importId: string;
	source: DraftSourceDescriptor;
	detection: ProfileDetectionEvidence;
	bindingCount: number;
}

/**
 * The only sanctioned serialization for logs, CLI output, and evidence
 * packages: restricted keys are removed structurally (not blanked), and
 * bindings collapse to a count so JSON pointers cannot smuggle path hints.
 */
export function redactProvenanceForEvidence({
	provenance,
}: {
	provenance: DraftImportProvenanceV1;
}): RedactedProvenanceEvidence {
	return {
		schemaVersion: provenance.schemaVersion,
		importId: provenance.importId,
		source: provenance.source,
		detection: provenance.detection,
		bindingCount: provenance.bindings.length,
	};
}

/**
 * Fail-closed guard for arbitrary serializers: throws when a value that is
 * about to leave the process still carries restricted provenance keys.
 */
export function assertNoRestrictedProvenanceFields({
	value,
}: {
	value: unknown;
}): void {
	const stack: unknown[] = [value];
	while (stack.length > 0) {
		const current = stack.pop();
		if (typeof current !== "object" || current === null) continue;
		if (Array.isArray(current)) {
			stack.push(...current);
			continue;
		}
		for (const [key, child] of Object.entries(current)) {
			if ((PROVENANCE_RESTRICTED_KEYS as readonly string[]).includes(key)) {
				throw new Error(
					`Restricted provenance field "${key}" must not be serialized.`
				);
			}
			stack.push(child);
		}
	}
}

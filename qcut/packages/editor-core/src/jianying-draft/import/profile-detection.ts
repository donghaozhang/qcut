/**
 * Profile detection (JYI-003).
 *
 * Detection weighs several independent signals — app metadata, schema
 * version, top-level key set, and file layout — and never decides from a
 * file name alone. An ambiguous or unsupported outcome can still be
 * inspected, but it can never write: there is no "closest version" here
 * (JYR-003 gate).
 *
 * @module @qcut/editor-core/jianying-draft/import/profile-detection
 */

import type {
	ProfileDetectionEvidence,
	ProfileDetectionSignal,
} from "../../draft-interop/provenance.js";
import type { DraftSourceFile } from "../../draft-interop/document.js";
import "../profiles/index.js";
import {
	isDraftProfileWritable,
	listDraftProfiles,
	type DraftProfileContract,
} from "../profiles/registry.js";

/** Parsed, bounded summary of the plaintext content file (runtime-read). */
export interface DraftContentSummary {
	fileName: string;
	topLevelKeys: readonly string[];
	appId?: number;
	appSource?: string;
	appVersion?: string;
	/** The content's `version` field, e.g. 360000. */
	schemaVersion?: number;
	/** The content's `new_version` field, e.g. "159.0.0". */
	newVersion?: string;
}

export interface ProfileDetectionInput {
	/** Immutable snapshot manifest (names, classifications, hashes). */
	files: readonly DraftSourceFile[];
	/** Absent when no verified plaintext content file exists. */
	contentSummary?: DraftContentSummary;
}

export type ProfileDetectionOutcomeKind =
	| "exact"
	| "ambiguous"
	| "unsupported"
	| "encrypted";

export interface ProfileDetectionCandidate {
	profileId: string;
	signals: ProfileDetectionSignal[];
	/** Every discriminating signal matched. */
	strong: boolean;
	/** At least one discriminating signal matched. */
	partial: boolean;
}

export interface ProfileDetectionResult {
	outcome: ProfileDetectionOutcomeKind;
	/** Present only for an `exact` outcome. */
	profileId?: string;
	candidates: ProfileDetectionCandidate[];
	/**
	 * Writable round-trips require an exact outcome AND stable writeback on
	 * the detected profile. Ambiguous, unsupported, and encrypted are never
	 * writable — inspect only.
	 */
	canWrite: boolean;
}

const CONTENT_FILE_NAMES = new Set(["draft_info.json", "draft_content.json"]);

function evaluateCandidate({
	contract,
	input,
}: {
	contract: DraftProfileContract;
	input: ProfileDetectionInput;
}): ProfileDetectionCandidate {
	const summary = input.contentSummary;
	const signals: ProfileDetectionSignal[] = [];

	const metadataKnown =
		summary?.appId !== undefined && summary.appSource !== undefined;
	const metadataMatched =
		metadataKnown &&
		summary.appId === contract.appId &&
		summary.appSource === contract.appSource;
	signals.push({
		kind: "app-metadata",
		value: metadataKnown ? `${summary.appSource}:${summary.appId}` : "absent",
		matched: metadataMatched,
	});

	const schemaMatched =
		summary?.schemaVersion === contract.schemaVersion &&
		summary.newVersion === contract.newVersion;
	signals.push({
		kind: "schema-version",
		value: summary
			? `${summary.schemaVersion ?? "?"}/${summary.newVersion ?? "?"}`
			: "absent",
		matched: schemaMatched,
	});

	// The contract's canonical keys must all be present. Extra observed
	// keys are allowed (newer minor builds add keys), which is exactly why
	// key-set containment alone can be ambiguous across related profiles.
	const observedKeys = new Set(summary?.topLevelKeys ?? []);
	const keysMatched =
		summary !== undefined &&
		contract.topLevelKeys.every((key) => observedKeys.has(key));
	signals.push({
		kind: "top-level-keys",
		value: `${observedKeys.size} keys observed`,
		matched: keysMatched,
	});

	const layoutMatched =
		summary !== undefined &&
		contract.contentFileNames.includes(summary.fileName) &&
		input.files.some(
			(file) =>
				file.relativePath === summary.fileName &&
				file.classification === "plaintext-json"
		);
	signals.push({
		kind: "file-layout",
		value: summary?.fileName ?? "absent",
		matched: layoutMatched,
	});

	const matchedCount = signals.filter((signal) => signal.matched).length;
	return {
		profileId: contract.profileId,
		signals,
		strong: matchedCount === signals.length,
		partial: matchedCount > 0,
	};
}

export function detectDraftProfile(
	input: ProfileDetectionInput
): ProfileDetectionResult {
	// Encrypted content is terminal: parse and write stay blocked (JYR-002).
	const encryptedContent = input.files.some(
		(file) =>
			CONTENT_FILE_NAMES.has(file.relativePath) &&
			file.classification === "encrypted"
	);
	if (encryptedContent) {
		return { outcome: "encrypted", candidates: [], canWrite: false };
	}

	const candidates = listDraftProfiles().map((contract) =>
		evaluateCandidate({ contract, input })
	);
	const strong = candidates.filter((candidate) => candidate.strong);
	const partial = candidates.filter((candidate) => candidate.partial);

	if (strong.length === 1) {
		const profileId = strong[0].profileId;
		return {
			outcome: "exact",
			profileId,
			candidates,
			canWrite: isDraftProfileWritable({ profileId }),
		};
	}
	if (strong.length > 1 || partial.length > 0) {
		return { outcome: "ambiguous", candidates, canWrite: false };
	}
	return { outcome: "unsupported", candidates, canWrite: false };
}

/** Provenance-shaped evidence for the detection outcome. */
export function toProfileDetectionEvidence({
	result,
}: {
	result: ProfileDetectionResult;
}): ProfileDetectionEvidence {
	const winner =
		result.profileId === undefined
			? undefined
			: result.candidates.find(
					(candidate) => candidate.profileId === result.profileId
				);
	return {
		profileId: result.profileId ?? "",
		outcome: result.outcome,
		signals: winner?.signals ?? [],
	};
}

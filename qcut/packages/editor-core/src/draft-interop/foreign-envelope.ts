/**
 * ForeignDraftEnvelope schema — deny-by-default preservation (JYI-002).
 *
 * The envelope is private, local project data. This schema carries only
 * metadata: file identities, raw-node bindings, unknown-subtree ownership,
 * dirty domains, and accepted downgrade fingerprints. Raw bytes never sit
 * inline — they live behind an encrypted payload reference owned by the
 * key service (JYI-011). Sidecar admission is deny-by-default (JYR-006):
 * a file enters only through an evidence-backed allowlist entry, and the
 * hard-deny list wins even over an allowlist mistake.
 *
 * @module @qcut/editor-core/draft-interop/foreign-envelope
 */

import type {
	InteropDirtyDomain,
	UnknownSubtreeOwnership,
} from "./dirty-domains.js";
import { isInteropDirtyDomain } from "./dirty-domains.js";
import type { RawNodeBinding } from "./provenance.js";

export const FOREIGN_ENVELOPE_SCHEMA_VERSION = 1 as const;

/**
 * Never admissible, regardless of allowlists: key stores, live-project
 * locks, logs, and app-private caches (JYR-006 sensitivity audit).
 */
const HARD_DENIED_PATTERNS: readonly RegExp[] = [
	/(^|\/)crypto_key_store\.dat$/i,
	/\.locked$/i,
	/\.log$/i,
	/(^|\/)logs?(\/|$)/i,
	/(^|\/)caches?(\/|$)/i,
];

export type EnvelopeAllowlistEvidenceKind =
	| "real-app-file-access"
	| "same-profile-round-trip";

/** An evidence-backed reason a specific sidecar may be preserved. */
export interface ForeignEnvelopeAllowlistEntry {
	id: string;
	/** Exact relative path or trailing-wildcard prefix ("attachment/*"). */
	relativePath: string;
	evidence: EnvelopeAllowlistEvidenceKind;
}

export type EnvelopeFileDecision =
	| { decision: "allowed"; allowlistEntryId: string }
	| {
			decision: "denied";
			reason: "hard-denied" | "not-allowlisted" | "unsafe-path";
	  };

function isUnsafeRelativePath({
	relativePath,
}: {
	relativePath: string;
}): boolean {
	if (relativePath.length === 0) return true;
	if (relativePath.startsWith("/") || /^[a-z]:[/\\]/i.test(relativePath)) {
		return true;
	}
	const segments = relativePath.split(/[/\\]/);
	return segments.some((segment) => segment === ".." || segment === "");
}

function allowlistMatches({
	entry,
	relativePath,
}: {
	entry: ForeignEnvelopeAllowlistEntry;
	relativePath: string;
}): boolean {
	if (entry.relativePath.endsWith("/*")) {
		const prefix = entry.relativePath.slice(0, -1);
		return relativePath.startsWith(prefix);
	}
	return relativePath === entry.relativePath;
}

/**
 * Deny-by-default admission: unsafe paths and hard-denied names never
 * enter; everything else requires a matching allowlist entry.
 */
export function evaluateEnvelopeFileCandidate({
	relativePath,
	allowlist,
}: {
	relativePath: string;
	allowlist: readonly ForeignEnvelopeAllowlistEntry[];
}): EnvelopeFileDecision {
	if (isUnsafeRelativePath({ relativePath })) {
		return { decision: "denied", reason: "unsafe-path" };
	}
	if (HARD_DENIED_PATTERNS.some((pattern) => pattern.test(relativePath))) {
		return { decision: "denied", reason: "hard-denied" };
	}
	const entry = allowlist.find((candidate) =>
		allowlistMatches({ entry: candidate, relativePath })
	);
	if (!entry) {
		return { decision: "denied", reason: "not-allowlisted" };
	}
	return { decision: "allowed", allowlistEntryId: entry.id };
}

/** One preserved file. Identity only — bytes live behind `payloadRef`. */
export interface ForeignEnvelopeEntry {
	relativePath: string;
	sha256: string;
	byteLength: number;
	/** Allowlist entry that justified admission. */
	allowlistEntryId: string;
	storage: "raw" | "compressed";
}

/** Reference to the encrypted-at-rest payload (key service, JYI-011). */
export interface ForeignEnvelopePayloadRef {
	keyVersion: number;
	cipher: "os-keychain-wrapped";
	/** Opaque locator inside private app data; never a user path. */
	location: string;
}

export interface ForeignDraftEnvelopeV1 {
	schemaVersion: typeof FOREIGN_ENVELOPE_SCHEMA_VERSION;
	importId: string;
	profileId: string;
	entries: ForeignEnvelopeEntry[];
	bindings: RawNodeBinding[];
	unknownSubtrees: UnknownSubtreeOwnership[];
	/** Domains dirtied since import, across the whole project. */
	dirtyDomains: InteropDirtyDomain[];
	acceptedDowngradeFingerprints: string[];
	payloadRef?: ForeignEnvelopePayloadRef;
}

export type ParseForeignDraftEnvelopeResult =
	| { ok: true; envelope: ForeignDraftEnvelopeV1 }
	| { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
	return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function parsePayloadRef(
	value: unknown
): ForeignEnvelopePayloadRef | undefined {
	if (!isRecord(value)) return undefined;
	if (
		!Number.isSafeInteger(value.keyVersion) ||
		(value.keyVersion as number) < 1 ||
		value.cipher !== "os-keychain-wrapped" ||
		typeof value.location !== "string" ||
		value.location.length === 0
	) {
		return undefined;
	}
	return {
		keyVersion: value.keyVersion as number,
		cipher: value.cipher,
		location: value.location,
	};
}

/** Parses untrusted IPC/storage metadata without admitting partial shapes. */
export function parseForeignDraftEnvelopeV1(
	value: unknown
): ParseForeignDraftEnvelopeResult {
	if (!isRecord(value)) return { ok: false, reason: "expected an object" };
	if (
		value.schemaVersion !== FOREIGN_ENVELOPE_SCHEMA_VERSION ||
		typeof value.importId !== "string" ||
		value.importId.length === 0 ||
		typeof value.profileId !== "string" ||
		value.profileId.length === 0 ||
		!Array.isArray(value.entries) ||
		!Array.isArray(value.bindings) ||
		!Array.isArray(value.unknownSubtrees) ||
		!Array.isArray(value.dirtyDomains) ||
		!Array.isArray(value.acceptedDowngradeFingerprints)
	) {
		return { ok: false, reason: "missing required envelope fields" };
	}

	const entries: ForeignEnvelopeEntry[] = [];
	for (const candidate of value.entries) {
		if (
			!isRecord(candidate) ||
			typeof candidate.relativePath !== "string" ||
			!isSha256(candidate.sha256) ||
			!Number.isSafeInteger(candidate.byteLength) ||
			(candidate.byteLength as number) < 0 ||
			typeof candidate.allowlistEntryId !== "string" ||
			candidate.allowlistEntryId.length === 0 ||
			(candidate.storage !== "raw" && candidate.storage !== "compressed")
		) {
			return { ok: false, reason: "malformed envelope entry" };
		}
		entries.push({
			relativePath: candidate.relativePath,
			sha256: candidate.sha256,
			byteLength: candidate.byteLength as number,
			allowlistEntryId: candidate.allowlistEntryId,
			storage: candidate.storage,
		});
	}

	const bindings: RawNodeBinding[] = [];
	for (const candidate of value.bindings) {
		if (
			!isRecord(candidate) ||
			typeof candidate.foreignRef !== "string" ||
			typeof candidate.file !== "string" ||
			typeof candidate.jsonPointer !== "string" ||
			(candidate.semanticId !== undefined &&
				typeof candidate.semanticId !== "string")
		) {
			return { ok: false, reason: "malformed envelope binding" };
		}
		bindings.push({
			foreignRef: candidate.foreignRef,
			file: candidate.file,
			jsonPointer: candidate.jsonPointer,
			...(candidate.semanticId === undefined
				? {}
				: { semanticId: candidate.semanticId as string }),
		});
	}

	const unknownSubtrees: UnknownSubtreeOwnership[] = [];
	for (const candidate of value.unknownSubtrees) {
		if (
			!isRecord(candidate) ||
			typeof candidate.foreignRef !== "string" ||
			typeof candidate.ownerSemanticId !== "string" ||
			!Array.isArray(candidate.ownedDomains) ||
			!candidate.ownedDomains.every(isInteropDirtyDomain)
		) {
			return { ok: false, reason: "malformed unknown-subtree ownership" };
		}
		unknownSubtrees.push({
			foreignRef: candidate.foreignRef,
			ownerSemanticId: candidate.ownerSemanticId,
			ownedDomains: [...candidate.ownedDomains],
		});
	}

	if (
		!value.dirtyDomains.every(isInteropDirtyDomain) ||
		!value.acceptedDowngradeFingerprints.every(
			(fingerprint) => typeof fingerprint === "string"
		)
	) {
		return { ok: false, reason: "malformed envelope policy fields" };
	}
	const payloadRef =
		value.payloadRef === undefined
			? undefined
			: parsePayloadRef(value.payloadRef);
	if (value.payloadRef !== undefined && payloadRef === undefined) {
		return { ok: false, reason: "malformed envelope payload reference" };
	}

	const envelope: ForeignDraftEnvelopeV1 = {
		schemaVersion: FOREIGN_ENVELOPE_SCHEMA_VERSION,
		importId: value.importId,
		profileId: value.profileId,
		entries,
		bindings,
		unknownSubtrees,
		dirtyDomains: [...value.dirtyDomains],
		acceptedDowngradeFingerprints: [
			...value.acceptedDowngradeFingerprints,
		] as string[],
		...(payloadRef === undefined ? {} : { payloadRef }),
	};
	const validation = validateForeignEnvelopeEntries({ envelope });
	return validation.ok
		? { ok: true, envelope }
		: { ok: false, reason: validation.violations.join("; ") };
}

/**
 * Fail-closed structural check for a persisted envelope: every entry must
 * be a safe relative path outside the hard-deny list. Hand-crafted or
 * migrated envelopes that violate the contract are rejected, not repaired.
 */
export function validateForeignEnvelopeEntries({
	envelope,
}: {
	envelope: ForeignDraftEnvelopeV1;
}): { ok: true } | { ok: false; violations: string[] } {
	const violations: string[] = [];
	for (const entry of envelope.entries) {
		if (isUnsafeRelativePath({ relativePath: entry.relativePath })) {
			violations.push(`unsafe path: ${entry.relativePath}`);
			continue;
		}
		if (
			HARD_DENIED_PATTERNS.some((pattern) => pattern.test(entry.relativePath))
		) {
			violations.push(`hard-denied path: ${entry.relativePath}`);
		}
	}
	return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

import { describe, expect, it } from "vitest";
import {
	evaluateUnknownSubtree,
	evaluateUnknownSubtrees,
	type InteropDirtyDomain,
} from "../draft-interop/dirty-domains.js";
import {
	evaluateEnvelopeFileCandidate,
	parseForeignDraftEnvelopeV1,
	validateForeignEnvelopeEntries,
	type ForeignDraftEnvelopeV1,
	type ForeignEnvelopeAllowlistEntry,
} from "../draft-interop/foreign-envelope.js";
import {
	assertNoRestrictedProvenanceFields,
	redactProvenanceForEvidence,
	type DraftImportProvenanceV1,
} from "../draft-interop/provenance.js";

/**
 * JYI-002 acceptance: the ownership/dirty-domain matrix, deny-by-default
 * envelope admission, and rejection of restricted-field serialization.
 */

describe("unknown-subtree ownership matrix", () => {
	const ownership = {
		foreignRef: "raw:7",
		ownerSemanticId: "segment-1",
		ownedDomains: ["style", "resource"] as InteropDirtyDomain[],
	};

	it.each([
		// [ownerDeleted, dirtyDomains, expected]
		[false, [], "preserve"],
		[false, ["metadata"], "preserve"],
		[false, ["timing", "geometry"], "preserve"],
		[false, ["style"], "conflict"],
		[false, ["resource"], "conflict"],
		[false, ["metadata", "style"], "conflict"],
		[false, ["structure"], "conflict"],
		[false, ["structure", "metadata"], "conflict"],
		[true, [], "drop"],
		[true, ["style"], "drop"],
	] as const)("ownerDeleted=%s dirty=%j -> %s", (ownerDeleted, dirtyDomains, expected) => {
		expect(
			evaluateUnknownSubtree({
				ownership,
				ownerDeleted,
				ownerDirtyDomains: dirtyDomains as InteropDirtyDomain[],
			})
		).toBe(expected);
	});

	it("evaluates a whole envelope's subtrees by owner", () => {
		const decisions = evaluateUnknownSubtrees({
			subtrees: [
				ownership,
				{
					foreignRef: "raw:8",
					ownerSemanticId: "segment-2",
					ownedDomains: ["timing"],
				},
				{
					foreignRef: "raw:9",
					ownerSemanticId: "segment-3",
					ownedDomains: ["style"],
				},
			],
			deletedOwnerIds: new Set(["segment-3"]),
			dirtyDomainsByOwnerId: new Map([
				["segment-1", ["metadata"] as InteropDirtyDomain[]],
				["segment-2", ["timing"] as InteropDirtyDomain[]],
			]),
		});
		expect(decisions.get("raw:7")).toBe("preserve");
		expect(decisions.get("raw:8")).toBe("conflict");
		expect(decisions.get("raw:9")).toBe("drop");
	});
});

describe("foreign envelope deny-by-default", () => {
	const allowlist: ForeignEnvelopeAllowlistEntry[] = [
		{
			id: "content-file",
			relativePath: "draft_info.json",
			evidence: "same-profile-round-trip",
		},
		{
			id: "attachments",
			relativePath: "attachment/*",
			evidence: "real-app-file-access",
		},
	];

	it.each([
		["draft_info.json", "allowed"],
		["attachment/pc_common.json", "allowed"],
		["draft_meta_info.json", "denied"], // not allowlisted
		["crypto_key_store.dat", "denied"],
		["attachment/crypto_key_store.dat", "denied"], // hard deny beats allowlist
		["project.locked", "denied"],
		["logs/session.log", "denied"],
		["cache/pack.bin", "denied"],
		["../outside.json", "denied"],
		["/etc/passwd", "denied"],
		["attachment//double.json", "denied"],
	] as const)("%s -> %s", (relativePath, expected) => {
		const result = evaluateEnvelopeFileCandidate({ relativePath, allowlist });
		expect(result.decision).toBe(expected);
	});

	it("records which allowlist entry admitted a file", () => {
		const result = evaluateEnvelopeFileCandidate({
			relativePath: "attachment/pc_common.json",
			allowlist,
		});
		expect(result).toEqual({
			decision: "allowed",
			allowlistEntryId: "attachments",
		});
	});

	it("rejects persisted envelopes with hard-denied or unsafe entries", () => {
		const envelope: ForeignDraftEnvelopeV1 = {
			schemaVersion: 1,
			importId: "import-1",
			profileId: "capcut-desktop-8.1-plaintext",
			entries: [
				{
					relativePath: "draft_info.json",
					sha256: "a".repeat(64),
					byteLength: 10,
					allowlistEntryId: "content-file",
					storage: "raw",
				},
				{
					relativePath: "../escape.json",
					sha256: "b".repeat(64),
					byteLength: 10,
					allowlistEntryId: "content-file",
					storage: "raw",
				},
				{
					relativePath: "crypto_key_store.dat",
					sha256: "c".repeat(64),
					byteLength: 10,
					allowlistEntryId: "content-file",
					storage: "raw",
				},
			],
			bindings: [],
			unknownSubtrees: [],
			dirtyDomains: [],
			acceptedDowngradeFingerprints: [],
		};
		const result = validateForeignEnvelopeEntries({ envelope });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.violations).toEqual([
			"unsafe path: ../escape.json",
			"hard-denied path: crypto_key_store.dat",
		]);
	});

	it("parses a complete persisted envelope", () => {
		const result = parseForeignDraftEnvelopeV1({
			schemaVersion: 1,
			importId: "import-1",
			profileId: "capcut-desktop-8.1-plaintext",
			entries: [
				{
					relativePath: "draft_info.json",
					sha256: "a".repeat(64),
					byteLength: 10,
					allowlistEntryId: "content-file",
					storage: "raw",
				},
			],
			bindings: [
				{
					foreignRef: "raw:0",
					file: "draft_info.json",
					jsonPointer: "/tracks/0",
					semanticId: "track-0",
				},
			],
			unknownSubtrees: [
				{
					foreignRef: "raw:1",
					ownerSemanticId: "track-0",
					ownedDomains: ["style"],
				},
			],
			dirtyDomains: ["metadata"],
			acceptedDowngradeFingerprints: ["warning-1"],
			payloadRef: {
				keyVersion: 1,
				cipher: "os-keychain-wrapped",
				location: "envelopes/import-1.bin",
			},
		});

		expect(result).toMatchObject({
			ok: true,
			envelope: {
				importId: "import-1",
				dirtyDomains: ["metadata"],
			},
		});
	});

	it.each([
		null,
		{},
		{
			schemaVersion: 1,
			importId: "import-1",
			profileId: "profile-1",
			entries: null,
			bindings: [],
			unknownSubtrees: [],
			dirtyDomains: [],
			acceptedDowngradeFingerprints: [],
		},
		{
			schemaVersion: 1,
			importId: "import-1",
			profileId: "profile-1",
			entries: [],
			bindings: [],
			unknownSubtrees: [],
			dirtyDomains: ["not-a-domain"],
			acceptedDowngradeFingerprints: [],
		},
	])("rejects malformed envelope metadata %#", (value) => {
		expect(parseForeignDraftEnvelopeV1(value).ok).toBe(false);
	});
});

describe("provenance redaction", () => {
	const provenance: DraftImportProvenanceV1 = {
		schemaVersion: 1,
		importId: "import-1",
		source: {
			product: "capcut",
			profileId: "capcut-desktop-8.1-plaintext",
			platform: "macos",
			files: [],
		},
		detection: {
			profileId: "capcut-desktop-8.1-plaintext",
			outcome: "exact",
			signals: [{ kind: "schema-version", value: "360000", matched: true }],
		},
		bindings: [
			{
				foreignRef: "raw:0",
				file: "draft_info.json",
				jsonPointer: "/tracks/0",
				semanticId: "track-0",
			},
		],
		restrictedSourcePaths: ["/Users/someone/Movies/CapCut/private-draft"],
	};

	it("strips restricted paths and collapses bindings", () => {
		const redacted = redactProvenanceForEvidence({ provenance });
		const serialized = JSON.stringify(redacted);
		expect(serialized).not.toContain("restrictedSourcePaths");
		expect(serialized).not.toContain("/Users/someone");
		expect(redacted.bindingCount).toBe(1);
		expect(
			"restrictedSourcePaths" in (redacted as Record<string, unknown>)
		).toBe(false);
	});

	it("fails closed when restricted fields are about to leave", () => {
		expect(() =>
			assertNoRestrictedProvenanceFields({ value: provenance })
		).toThrow(/restrictedSourcePaths/);
		expect(() =>
			assertNoRestrictedProvenanceFields({
				value: { nested: [{ deep: provenance }] },
			})
		).toThrow(/restrictedSourcePaths/);
		expect(() =>
			assertNoRestrictedProvenanceFields({
				value: redactProvenanceForEvidence({ provenance }),
			})
		).not.toThrow();
	});
});

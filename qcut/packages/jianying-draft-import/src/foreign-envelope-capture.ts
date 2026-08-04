import { createHash } from "node:crypto";
import {
	evaluateEnvelopeFileCandidate,
	FOREIGN_ENVELOPE_PAYLOAD_MAX_BYTES,
	FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION,
	type ForeignDraftEnvelopeV1,
	type ForeignEnvelopeAllowlistEntry,
	type ForeignEnvelopePayloadEntryV1,
	type ForeignEnvelopePayloadV1,
	type RawNodeBinding,
} from "@qcut/editor-core/draft-interop";
import type { DraftSourceSnapshot } from "./snapshot-reader.js";

export interface BuiltForeignEnvelopeCapture {
	envelope: ForeignDraftEnvelopeV1;
	payloadBase64: string;
	payloadSha256: string;
}

export function buildForeignEnvelopeCapture({
	acceptedDowngradeFingerprints,
	allowlist,
	bindings,
	importId,
	profileId,
	snapshot,
}: {
	acceptedDowngradeFingerprints: readonly string[];
	allowlist: readonly ForeignEnvelopeAllowlistEntry[];
	bindings: readonly RawNodeBinding[];
	importId: string;
	profileId: string;
	snapshot: DraftSourceSnapshot;
}): BuiltForeignEnvelopeCapture | undefined {
	const entries: ForeignDraftEnvelopeV1["entries"] = [];
	const payloadEntries: ForeignEnvelopePayloadEntryV1[] = [];
	const admittedPaths = new Set<string>();
	for (const file of snapshot.files) {
		const decision = evaluateEnvelopeFileCandidate({
			relativePath: file.relativePath,
			allowlist,
		});
		if (decision.decision !== "allowed") continue;
		const bytes = snapshot.bytesByPath[file.relativePath];
		if (bytes === undefined) continue;
		admittedPaths.add(file.relativePath);
		entries.push({
			relativePath: file.relativePath,
			sha256: file.sha256,
			byteLength: file.byteLength,
			allowlistEntryId: decision.allowlistEntryId,
			storage: "raw",
		});
		payloadEntries.push({
			relativePath: file.relativePath,
			bytesBase64: bytes.toString("base64"),
		});
	}
	if (entries.length === 0) return undefined;

	const payload: ForeignEnvelopePayloadV1 = {
		schemaVersion: FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION,
		entries: payloadEntries,
	};
	const payloadBytes = Buffer.from(JSON.stringify(payload));
	if (payloadBytes.length > FOREIGN_ENVELOPE_PAYLOAD_MAX_BYTES) {
		throw new Error("Foreign envelope payload exceeds the 64 MiB limit.");
	}
	return {
		envelope: {
			schemaVersion: 1,
			importId,
			profileId,
			entries,
			bindings: bindings.filter((binding) => admittedPaths.has(binding.file)),
			unknownSubtrees: [],
			dirtyDomains: [],
			acceptedDowngradeFingerprints: [...acceptedDowngradeFingerprints],
		},
		payloadBase64: payloadBytes.toString("base64"),
		payloadSha256: createHash("sha256").update(payloadBytes).digest("hex"),
	};
}

import { createHash } from "node:crypto";
import {
	buildQCutImportTimelineTracks,
	type ForeignDraftEnvelopeV1,
	type QCutImportBundleV1,
} from "@qcut/editor-core/draft-interop";
import {
	JIANYING_11_3_BETA2_CONTENT_PATH,
	JIANYING_11_3_BETA2_PROFILE_ID,
	prepareJianying113Beta2SameProfileWriteback,
	type Jianying113Beta2SameProfilePrepareIssue,
} from "@qcut/editor-core/jianying-draft";

export interface JianyingRoundTripVerification {
	byteIdentical: true;
	contentByteLength: number;
	contentRelativePath: typeof JIANYING_11_3_BETA2_CONTENT_PATH;
	contentSha256: string;
	importedSegmentCount: number;
	preservedBindingCount: number;
	profileId: typeof JIANYING_11_3_BETA2_PROFILE_ID;
}

export type JianyingRoundTripVerificationIssue =
	| Jianying113Beta2SameProfilePrepareIssue
	| {
			code:
				| "ROUNDTRIP_PROFILE_MISMATCH"
				| "ROUNDTRIP_CONTENT_BYTES_MISSING"
				| "ROUNDTRIP_UNEXPECTED_CHANGE"
				| "ROUNDTRIP_BYTES_CHANGED";
			message: string;
	  };

export type VerifyJianyingRoundTripResult =
	| { ok: true; verification: JianyingRoundTripVerification }
	| { ok: false; issues: JianyingRoundTripVerificationIssue[] };

function buildMediaItemIds({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): ReadonlyMap<string, string> {
	return new Map(
		bundle.resourceStaging.map(({ resourceId }) => {
			const internalId = bundle.internalIdBySemanticId[resourceId];
			if (internalId === undefined) {
				throw new Error(`Import bundle has no internal id for ${resourceId}.`);
			}
			return [resourceId, internalId];
		})
	);
}

function buildTimelineDurations({
	bundle,
}: {
	bundle: QCutImportBundleV1;
}): Record<string, number> {
	const durations: Record<string, number> = {};
	for (const track of bundle.timelinePlan.tracks) {
		for (const element of track.elements) {
			const internalId = bundle.internalIdBySemanticId[element.id];
			if (internalId === undefined) {
				throw new Error(`Import bundle has no internal id for ${element.id}.`);
			}
			if (element.type === "text") {
				durations[internalId] = element.duration;
				continue;
			}
			const sourceDuration =
				element.duration - element.trimStart - element.trimEnd;
			durations[internalId] = sourceDuration / (element.speed ?? 1);
		}
	}
	return durations;
}

function bytesEqual({
	left,
	right,
}: {
	left: Uint8Array;
	right: Uint8Array;
}): boolean {
	return Buffer.from(left).equals(Buffer.from(right));
}

export function verifyJianying113RoundTrip({
	bundle,
	bytesByPath,
	envelope,
}: {
	bundle: QCutImportBundleV1;
	bytesByPath: ReadonlyMap<string, Uint8Array>;
	envelope: ForeignDraftEnvelopeV1;
}): VerifyJianyingRoundTripResult {
	if (
		bundle.document.source.product !== "jianying" ||
		bundle.document.source.profileId !== JIANYING_11_3_BETA2_PROFILE_ID ||
		envelope.profileId !== JIANYING_11_3_BETA2_PROFILE_ID
	) {
		return {
			ok: false,
			issues: [
				{
					code: "ROUNDTRIP_PROFILE_MISMATCH",
					message:
						"Round-trip verification requires the exact Jianying Professional 11.3 beta 2 profile.",
				},
			],
		};
	}
	const sourceBytes = bytesByPath.get(JIANYING_11_3_BETA2_CONTENT_PATH);
	if (sourceBytes === undefined) {
		return {
			ok: false,
			issues: [
				{
					code: "ROUNDTRIP_CONTENT_BYTES_MISSING",
					message: "Verified source bytes do not contain draft_content.json.",
				},
			],
		};
	}

	const tracks = buildQCutImportTimelineTracks({
		bundle,
		mediaItemIdByResourceId: buildMediaItemIds({ bundle }),
	});
	const prepared = prepareJianying113Beta2SameProfileWriteback({
		baselineDocument: bundle.document,
		bytesByPath,
		envelope,
		internalIdBySemanticId: bundle.internalIdBySemanticId,
		snapshot: {
			tracks,
			timelineDurationByElementId: buildTimelineDurations({ bundle }),
		},
	});
	if (!prepared.ok) return { ok: false, issues: prepared.issues };
	if (prepared.changed) {
		return {
			ok: false,
			issues: [
				{
					code: "ROUNDTRIP_UNEXPECTED_CHANGE",
					message:
						"An unchanged QCut import unexpectedly produced Jianying timing patches.",
				},
			],
		};
	}
	if (!bytesEqual({ left: sourceBytes, right: prepared.contentBytes })) {
		return {
			ok: false,
			issues: [
				{
					code: "ROUNDTRIP_BYTES_CHANGED",
					message:
						"The no-op Jianying round trip did not preserve draft_content.json byte-for-byte.",
				},
			],
		};
	}

	return {
		ok: true,
		verification: {
			byteIdentical: true,
			contentByteLength: sourceBytes.byteLength,
			contentRelativePath: JIANYING_11_3_BETA2_CONTENT_PATH,
			contentSha256: createHash("sha256").update(sourceBytes).digest("hex"),
			importedSegmentCount: prepared.importedSegmentCount,
			preservedBindingCount: envelope.bindings.length,
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		},
	};
}

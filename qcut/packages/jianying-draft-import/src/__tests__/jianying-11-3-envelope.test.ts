import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	getDraftProfile,
	JIANYING_11_3_BETA2_PROFILE_ID,
} from "@qcut/editor-core/jianying-draft";
import { buildForeignEnvelopeCapture } from "../foreign-envelope-capture.js";
import type { DraftSourceSnapshot } from "../snapshot-reader.js";

describe("Jianying 11.3 foreign envelope", () => {
	it("preserves unknown content fields byte-for-byte", () => {
		const sourceBytes = Buffer.from(
			JSON.stringify({
				version: 360_000,
				new_version: "183.0.0",
				future_unknown: {
					sentinel: "qcut-must-not-drop-this",
					values: [1, 2, 3],
				},
			})
		);
		const sha256 = createHash("sha256").update(sourceBytes).digest("hex");
		const snapshot: DraftSourceSnapshot = {
			rootRealPath: "/redacted/jianying-subdraft",
			files: [
				{
					relativePath: "draft_content.json",
					byteLength: sourceBytes.length,
					sha256,
					role: "content",
					classification: "plaintext-json",
					identity: {
						device: "1",
						inode: "2",
						size: String(sourceBytes.length),
						mtimeNanoseconds: "3",
					},
				},
			],
			parsedJsonByPath: {
				"draft_content.json": JSON.parse(sourceBytes.toString()),
			},
			bytesByPath: { "draft_content.json": sourceBytes },
			issues: [],
		};
		const profile = getDraftProfile({
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		});
		expect(profile).not.toBeNull();

		const capture = buildForeignEnvelopeCapture({
			acceptedDowngradeFingerprints: [],
			allowlist: profile?.envelopeAllowlist ?? [],
			bindings: [],
			importId: "import-jianying-11-3",
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
			snapshot,
		});
		const payload = JSON.parse(
			Buffer.from(capture?.payloadBase64 ?? "", "base64").toString()
		) as {
			entries: Array<{ bytesBase64: string; relativePath: string }>;
		};
		const restoredBytes = Buffer.from(payload.entries[0].bytesBase64, "base64");

		expect(capture?.envelope.entries).toEqual([
			expect.objectContaining({
				relativePath: "draft_content.json",
				sha256,
			}),
		]);
		expect(restoredBytes.equals(sourceBytes)).toBe(true);
		expect(JSON.parse(restoredBytes.toString())).toMatchObject({
			future_unknown: { sentinel: "qcut-must-not-drop-this" },
		});
	});
});

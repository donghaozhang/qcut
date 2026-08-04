import { describe, expect, it } from "vitest";
import { buildForeignEnvelopeCapture } from "../foreign-envelope-capture.js";
import type { DraftSourceSnapshot } from "../snapshot-reader.js";

function createSnapshot(): DraftSourceSnapshot {
	return {
		rootRealPath: "/restricted/source",
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 7,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
				identity: {
					device: "1",
					inode: "2",
					size: "7",
					mtimeNanoseconds: "3",
				},
			},
			{
				relativePath: "private-sidecar.json",
				byteLength: 6,
				sha256: "b".repeat(64),
				role: "unknown",
				classification: "plaintext-json",
				identity: {
					device: "1",
					inode: "3",
					size: "6",
					mtimeNanoseconds: "3",
				},
			},
		],
		parsedJsonByPath: {
			"draft_info.json": { ok: 1 },
			"private-sidecar.json": { no: 1 },
		},
		bytesByPath: {
			"draft_info.json": Buffer.from('{"a":1}'),
			"private-sidecar.json": Buffer.from("SECRET"),
		},
		issues: [],
	};
}

describe("foreign envelope capture", () => {
	it("packages only evidence-allowlisted bytes and source bindings", () => {
		const capture = buildForeignEnvelopeCapture({
			acceptedDowngradeFingerprints: ["warning-1"],
			allowlist: [
				{
					id: "content",
					relativePath: "draft_info.json",
					evidence: "same-profile-round-trip",
				},
			],
			bindings: [
				{
					foreignRef: "raw:0",
					file: "draft_info.json",
					jsonPointer: "/tracks/0",
				},
				{
					foreignRef: "raw:1",
					file: "private-sidecar.json",
					jsonPointer: "/private",
				},
			],
			importId: "import-1",
			profileId: "profile-1",
			snapshot: createSnapshot(),
		});

		expect(capture?.envelope.entries).toHaveLength(1);
		expect(capture?.envelope.bindings).toEqual([
			expect.objectContaining({ foreignRef: "raw:0" }),
		]);
		expect(capture?.envelope.acceptedDowngradeFingerprints).toEqual([
			"warning-1",
		]);
		const payload = Buffer.from(capture?.payloadBase64 ?? "", "base64");
		expect(payload.includes("private-sidecar.json")).toBe(false);
		expect(payload.includes("SECRET")).toBe(false);
		expect(JSON.parse(payload.toString())).toEqual({
			schemaVersion: 1,
			entries: [
				{
					relativePath: "draft_info.json",
					bytesBase64: Buffer.from('{"a":1}').toString("base64"),
				},
			],
		});
	});

	it("returns no capture when the profile admits no source files", () => {
		expect(
			buildForeignEnvelopeCapture({
				acceptedDowngradeFingerprints: [],
				allowlist: [],
				bindings: [],
				importId: "import-1",
				profileId: "profile-1",
				snapshot: createSnapshot(),
			})
		).toBeUndefined();
	});
});

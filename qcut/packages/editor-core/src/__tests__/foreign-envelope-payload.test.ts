import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	verifyForeignEnvelopePayload,
	type ForeignDraftEnvelopeV1,
} from "../draft-interop/index.js";

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function createFixture() {
	const draftBytes = new TextEncoder().encode(
		JSON.stringify({ id: "draft", unknownSentinel: { keep: true } })
	);
	const envelope: ForeignDraftEnvelopeV1 = {
		schemaVersion: 1,
		importId: "import-1",
		profileId: "capcut-desktop-8.1-plaintext",
		entries: [
			{
				relativePath: "draft_info.json",
				sha256: sha256({ bytes: draftBytes }),
				byteLength: draftBytes.byteLength,
				allowlistEntryId: "capcut-8.1-root-draft-info",
				storage: "raw",
			},
		],
		bindings: [],
		unknownSubtrees: [],
		dirtyDomains: [],
		acceptedDowngradeFingerprints: [],
	};
	const payloadBytes = new TextEncoder().encode(
		JSON.stringify({
			schemaVersion: 1,
			entries: [
				{
					relativePath: "draft_info.json",
					bytesBase64: Buffer.from(draftBytes).toString("base64"),
				},
			],
		})
	);
	return { draftBytes, envelope, payloadBytes };
}

describe("foreign envelope payload verification", () => {
	it("verifies every raw entry before exposing bytes", async () => {
		const fixture = createFixture();
		const result = await verifyForeignEnvelopePayload({
			envelope: fixture.envelope,
			payloadBytes: fixture.payloadBytes,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect([...result.bytesByPath.get("draft_info.json")!]).toEqual([
			...fixture.draftBytes,
		]);
	});

	it("rejects payload entries that do not match metadata order", async () => {
		const fixture = createFixture();
		const payloadBytes = new TextEncoder().encode(
			JSON.stringify({
				schemaVersion: 1,
				entries: [
					{
						relativePath: "other.json",
						bytesBase64: "e30=",
					},
				],
			})
		);

		await expect(
			verifyForeignEnvelopePayload({
				envelope: fixture.envelope,
				payloadBytes,
			})
		).resolves.toMatchObject({
			ok: false,
			code: "PAYLOAD_ENTRY_SET_MISMATCH",
		});
	});

	it("rejects duplicate entries before decoding", async () => {
		const fixture = createFixture();
		const payloadBytes = new TextEncoder().encode(
			JSON.stringify({
				schemaVersion: 1,
				entries: [
					{
						relativePath: "draft_info.json",
						bytesBase64: "e30=",
					},
					{
						relativePath: "draft_info.json",
						bytesBase64: "e30=",
					},
				],
			})
		);

		await expect(
			verifyForeignEnvelopePayload({
				envelope: fixture.envelope,
				payloadBytes,
			})
		).resolves.toMatchObject({
			ok: false,
			code: "PAYLOAD_ENTRY_DUPLICATE",
		});
	});

	it("rejects non-canonical base64 and digest mismatches", async () => {
		const fixture = createFixture();
		const malformedPayload = new TextEncoder().encode(
			JSON.stringify({
				schemaVersion: 1,
				entries: [
					{
						relativePath: "draft_info.json",
						bytesBase64: "not base64",
					},
				],
			})
		);
		await expect(
			verifyForeignEnvelopePayload({
				envelope: fixture.envelope,
				payloadBytes: malformedPayload,
			})
		).resolves.toMatchObject({
			ok: false,
			code: "PAYLOAD_ENTRY_INVALID_BASE64",
		});

		const tampered = createFixture();
		tampered.envelope.entries[0] = {
			...tampered.envelope.entries[0],
			sha256: "0".repeat(64),
		};
		await expect(
			verifyForeignEnvelopePayload({
				envelope: tampered.envelope,
				payloadBytes: tampered.payloadBytes,
			})
		).resolves.toMatchObject({
			ok: false,
			code: "PAYLOAD_ENTRY_HASH_MISMATCH",
		});
	});

	it("rejects unknown fields and oversized payloads", async () => {
		const fixture = createFixture();
		const unknownFieldPayload = new TextEncoder().encode(
			JSON.stringify({ schemaVersion: 1, entries: [], unexpected: true })
		);
		await expect(
			verifyForeignEnvelopePayload({
				envelope: fixture.envelope,
				payloadBytes: unknownFieldPayload,
			})
		).resolves.toMatchObject({
			ok: false,
			code: "PAYLOAD_MALFORMED",
		});

		await expect(
			verifyForeignEnvelopePayload({
				envelope: fixture.envelope,
				maximumPayloadBytes: fixture.payloadBytes.byteLength - 1,
				payloadBytes: fixture.payloadBytes,
			})
		).resolves.toMatchObject({
			ok: false,
			code: "PAYLOAD_TOO_LARGE",
		});
	});
});

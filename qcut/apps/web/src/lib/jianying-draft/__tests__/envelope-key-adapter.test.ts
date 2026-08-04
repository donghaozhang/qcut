import { createHash } from "node:crypto";
import type { ForeignDraftEnvelopeV1 } from "@qcut/editor-core/draft-interop";
import type { JianyingEnvelopeAPI } from "@/types/electron/api-jianying-envelope";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readVerifiedEnvelopePayload } from "../envelope-key-adapter";

function fixture() {
	const draftBytes = new TextEncoder().encode(
		JSON.stringify({ id: "draft", unknownSentinel: true })
	);
	const payload = new TextEncoder().encode(
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
	const envelope: ForeignDraftEnvelopeV1 = {
		schemaVersion: 1,
		importId: "import-1",
		profileId: "capcut-desktop-8.1-plaintext",
		entries: [
			{
				relativePath: "draft_info.json",
				sha256: createHash("sha256").update(draftBytes).digest("hex"),
				byteLength: draftBytes.byteLength,
				allowlistEntryId: "capcut-8.1-root-draft-info",
				storage: "raw",
			},
		],
		bindings: [],
		unknownSubtrees: [],
		dirtyDomains: [],
		acceptedDowngradeFingerprints: [],
		payloadRef: {
			keyVersion: 3,
			cipher: "os-keychain-wrapped",
			location: "envelopes/import-1.bin",
		},
	};
	return { draftBytes, envelope, payload };
}

function installReadBridge({
	keyVersion = 3,
	payload,
}: {
	keyVersion?: number;
	payload: Uint8Array;
}): void {
	const read = vi.fn(async () => ({
		ok: true as const,
		value: {
			importId: "import-1",
			payloadBase64: Buffer.from(payload).toString("base64"),
			keyVersion,
		},
	}));
	(window as unknown as { electronAPI: unknown }).electronAPI = {
		jianyingEnvelope: { read } as unknown as JianyingEnvelopeAPI,
	};
}

afterEach(() => {
	(window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
});

describe("verified envelope adapter", () => {
	it("returns plaintext bytes only after metadata verification", async () => {
		const { draftBytes, envelope, payload } = fixture();
		installReadBridge({ payload });

		const result = await readVerifiedEnvelopePayload({ envelope });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect([...result.value.bytesByPath.get("draft_info.json")!]).toEqual([
			...draftBytes,
		]);
		expect(result.value.keyVersion).toBe(3);
	});

	it("rejects a stale key version before exposing bytes", async () => {
		const { envelope, payload } = fixture();
		installReadBridge({ keyVersion: 4, payload });

		await expect(
			readVerifiedEnvelopePayload({ envelope })
		).resolves.toMatchObject({
			ok: false,
			code: "envelope-key-version-mismatch",
		});
	});

	it("rejects tampered plaintext returned by the bridge", async () => {
		const { envelope } = fixture();
		const tamperedPayload = new TextEncoder().encode(
			JSON.stringify({
				schemaVersion: 1,
				entries: [
					{
						relativePath: "draft_info.json",
						bytesBase64: Buffer.from("tampered").toString("base64"),
					},
				],
			})
		);
		installReadBridge({ payload: tamperedPayload });

		await expect(
			readVerifiedEnvelopePayload({ envelope })
		).resolves.toMatchObject({
			ok: false,
			code: "payload-entry-size-mismatch",
		});
	});

	it("requires a persisted payload reference", async () => {
		const { envelope } = fixture();
		const withoutPayloadRef = { ...envelope, payloadRef: undefined };

		await expect(
			readVerifiedEnvelopePayload({ envelope: withoutPayloadRef })
		).resolves.toMatchObject({
			ok: false,
			code: "envelope-payload-ref-missing",
		});
	});
});

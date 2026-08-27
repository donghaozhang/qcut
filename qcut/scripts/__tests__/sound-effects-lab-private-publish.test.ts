import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPrivateManifest } from "../build-local-sound-effects-lab-manifest";
import {
	buildUploadEntries,
	resolveManifestObjectKey,
} from "../upload-private-sound-effects-lab";

const FILE_NAME = "5bb4c18515e6059da16432af0db0f1dc.mp3";
const OBJECT_KEY = `jianying/2026-08-01/assets/${FILE_NAME}`;

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function buildLocalManifest({
	byteSize,
	contentSha256,
	filePath,
}: {
	byteSize: number;
	contentSha256: string;
	filePath: string;
}) {
	return {
		schemaVersion: 1 as const,
		catalogId: "jianying-sfx-reference-2026-08-01",
		generatedAt: "2026-08-01T00:00:00.000Z",
		provenance: {
			sourceApp: "Jianying Pro" as const,
			purpose: "internal-reference" as const,
			redistribution: "prohibited" as const,
		},
		categories: [{ id: "jianying-0123456789ab", label: "热门" }],
		items: [
			{
				id: "6896679799100689672",
				numericId: -900_000_000,
				title: "仙尘音效",
				fileName: FILE_NAME,
				filePath,
				mimeType: "audio/mpeg" as const,
				byteSize,
				duration: 2.74,
				contentMd5: FILE_NAME.slice(0, -4),
				contentSha256,
				resourceId: "6896679799100689672",
				batch: "01" as const,
				mappingStrategy: "metadata-md5" as const,
				source: {
					provider: "jianying-reference" as const,
					redistribution: "prohibited" as const,
				},
				categoryIds: ["jianying-0123456789ab"],
			},
		],
	};
}

describe("private Sound Effects Lab publishing", () => {
	let testDirectory = "";

	beforeEach(async () => {
		testDirectory = await mkdtemp(join(tmpdir(), "qcut-sfx-publish-"));
	});

	afterEach(async () => {
		await rm(testDirectory, { force: true, recursive: true });
	});

	it("builds a path-free private manifest with matching storage integrity", async () => {
		const bytes = new TextEncoder().encode("audio-payload");
		const filePath = join(testDirectory, FILE_NAME);
		await writeFile(filePath, bytes);
		const contentSha256 = sha256({ bytes });
		const localManifest = buildLocalManifest({
			byteSize: bytes.byteLength,
			contentSha256,
			filePath,
		});

		const privateManifest = buildPrivateManifest({
			catalogDate: "2026-08-01",
			localManifest,
		});

		expect(JSON.stringify(privateManifest)).not.toContain("filePath");
		expect(privateManifest.items[0].asset).toEqual({
			kind: "supabase-storage",
			objectKey: OBJECT_KEY,
			byteSize: bytes.byteLength,
			checksumSha256: contentSha256,
		});
		expect(buildUploadEntries({ localManifest, privateManifest })).toEqual([
			{
				byteSize: bytes.byteLength,
				contentType: "audio/mpeg",
				filePath,
				objectKey: OBJECT_KEY,
			},
		]);
	});

	it("rejects a same-size local file whose SHA-256 changed", async () => {
		const expectedBytes = new TextEncoder().encode("expected");
		const tamperedBytes = new TextEncoder().encode("tampered");
		const filePath = join(testDirectory, FILE_NAME);
		await writeFile(filePath, tamperedBytes);
		const localManifest = buildLocalManifest({
			byteSize: expectedBytes.byteLength,
			contentSha256: sha256({ bytes: expectedBytes }),
			filePath,
		});
		const privateManifest = buildPrivateManifest({
			catalogDate: "2026-08-01",
			localManifest,
		});

		expect(() =>
			buildUploadEntries({ localManifest, privateManifest })
		).toThrow(`Local file SHA-256 mismatch for ${FILE_NAME}`);
	});

	it("preserves an existing immutable object key across catalog releases", async () => {
		const bytes = new TextEncoder().encode("audio-payload");
		const filePath = join(testDirectory, FILE_NAME);
		await writeFile(filePath, bytes);
		const contentSha256 = sha256({ bytes });
		const localManifest = buildLocalManifest({
			byteSize: bytes.byteLength,
			contentSha256,
			filePath,
		});
		const previousPrivateManifest = buildPrivateManifest({
			catalogDate: "2026-08-01",
			localManifest,
		});

		const nextPrivateManifest = buildPrivateManifest({
			catalogDate: "2026-08-22",
			localManifest,
			previousPrivateManifest,
		});

		expect(nextPrivateManifest.items[0].asset.objectKey).toBe(OBJECT_KEY);
	});

	it("rejects reuse when an existing asset's integrity changed", async () => {
		const bytes = new TextEncoder().encode("audio-payload");
		const filePath = join(testDirectory, FILE_NAME);
		await writeFile(filePath, bytes);
		const contentSha256 = sha256({ bytes });
		const localManifest = buildLocalManifest({
			byteSize: bytes.byteLength,
			contentSha256,
			filePath,
		});
		const previousPrivateManifest = buildPrivateManifest({
			catalogDate: "2026-08-01",
			localManifest,
		});
		previousPrivateManifest.items[0].asset.checksumSha256 = "0".repeat(64);

		expect(() =>
			buildPrivateManifest({
				catalogDate: "2026-08-22",
				localManifest,
				previousPrivateManifest,
			})
		).toThrow(
			"Existing private asset integrity changed for 6896679799100689672"
		);
	});

	it("reuses the previous object for a new resource ID with identical content", async () => {
		const bytes = new TextEncoder().encode("audio-payload");
		const filePath = join(testDirectory, FILE_NAME);
		await writeFile(filePath, bytes);
		const localManifest = buildLocalManifest({
			byteSize: bytes.byteLength,
			contentSha256: sha256({ bytes }),
			filePath,
		});
		const previousPrivateManifest = buildPrivateManifest({
			catalogDate: "2026-08-01",
			localManifest,
		});
		localManifest.items.push({
			...localManifest.items[0],
			id: "6896679799100689673",
			resourceId: "6896679799100689673",
			numericId: -900_000_001,
			title: "Same audio, different card",
		});
		const privateManifest = buildPrivateManifest({
			catalogDate: "2026-08-27",
			localManifest,
			previousPrivateManifest,
		});

		expect(privateManifest.items).toHaveLength(2);
		expect(privateManifest.items[1].asset.objectKey).toBe(OBJECT_KEY);
		expect(buildUploadEntries({ localManifest, privateManifest })).toHaveLength(
			1
		);
	});

	it("uses a QCut staging namespace for mixed-library manifests", () => {
		expect(
			resolveManifestObjectKey({
				catalogId: "qcut-sfx-library-2026-08-26",
			})
		).toBe("qcut/2026-08-26/manifest.json");
		expect(
			resolveManifestObjectKey({
				catalogId: "qcut-sfx-library-2026-08-26",
				manifestObjectKey: "qcut/2026-08-26/manifest.metadata-candidate.json",
			})
		).toBe("qcut/2026-08-26/manifest.metadata-candidate.json");
	});

	it("rejects conflicting payloads mapped to the same upload object", async () => {
		const firstBytes = new TextEncoder().encode("first-audio");
		const secondBytes = new TextEncoder().encode("other-audio");
		const firstPath = join(testDirectory, FILE_NAME);
		const secondName = "1291b72047769e085e7595ce5d65dbd3.mp3";
		const secondPath = join(testDirectory, secondName);
		await Promise.all([
			writeFile(firstPath, firstBytes),
			writeFile(secondPath, secondBytes),
		]);
		const localManifest = buildLocalManifest({
			byteSize: firstBytes.byteLength,
			contentSha256: sha256({ bytes: firstBytes }),
			filePath: firstPath,
		});
		localManifest.items.push({
			...localManifest.items[0],
			id: "6896679799100689673",
			resourceId: "6896679799100689673",
			numericId: -900_000_001,
			contentMd5: secondName.slice(0, -4),
			contentSha256: sha256({ bytes: secondBytes }),
			fileName: secondName,
			filePath: secondPath,
			byteSize: secondBytes.byteLength,
		});
		const privateManifest = buildPrivateManifest({
			catalogDate: "2026-08-01",
			localManifest,
		});
		privateManifest.items[1].asset.objectKey = OBJECT_KEY;

		expect(() =>
			buildUploadEntries({ localManifest, privateManifest })
		).toThrow("Conflicting shared storage object");
	});

	it("rejects a manifest key outside the private library namespace", () => {
		expect(() =>
			resolveManifestObjectKey({
				catalogId: "qcut-sfx-library-2026-08-26",
				manifestObjectKey: "../production.json",
			})
		).toThrow("Invalid manifest object key");
	});
});

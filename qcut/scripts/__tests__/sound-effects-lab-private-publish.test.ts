import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPrivateManifest } from "../build-local-sound-effects-lab-manifest";
import { buildUploadEntries } from "../upload-private-sound-effects-lab";

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
});

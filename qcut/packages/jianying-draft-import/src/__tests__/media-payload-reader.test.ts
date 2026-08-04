import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	MAX_MEDIA_PAYLOAD_CHUNK_BYTES,
	MediaPayloadReadError,
	readVerifiedMediaPayload,
	readVerifiedMediaPayloadChunk,
	verifyMediaPayloadSource,
} from "../media-payload-reader.js";

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "qcut-media-payload-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function sha256({ value }: { value: string }): string {
	return createHash("sha256").update(value).digest("hex");
}

describe("readVerifiedMediaPayload", () => {
	it("returns bytes that match the resolver evidence", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "media-bytes");

		const bytes = await readVerifiedMediaPayload({
			absolutePath,
			expectedByteLength: 11,
			expectedSha256: sha256({ value: "media-bytes" }),
			remainingBudget: 1024,
		});

		expect(bytes.toString()).toBe("media-bytes");
	});

	it("rejects same-length bytes with a different digest", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "other-bytes");

		await expect(
			readVerifiedMediaPayload({
				absolutePath,
				expectedByteLength: 11,
				expectedSha256: sha256({ value: "media-bytes" }),
				remainingBudget: 1024,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({ code: "source-changed" });
	});

	it("rejects changed byte length", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "longer-media-bytes");

		await expect(
			readVerifiedMediaPayload({
				absolutePath,
				expectedByteLength: 11,
				expectedSha256: sha256({ value: "media-bytes" }),
				remainingBudget: 1024,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({ code: "source-changed" });
	});

	it("enforces the remaining transport budget before allocating", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "media-bytes");

		await expect(
			readVerifiedMediaPayload({
				absolutePath,
				expectedByteLength: 11,
				expectedSha256: sha256({ value: "media-bytes" }),
				remainingBudget: 10,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({
			code: "payload-too-large",
		});
	});

	it("refuses a symlink even when its target matches", async () => {
		const targetPath = join(root, "target.mp4");
		const symlinkPath = join(root, "clip.mp4");
		await writeFile(targetPath, "media-bytes");
		await symlink(targetPath, symlinkPath);

		await expect(
			readVerifiedMediaPayload({
				absolutePath: symlinkPath,
				expectedByteLength: 11,
				expectedSha256: sha256({ value: "media-bytes" }),
				remainingBudget: 1024,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({ code: "source-changed" });
	});

	it("verifies once and reads bounded chunks against the captured identity", async () => {
		const absolutePath = join(root, "clip.mp4");
		const value = "0123456789";
		await writeFile(absolutePath, value);
		const expectedSha256 = sha256({ value });
		const expectedIdentity = await verifyMediaPayloadSource({
			absolutePath,
			expectedByteLength: value.length,
			expectedSha256,
		});

		const middle = await readVerifiedMediaPayloadChunk({
			absolutePath,
			expectedByteLength: value.length,
			expectedIdentity,
			maxBytes: 4,
			offset: 3,
		});
		const tail = await readVerifiedMediaPayloadChunk({
			absolutePath,
			expectedByteLength: value.length,
			expectedIdentity,
			maxBytes: 4,
			offset: 9,
		});
		const eof = await readVerifiedMediaPayloadChunk({
			absolutePath,
			expectedByteLength: value.length,
			expectedIdentity,
			maxBytes: 4,
			offset: value.length,
		});

		expect(middle.toString()).toBe("3456");
		expect(tail.toString()).toBe("9");
		expect(eof).toHaveLength(0);
	});

	it("rejects chunks after the verified source identity changes", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "media-bytes");
		const expectedIdentity = await verifyMediaPayloadSource({
			absolutePath,
			expectedByteLength: 11,
			expectedSha256: sha256({ value: "media-bytes" }),
		});
		await writeFile(absolutePath, "other-bytes");

		await expect(
			readVerifiedMediaPayloadChunk({
				absolutePath,
				expectedByteLength: 11,
				expectedIdentity,
				maxBytes: 4,
				offset: 0,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({ code: "source-changed" });
	});

	it("rejects oversized or out-of-range chunk requests", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "media-bytes");
		const expectedIdentity = await verifyMediaPayloadSource({
			absolutePath,
			expectedByteLength: 11,
			expectedSha256: sha256({ value: "media-bytes" }),
		});

		await expect(
			readVerifiedMediaPayloadChunk({
				absolutePath,
				expectedByteLength: 11,
				expectedIdentity,
				maxBytes: MAX_MEDIA_PAYLOAD_CHUNK_BYTES + 1,
				offset: 0,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({ code: "source-changed" });
		await expect(
			readVerifiedMediaPayloadChunk({
				absolutePath,
				expectedByteLength: 11,
				expectedIdentity,
				maxBytes: 1,
				offset: 12,
			})
		).rejects.toMatchObject<MediaPayloadReadError>({ code: "source-changed" });
	});
});

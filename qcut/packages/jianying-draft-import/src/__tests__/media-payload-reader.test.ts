import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	MediaPayloadReadError,
	readVerifiedMediaPayload,
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
});

import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	MAX_IMPORT_MEDIA_BYTES,
	MediaPayloadGrantError,
	MediaPayloadGrantStore,
	type RestrictedMediaPayloadSource,
} from "../media-payload-grant-store.js";
import {
	MAX_MEDIA_PAYLOAD_CHUNK_BYTES,
	verifyMediaPayloadSource,
} from "../media-payload-reader.js";

const TOKEN_A = "a".repeat(43);
const TOKEN_B = "b".repeat(43);

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "qcut-media-grants-"));
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function sha256({ value }: { value: string }): string {
	return createHash("sha256").update(value).digest("hex");
}

function createSource({
	absolutePath,
	value = "0123456789",
}: {
	absolutePath: string;
	value?: string;
}): RestrictedMediaPayloadSource {
	return {
		resourceId: "resource-1",
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		byteLength: Buffer.byteLength(value),
		sha256: sha256({ value }),
		restrictedAbsolutePath: absolutePath,
	};
}

describe("MediaPayloadGrantStore", () => {
	it("returns path-free grants and bounded chunks, then releases them", async () => {
		const absolutePath = join(root, "clip.mp4");
		const value = "0123456789";
		await writeFile(absolutePath, value);
		const source = createSource({ absolutePath, value });
		const identity = await verifyMediaPayloadSource({
			absolutePath,
			expectedByteLength: source.byteLength,
			expectedSha256: source.sha256,
		});
		const store = new MediaPayloadGrantStore({
			createToken: () => TOKEN_A,
			now: () => 1000,
		});

		const grant = await store.grantVerifiedSource({
			source: { ...source, identity },
		});
		expect(grant).toEqual({
			schemaVersion: 1,
			grantToken: TOKEN_A,
			resourceId: "resource-1",
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			byteLength: 10,
			sha256: source.sha256,
			expiresAtUnixMilliseconds: 7_201_000,
		});
		expect(JSON.stringify(grant)).not.toContain(root);

		const middle = await store.readChunk({
			input: { grantToken: TOKEN_A, offset: 3, maxBytes: 4 },
		});
		const tail = await store.readChunk({
			input: { grantToken: TOKEN_A, offset: 9, maxBytes: 4 },
		});
		expect(new TextDecoder().decode(middle.bytes)).toBe("3456");
		expect(middle.eof).toBe(false);
		expect(new TextDecoder().decode(tail.bytes)).toBe("9");
		expect(tail.eof).toBe(true);

		expect(store.release({ input: { grantTokens: [TOKEN_A] } })).toEqual({
			releasedCount: 1,
		});
		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 0, maxBytes: 1 },
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({
			code: "grant-not-found",
		});
	});

	it("fully verifies untrusted sources before granting them", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "other-data");
		const store = new MediaPayloadGrantStore({ createToken: () => TOKEN_A });

		await expect(
			store.grantSource({
				source: createSource({ absolutePath, value: "0123456789" }),
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({ code: "source-changed" });
	});

	it("expires grants without exposing their source", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "0123456789");
		let now = 1000;
		const store = new MediaPayloadGrantStore({
			createToken: () => TOKEN_A,
			now: () => now,
			ttlMilliseconds: 10,
		});
		await store.grantSource({ source: createSource({ absolutePath }) });
		now = 1010;

		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 0, maxBytes: 1 },
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({ code: "grant-expired" });
	});

	it("keeps an actively-read grant alive until its inactivity timeout", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "0123456789");
		let now = 1000;
		const store = new MediaPayloadGrantStore({
			createToken: () => TOKEN_A,
			now: () => now,
			ttlMilliseconds: 10,
		});
		await store.grantSource({ source: createSource({ absolutePath }) });

		now = 1009;
		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 0, maxBytes: 1 },
			})
		).resolves.toMatchObject({ eof: false });
		now = 1018;
		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 1, maxBytes: 1 },
			})
		).resolves.toMatchObject({ eof: false });
		now = 1028;
		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 2, maxBytes: 1 },
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({ code: "grant-expired" });
	});

	it("invalidates a grant when the file identity changes", async () => {
		const absolutePath = join(root, "clip.mp4");
		await writeFile(absolutePath, "0123456789");
		const store = new MediaPayloadGrantStore({ createToken: () => TOKEN_A });
		await store.grantSource({ source: createSource({ absolutePath }) });
		await writeFile(absolutePath, "abcdefghij");

		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 0, maxBytes: 4 },
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({ code: "source-changed" });
		await expect(
			store.readChunk({
				input: { grantToken: TOKEN_A, offset: 0, maxBytes: 4 },
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({
			code: "grant-not-found",
		});
	});

	it("bounds store capacity and admits a new source after expiry", async () => {
		const firstPath = join(root, "first.mp4");
		const secondPath = join(root, "second.mp4");
		await Promise.all([
			writeFile(firstPath, "0123456789"),
			writeFile(secondPath, "0123456789"),
		]);
		let now = 1000;
		let nextToken = TOKEN_A;
		const store = new MediaPayloadGrantStore({
			createToken: () => nextToken,
			maxGrants: 1,
			now: () => now,
			ttlMilliseconds: 10,
		});
		await store.grantSource({
			source: createSource({ absolutePath: firstPath }),
		});
		nextToken = TOKEN_B;
		await expect(
			store.grantSource({
				source: {
					...createSource({ absolutePath: secondPath }),
					resourceId: "resource-2",
				},
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({
			code: "grant-store-full",
		});
		now = 1010;
		await expect(
			store.grantSource({
				source: {
					...createSource({ absolutePath: secondPath }),
					resourceId: "resource-2",
				},
			})
		).resolves.toMatchObject({ grantToken: TOKEN_B });
	});

	it("reserves unique tokens and capacity across concurrent grants", async () => {
		const firstPath = join(root, "first.mp4");
		const secondPath = join(root, "second.mp4");
		await Promise.all([
			writeFile(firstPath, "0123456789"),
			writeFile(secondPath, "0123456789"),
		]);
		const tokens = [TOKEN_A, TOKEN_A, TOKEN_B];
		const store = new MediaPayloadGrantStore({
			createToken: () => tokens.shift() ?? TOKEN_B,
			maxGrants: 2,
		});
		const grants = await Promise.all([
			store.grantSource({ source: createSource({ absolutePath: firstPath }) }),
			store.grantSource({
				source: {
					...createSource({ absolutePath: secondPath }),
					resourceId: "resource-2",
				},
			}),
		]);
		expect(grants.map(({ grantToken }) => grantToken)).toEqual([
			TOKEN_A,
			TOKEN_B,
		]);

		const fullStore = new MediaPayloadGrantStore({
			createToken: () => TOKEN_A,
			maxGrants: 1,
		});
		const attempts = await Promise.allSettled([
			fullStore.grantSource({
				source: createSource({ absolutePath: firstPath }),
			}),
			fullStore.grantSource({
				source: {
					...createSource({ absolutePath: secondPath }),
					resourceId: "resource-2",
				},
			}),
		]);
		expect(
			attempts.filter(({ status }) => status === "fulfilled")
		).toHaveLength(1);
		expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
			1
		);
	});

	it("rejects malformed chunk and release requests before file access", async () => {
		const store = new MediaPayloadGrantStore();
		await expect(
			store.readChunk({
				input: {
					grantToken: TOKEN_A,
					offset: 0,
					maxBytes: MAX_MEDIA_PAYLOAD_CHUNK_BYTES + 1,
				},
			})
		).rejects.toMatchObject<MediaPayloadGrantError>({
			code: "invalid-request",
		});
		expect(() =>
			store.release({ input: { grantTokens: [TOKEN_A, TOKEN_A] } })
		).toThrow(MediaPayloadGrantError);
		expect(MAX_IMPORT_MEDIA_BYTES).toBeGreaterThan(100_000_000_000);
	});

	it("refuses symlink sources", async () => {
		const targetPath = join(root, "target.mp4");
		const symlinkPath = join(root, "clip.mp4");
		await writeFile(targetPath, "0123456789");
		await symlink(targetPath, symlinkPath);
		const store = new MediaPayloadGrantStore({ createToken: () => TOKEN_A });

		await expect(
			store.grantSource({ source: createSource({ absolutePath: symlinkPath }) })
		).rejects.toMatchObject<MediaPayloadGrantError>({ code: "source-changed" });
	});
});

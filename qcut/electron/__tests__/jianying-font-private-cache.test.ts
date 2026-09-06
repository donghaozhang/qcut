// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	readPrivateJianyingFont,
	retainPrivateJianyingFont,
} from "../jianying-font-private-cache.js";

const roots: string[] = [];
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "qcut-private-font-"));
	roots.push(root);
	const bytes = Buffer.from("verified-source-font");
	return {
		root,
		bytes,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		format: "ttf" as const,
	};
}
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
	);
});
describe("QCut private font cache", () => {
	it("keeps a single verified object across concurrent reads and writes", async () => {
		const data = await fixture();
		await Promise.all(
			Array.from({ length: 4 }, () => retainPrivateJianyingFont(data))
		);
		expect(await readPrivateJianyingFont(data)).toEqual(data.bytes);
		expect(await readdir(data.root)).toEqual([`${data.sha256}.ttf`]);
	});
	it("repairs a corrupt private copy only from matching original bytes", async () => {
		const data = await fixture();
		await writeFile(join(data.root, `${data.sha256}.ttf`), "corrupt");
		expect(await readPrivateJianyingFont(data)).toBeNull();
		await expect(
			retainPrivateJianyingFont({ ...data, bytes: Buffer.from("wrong") })
		).rejects.toThrow("checksum");
		await retainPrivateJianyingFont(data);
		expect(await readPrivateJianyingFont(data)).toEqual(data.bytes);
	});
	it("rejects path-like identities before touching disk", async () => {
		const data = await fixture();
		await expect(
			readPrivateJianyingFont({ ...data, sha256: "../font" })
		).rejects.toThrow("identity");
		expect(await readdir(data.root)).toEqual([]);
	});
});

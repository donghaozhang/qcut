// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPath } = vi.hoisted(() => ({ getPath: vi.fn() }));

vi.mock("electron", () => ({ app: { getPath } }));

import { resolveLocalMediaFilename } from "../local-media-protocol.js";

let root = "";

function token({ filePath }: { filePath: string }) {
	return Buffer.from(filePath, "utf8").toString("base64url");
}

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "qcut-local-media-protocol-"));
	getPath.mockImplementation((name: string) => {
		if (name === "home") return path.join(root, "home");
		return path.join(root, name);
	});
});

afterEach(async () => {
	vi.clearAllMocks();
	await rm(root, { force: true, recursive: true });
});

describe("local media protocol", () => {
	it("serves only derived deflicker media inside the QCut cache root", async () => {
		const cacheFile = path.join(
			root,
			"home",
			"Library",
			"Caches",
			"QCut",
			"JianyingBasicVideo",
			"deflicker",
			"derived.mp4"
		);
		const outsideFile = path.join(root, "home", "private.mp4");
		await Promise.all([
			mkdir(path.dirname(cacheFile), { recursive: true }),
			mkdir(path.dirname(outsideFile), { recursive: true }),
		]);
		await Promise.all([
			writeFile(cacheFile, "derived"),
			writeFile(outsideFile, "private"),
		]);

		expect(
			resolveLocalMediaFilename({ token: token({ filePath: cacheFile }) })
		).toBe(await realpath(cacheFile));
		expect(
			resolveLocalMediaFilename({ token: token({ filePath: outsideFile }) })
		).toBeNull();
	});
});

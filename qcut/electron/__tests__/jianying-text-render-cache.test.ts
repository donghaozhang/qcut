import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION,
	readJianyingTextCachedRender,
} from "../jianying-text-runtime/render-cache.js";

const directories: string[] = [];
const cacheKey = "a".repeat(64);
const expected = {
	frameCount: 3,
	fps: 30,
	templateDuration: 2.5,
	width: 320,
	height: 180,
};

function pngHeader({ width, height }: { width: number; height: number }) {
	const bytes = Buffer.alloc(24);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
	bytes.writeUInt32BE(13, 8);
	bytes.write("IHDR", 12, "ascii");
	bytes.writeUInt32BE(width, 16);
	bytes.writeUInt32BE(height, 20);
	return bytes;
}

async function createCache() {
	const directory = await mkdtemp(path.join(os.tmpdir(), "qcut-text-cache-"));
	directories.push(directory);
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, "manifest.json"),
		JSON.stringify({
			schemaVersion: JIANYING_TEXT_RENDER_CACHE_SCHEMA_VERSION,
			cacheKey,
			frameCount: expected.frameCount,
			fps: expected.fps,
			strategy: "host-text",
			templateDuration: expected.templateDuration,
		})
	);
	await Promise.all(
		Array.from({ length: expected.frameCount }, (_, index) =>
			writeFile(
				path.join(directory, `frame-${String(index).padStart(6, "0")}.png`),
				pngHeader(expected)
			)
		)
	);
	return directory;
}

describe("Jianying text render cache", () => {
	afterEach(async () => {
		await Promise.all(
			directories
				.splice(0)
				.map((directory) => rm(directory, { recursive: true, force: true }))
		);
	});

	it("accepts a complete cache matching the render request", async () => {
		const directory = await createCache();
		await expect(
			readJianyingTextCachedRender({ directory, cacheKey, expected })
		).resolves.toMatchObject({ frameCount: 3, fps: 30 });
	});

	it("rejects a missing middle frame", async () => {
		const directory = await createCache();
		await rm(path.join(directory, "frame-000001.png"));
		await expect(
			readJianyingTextCachedRender({ directory, cacheKey, expected })
		).resolves.toBeNull();
	});

	it("rejects a corrupt or incorrectly sized middle frame", async () => {
		const directory = await createCache();
		await writeFile(
			path.join(directory, "frame-000001.png"),
			pngHeader({ width: 640, height: 360 })
		);
		await expect(
			readJianyingTextCachedRender({ directory, cacheKey, expected })
		).resolves.toBeNull();
	});

	it("rejects manifest timing that does not match the request", async () => {
		const directory = await createCache();
		await expect(
			readJianyingTextCachedRender({
				directory,
				cacheKey,
				expected: { ...expected, fps: 24 },
			})
		).resolves.toBeNull();
	});
});

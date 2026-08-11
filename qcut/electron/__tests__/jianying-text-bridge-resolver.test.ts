// @vitest-environment node
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { materializeJianyingTextRuntimeBridge } from "../jianying-text-runtime/bridge-resolver.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-text-bridge-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

describe("Jianying text runtime bridge resolver", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { recursive: true, force: true }))
		);
	});

	it("places the bridge beside a stable Frameworks link", async () => {
		const root = await createTemporaryDirectory();
		const bridgePath = path.join(root, "source", "bridge");
		const runtimeRoot = path.join(root, "runtime");
		const frameworksPath = path.join(runtimeRoot, "Frameworks");
		const cacheRoot = path.join(root, "cache");
		await Promise.all([
			mkdir(path.dirname(bridgePath), { recursive: true }),
			mkdir(frameworksPath, { recursive: true }),
		]);
		await writeFile(bridgePath, "signed bridge");

		const [first, second] = await Promise.all([
			materializeJianyingTextRuntimeBridge({
				bridgePath,
				runtimeRoot,
				cacheRoot,
			}),
			materializeJianyingTextRuntimeBridge({
				bridgePath,
				runtimeRoot,
				cacheRoot,
			}),
		]);

		expect(second).toBe(first);
		expect(await readFile(first, "utf8")).toBe("signed bridge");
		await expect(access(first, 1)).resolves.toBeUndefined();
		expect(
			await readlink(path.join(path.dirname(first), "..", "Frameworks"))
		).toBe(await realpath(frameworksPath));
	});
});

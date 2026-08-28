// @vitest-environment node
import {
	chmod,
	mkdir,
	mkdtemp,
	open,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME } from "../jianying-person-cutout/atomic-publish-lock.js";
import {
	compileVideoObjectCoreMLBridge,
	isValidVideoObjectCoreMLBridge,
} from "../jianying-person-cutout/video-object-coreml-bridge-resolver.js";

const temporaryDirectories: string[] = [];
const originalPath = process.env.PATH;

async function createTemporaryDirectory() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-coreml-bridge-resolver-test-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

async function installFakeCompiler({ directory }: { directory: string }) {
	const binDirectory = path.join(directory, "fake-bin");
	const xcrunPath = path.join(binDirectory, "xcrun");
	await mkdir(binDirectory, { recursive: true });
	await writeFile(
		xcrunPath,
		`#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const outputPath = args[args.lastIndexOf("-o") + 1];
const image = Buffer.alloc(process.env.QCUT_FAKE_TRUNCATED_BRIDGE === "1" ? 16 : 4096);
Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(image);
Buffer.from("video-object-same-model-coreml-v1").copy(image, 64);
setTimeout(() => {
  fs.writeFileSync(outputPath, image);
  fs.chmodSync(outputPath, 0o755);
}, Number(process.env.QCUT_FAKE_COMPILER_DELAY_MS || 0));
`,
		"utf8"
	);
	await chmod(xcrunPath, 0o755);
	process.env.PATH = `${binDirectory}:${originalPath ?? ""}`;
}

afterEach(async () => {
	process.env.PATH = originalPath;
	Reflect.deleteProperty(process.env, "QCUT_FAKE_COMPILER_DELAY_MS");
	Reflect.deleteProperty(process.env, "QCUT_FAKE_TRUNCATED_BRIDGE");
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe.runIf(process.platform === "darwin")(
	"video-object CoreML bridge resolver",
	() => {
		it("rejects an executable but truncated cached bridge", async () => {
			const directory = await createTemporaryDirectory();
			const bridgePath = path.join(directory, "bridge");
			await writeFile(bridgePath, Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
			await chmod(bridgePath, 0o755);

			await expect(
				isValidVideoObjectCoreMLBridge({ filePath: bridgePath })
			).resolves.toBe(false);
		});

		it("repairs a truncated cache through a unique temporary output", async () => {
			const directory = await createTemporaryDirectory();
			await installFakeCompiler({ directory });
			const outputPath = path.join(directory, "cache", "bridge");
			await mkdir(path.dirname(outputPath), { recursive: true });
			await writeFile(outputPath, Buffer.from("truncated"));
			await chmod(outputPath, 0o755);

			await expect(
				compileVideoObjectCoreMLBridge({ outputPath, projectRoot: directory })
			).resolves.toBe(outputPath);
			await expect(
				isValidVideoObjectCoreMLBridge({ filePath: outputPath })
			).resolves.toBe(true);
			expect(await readdir(path.dirname(outputPath))).toEqual(["bridge"]);
		});

		it("publishes one immutable bridge during concurrent compilation", async () => {
			const directory = await createTemporaryDirectory();
			await installFakeCompiler({ directory });
			process.env.QCUT_FAKE_COMPILER_DELAY_MS = "20";
			const outputPath = path.join(directory, "cache", "bridge");
			const calls = Array.from({ length: 6 }, () =>
				compileVideoObjectCoreMLBridge({
					outputPath,
					projectRoot: directory,
				})
			);

			const winner = await Promise.race(calls);
			const winnerStat = await stat(winner);
			const winnerHandle = await open(winner, "r");
			try {
				expect(new Set(await Promise.all(calls))).toEqual(
					new Set([outputPath])
				);
				expect((await stat(winner)).ino).toBe(winnerStat.ino);
				const magic = Buffer.alloc(4);
				await winnerHandle.read(magic, 0, magic.length, 0);
				expect(magic).toEqual(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]));
			} finally {
				await winnerHandle.close();
			}
			expect(await readdir(path.dirname(outputPath))).toEqual(["bridge"]);
		});

		it("cleans a truncated compiler output without publishing it", async () => {
			const directory = await createTemporaryDirectory();
			await installFakeCompiler({ directory });
			process.env.QCUT_FAKE_TRUNCATED_BRIDGE = "1";
			const outputPath = path.join(directory, "cache", "bridge");

			await expect(
				compileVideoObjectCoreMLBridge({ outputPath, projectRoot: directory })
			).rejects.toThrow("构建产物无效");
			await expect(
				isValidVideoObjectCoreMLBridge({ filePath: outputPath })
			).resolves.toBe(false);
			expect(await readdir(path.dirname(outputPath))).toEqual([]);
		});

		it("never steals an old publish lock owned by a live compiler", async () => {
			const directory = await createTemporaryDirectory();
			await installFakeCompiler({ directory });
			const outputPath = path.join(directory, "cache", "bridge");
			const lockPath = `${outputPath}.publish-lock`;
			await mkdir(lockPath, { recursive: true });
			await writeFile(
				path.join(lockPath, ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME),
				JSON.stringify({ createdAt: 0, pid: process.pid }),
				"utf8"
			);

			await expect(
				compileVideoObjectCoreMLBridge({
					lockTiming: { retryMs: 1, waitMs: 5 },
					outputPath,
					projectRoot: directory,
				})
			).rejects.toThrow("Timed out waiting for cache publication lock");
			expect((await stat(lockPath)).isDirectory()).toBe(true);
			expect(await readdir(path.dirname(outputPath))).toEqual([
				"bridge.publish-lock",
			]);
		});
	}
);

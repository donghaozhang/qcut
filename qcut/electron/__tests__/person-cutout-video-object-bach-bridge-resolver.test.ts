// @vitest-environment node
import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	open,
	readFile,
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
	VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER,
	VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256,
} from "../jianying-person-cutout/video-object-runtime-closure.js";
import {
	compileVideoObjectBachBridge,
	isValidVideoObjectBachBridge,
	VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS,
} from "../jianying-person-cutout/video-object-bach-bridge-resolver.js";

const temporaryDirectories: string[] = [];
const originalPath = process.env.PATH;

describe("video-object Bach native closure contract", () => {
	it("keeps every native framework SHA and aggregate marker aligned with TypeScript", async () => {
		const source = await readFile(
			path.resolve(
				__dirname,
				"../jianying-person-cutout/native/video-object-bach-bridge.mm"
			),
			"utf8"
		);
		const mainSha = source.match(
			/kExpectedLibrarySha256\s*=\s*"([a-f0-9]{64})"/
		)?.[1];
		const nativeDependencies = Array.from(
			source.matchAll(/\{"(lib[^"/]+\.dylib)",\s*"([a-f0-9]{64})"\}/g),
			([, fileName, sha256]) => [fileName, sha256] as const
		);
		expect(mainSha).toBeDefined();
		nativeDependencies.push(["libcccreator.dylib", mainSha ?? ""]);
		const compareFileNames = (
			[left]: readonly string[],
			[right]: readonly string[]
		) => (left < right ? -1 : left > right ? 1 : 0);
		nativeDependencies.sort(compareFileNames);
		const expectedDependencies =
			VIDEO_OBJECT_BACH_AUDITED_FRAMEWORK_DEPENDENCIES.map(
				([dependencyPath, sha256]) =>
					[path.basename(dependencyPath), sha256] as const
			).sort(compareFileNames);
		expect(nativeDependencies).toEqual(expectedDependencies);

		const canonicalClosure = nativeDependencies
			.map(([fileName, sha256]) => `${fileName}=${sha256}\n`)
			.join("");
		expect(createHash("sha256").update(canonicalClosure).digest("hex")).toBe(
			VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_SHA256
		);
		const markerFragments = source.match(
			/kRuntimeFrameworkClosureId\s*=\s*"([^"]+)"\s*"([a-f0-9]{64})"/
		);
		expect(`${markerFragments?.[1]}${markerFragments?.[2]}`).toBe(
			VIDEO_OBJECT_BACH_DEPENDENCY_CLOSURE_MARKER
		);
	});
});

async function createTemporaryDirectory() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-bach-bridge-resolver-test-")
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
const markers = ${JSON.stringify(VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS)};
Buffer.from(markers.join("\\0")).copy(image, 64);
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
	"video-object Bach bridge resolver",
	() => {
		it("rejects a bridge that omits a pinned capability marker", async () => {
			const directory = await createTemporaryDirectory();
			const bridgePath = path.join(directory, "bridge");
			const image = Buffer.alloc(4096);
			Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(image);
			Buffer.from(
				VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS.slice(0, -1).join("\0")
			).copy(image, 64);
			await writeFile(bridgePath, image);
			await chmod(bridgePath, 0o755);

			await expect(
				isValidVideoObjectBachBridge({ filePath: bridgePath })
			).resolves.toBe(false);
		});

		it("rejects a stale bridge that lacks exact and advanced refinement markers", async () => {
			const directory = await createTemporaryDirectory();
			const bridgePath = path.join(directory, "bridge");
			const image = Buffer.alloc(4096);
			Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(image);
			const staleMarkers = VIDEO_OBJECT_BACH_BRIDGE_REQUIRED_MARKERS.filter(
				(marker) => !marker.includes("refinement")
			);
			Buffer.from(staleMarkers.join("\0")).copy(image, 64);
			await writeFile(bridgePath, image);
			await chmod(bridgePath, 0o755);

			await expect(
				isValidVideoObjectBachBridge({ filePath: bridgePath })
			).resolves.toBe(false);
		});

		it("repairs a truncated bridge through an atomic publication", async () => {
			const directory = await createTemporaryDirectory();
			await installFakeCompiler({ directory });
			const outputPath = path.join(directory, "cache", "bridge");
			await mkdir(path.dirname(outputPath), { recursive: true });
			await writeFile(outputPath, Buffer.from("truncated"));
			await chmod(outputPath, 0o755);

			await expect(
				compileVideoObjectBachBridge({ outputPath, projectRoot: directory })
			).resolves.toBe(outputPath);
			await expect(
				isValidVideoObjectBachBridge({ filePath: outputPath })
			).resolves.toBe(true);
			expect(await readdir(path.dirname(outputPath))).toEqual(["bridge"]);
		});

		it("publishes one immutable bridge during concurrent compilation", async () => {
			const directory = await createTemporaryDirectory();
			await installFakeCompiler({ directory });
			process.env.QCUT_FAKE_COMPILER_DELAY_MS = "20";
			const outputPath = path.join(directory, "cache", "bridge");
			const calls = Array.from({ length: 6 }, () =>
				compileVideoObjectBachBridge({ outputPath, projectRoot: directory })
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

		it("never steals a live compiler publication lock", async () => {
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
				compileVideoObjectBachBridge({
					lockTiming: { retryMs: 1, waitMs: 5 },
					outputPath,
					projectRoot: directory,
				})
			).rejects.toThrow("Timed out waiting for cache publication lock");
			expect((await stat(lockPath)).isDirectory()).toBe(true);
		});
	}
);

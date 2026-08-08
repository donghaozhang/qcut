import { createHash } from "node:crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
	defaultUpdateCacheDirectories,
	discardPreservedInstaller,
	findReusableInstaller,
	preserveInstallerFile,
	resolveCliUpdateCacheDirectory,
} from "../app-update-cache";

const temporaryDirectories: string[] = [];

function createDirectory(): string {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-cache-"));
	temporaryDirectories.push(directory);
	return directory;
}

function assetFor({ content }: { content: Buffer }) {
	return {
		name: "QCut-AI-Video-Editor-2026.8.702-arm64-mac.zip",
		url: "https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.07.2/QCut-AI-Video-Editor-2026.8.702-arm64-mac.zip",
		size: content.byteLength,
		digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
	};
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

describe("app update cache", () => {
	it("copies a matching cached package into the private directory", async () => {
		const content = Buffer.from("verified update payload");
		const asset = assetFor({ content });
		const pending = createDirectory();
		const cache = createDirectory();
		const workingDirectory = createDirectory();
		fs.writeFileSync(path.join(cache, asset.name), content);

		const found = await findReusableInstaller({
			asset,
			copyToDirectory: workingDirectory,
			directories: [pending, cache],
		});

		// The verified installer is the private copy, never the shared cache
		// path — a same-uid process must not be able to swap the bytes
		// between verification and a privileged install.
		expect(found?.installerPath).toBe(path.join(workingDirectory, asset.name));
		expect(found?.sourcePath).toBe(path.join(cache, asset.name));
		expect(fs.readFileSync(found?.installerPath as string)).toEqual(content);
	});

	it("skips size mismatches, digest mismatches, and missing directories", async () => {
		const content = Buffer.from("verified update payload");
		const asset = assetFor({ content });
		const workingDirectory = createDirectory();
		const wrongSize = createDirectory();
		fs.writeFileSync(path.join(wrongSize, asset.name), Buffer.from("short"));
		const wrongDigest = createDirectory();
		fs.writeFileSync(
			path.join(wrongDigest, asset.name),
			Buffer.from("same-length payload!!!!")
		);
		expect(fs.statSync(path.join(wrongDigest, asset.name)).size).toBe(
			asset.size
		);

		const found = await findReusableInstaller({
			asset,
			copyToDirectory: workingDirectory,
			directories: [
				wrongSize,
				wrongDigest,
				path.join(wrongSize, "does-not-exist"),
			],
		});

		expect(found).toBeUndefined();
		// Rejected candidates must not leave partial copies behind.
		expect(fs.existsSync(path.join(workingDirectory, asset.name))).toBe(false);
	});

	it("preserves a downloaded installer for the next attempt", () => {
		const source = createDirectory();
		const cache = createDirectory();
		const installerPath = path.join(source, "update.zip");
		fs.writeFileSync(installerPath, "payload");

		const preserved = preserveInstallerFile({
			installerPath,
			directory: path.join(cache, "qcut-cli-updates"),
		});

		expect(preserved).toBe(path.join(cache, "qcut-cli-updates", "update.zip"));
		expect(fs.readFileSync(preserved as string, "utf8")).toBe("payload");
		expect(fs.existsSync(installerPath)).toBe(false);
	});

	it("rejects asset names that are not direct filenames", async () => {
		const content = Buffer.from("verified update payload");
		const workingDirectory = createDirectory();
		const cache = createDirectory();
		for (const name of ["../escape.zip", "a/b.zip", "..", ".", ""]) {
			const found = await findReusableInstaller({
				asset: { ...assetFor({ content }), name },
				copyToDirectory: workingDirectory,
				directories: [cache],
			});
			expect(found).toBeUndefined();
		}
	});

	it("never deletes through a traversal in the preserved path", () => {
		const cache = createDirectory();
		const outside = createDirectory();
		const victim = path.join(outside, "victim.zip");
		fs.writeFileSync(victim, "keep me");

		discardPreservedInstaller({
			preservedPath: path.join(
				cache,
				"..",
				path.basename(outside),
				"victim.zip"
			),
			directory: cache,
		});

		expect(fs.existsSync(victim)).toBe(true);
	});

	it("only discards files inside the CLI cache directory", () => {
		const cache = createDirectory();
		const foreign = createDirectory();
		const owned = path.join(cache, "update.zip");
		const notOwned = path.join(foreign, "update.zip");
		fs.writeFileSync(owned, "ours");
		fs.writeFileSync(notOwned, "theirs");

		discardPreservedInstaller({ preservedPath: owned, directory: cache });
		discardPreservedInstaller({ preservedPath: notOwned, directory: cache });

		expect(fs.existsSync(owned)).toBe(false);
		// The app's own electron-updater staging area must never be touched.
		expect(fs.existsSync(notOwned)).toBe(true);
	});

	it("derives per-platform cache locations", () => {
		expect(
			defaultUpdateCacheDirectories({
				platform: "darwin",
				home: "/Users/example",
				env: {},
			})
		).toEqual([
			path.join(
				"/Users/example",
				"Library",
				"Caches",
				"qcut-updater",
				"pending"
			),
			path.join("/Users/example", "Library", "Caches", "qcut-cli-updates"),
		]);
		expect(
			resolveCliUpdateCacheDirectory({
				platform: "linux",
				home: "/home/example",
				env: { XDG_CACHE_HOME: "/tmp/xdg" },
			})
		).toBe(path.join("/tmp/xdg", "qcut-cli-updates"));
		const windows = defaultUpdateCacheDirectories({
			platform: "win32",
			home: "C:\\Users\\example",
			env: { LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local" },
		});
		expect(windows[0]).toContain("qcut-updater");
		expect(windows[1]).toContain("qcut-cli-updates");
	});
});

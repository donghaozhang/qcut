import { createHash, timingSafeEqual } from "node:crypto";
import {
	copyFileSync,
	createReadStream,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { QCutReleaseAsset } from "./app-update-release.js";

/**
 * Locations that may already hold a fully-downloaded update package:
 * the app's electron-updater staging cache (updaterCacheDirName in
 * app-update.yml) and the CLI's own preserved-installer cache. Reusing a
 * verified package there avoids re-downloading hundreds of megabytes.
 */
const ELECTRON_UPDATER_CACHE_NAME = "qcut-updater";
const CLI_UPDATE_CACHE_NAME = "qcut-cli-updates";

function platformCacheRoot({
	platform,
	home,
	env,
}: {
	platform: NodeJS.Platform;
	home: string;
	env: NodeJS.ProcessEnv;
}): string {
	if (platform === "darwin") return join(home, "Library", "Caches");
	if (platform === "win32") {
		return env.LOCALAPPDATA ?? join(home, "AppData", "Local");
	}
	return env.XDG_CACHE_HOME ?? join(home, ".cache");
}

export function resolveCliUpdateCacheDirectory({
	platform = process.platform,
	home = homedir(),
	env = process.env,
}: {
	platform?: NodeJS.Platform;
	home?: string;
	env?: NodeJS.ProcessEnv;
} = {}): string {
	return join(
		platformCacheRoot({ platform, home, env }),
		CLI_UPDATE_CACHE_NAME
	);
}

export function defaultUpdateCacheDirectories({
	platform = process.platform,
	home = homedir(),
	env = process.env,
}: {
	platform?: NodeJS.Platform;
	home?: string;
	env?: NodeJS.ProcessEnv;
} = {}): string[] {
	const root = platformCacheRoot({ platform, home, env });
	return [
		join(root, ELECTRON_UPDATER_CACHE_NAME, "pending"),
		join(root, CLI_UPDATE_CACHE_NAME),
	];
}

/**
 * Release asset names are validated upstream, but this module joins them
 * into privileged install paths, so it re-rejects anything that is not a
 * plain direct filename.
 */
function isDirectFileName({ name }: { name: string }): boolean {
	return (
		name.length > 0 &&
		name !== "." &&
		name !== ".." &&
		!name.includes("/") &&
		!name.includes("\\") &&
		!name.includes("\0")
	);
}

function fileSha256({ filePath }: { filePath: string }): Promise<string> {
	return new Promise((resolvePromise, rejectPromise) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", rejectPromise);
		stream.on("end", () => resolvePromise(hash.digest("hex")));
	});
}

function digestMatches({
	actual,
	expected,
}: {
	actual: string;
	expected: string;
}): boolean {
	const actualBytes = Buffer.from(actual, "hex");
	const expectedBytes = Buffer.from(expected, "hex");
	return (
		actualBytes.length === expectedBytes.length &&
		timingSafeEqual(actualBytes, expectedBytes)
	);
}

export interface ReusableInstaller {
	/** Private, verified copy inside the caller's working directory. */
	installerPath: string;
	/** Cache file the copy came from (for post-install cleanup). */
	sourcePath: string;
}

/**
 * Finds an already-downloaded copy of `asset` in the cache directories and,
 * before trusting it, copies it into `copyToDirectory` (the caller's fresh
 * 0700 mkdtemp) and verifies size + SHA-256 on that private copy. Verifying
 * the same inode that gets installed closes the window where a same-uid
 * process swaps the file at its predictable cache path between the hash and
 * a privileged consumer (e.g. `sudo dpkg -i`). Candidates that cannot be
 * read or fail verification are skipped silently — the caller falls back to
 * a normal download.
 */
export async function findReusableInstaller({
	asset,
	copyToDirectory,
	directories = defaultUpdateCacheDirectories(),
}: {
	asset: QCutReleaseAsset;
	copyToDirectory: string;
	directories?: string[];
}): Promise<ReusableInstaller | undefined> {
	if (!isDirectFileName({ name: asset.name })) return undefined;
	const expectedDigest = asset.digest.slice("sha256:".length);
	const privatePath = join(copyToDirectory, asset.name);
	for (const directory of directories) {
		const candidate = join(directory, asset.name);
		try {
			if (!existsSync(candidate)) continue;
			if (statSync(candidate).size !== asset.size) continue;
			copyFileSync(candidate, privatePath);
			if (statSync(privatePath).size !== asset.size) {
				rmSync(privatePath, { force: true });
				continue;
			}
			const actualDigest = await fileSha256({ filePath: privatePath });
			if (digestMatches({ actual: actualDigest, expected: expectedDigest })) {
				return { installerPath: privatePath, sourcePath: candidate };
			}
			rmSync(privatePath, { force: true });
		} catch {
			// Unreadable or racing candidates fall through to the next source.
			rmSync(privatePath, { force: true });
		}
	}
	return undefined;
}

/**
 * Best-effort: moves a fully-downloaded installer into the CLI update cache
 * so a failed install can retry without re-downloading. Returns the
 * preserved path, or undefined when preservation itself fails.
 */
export function preserveInstallerFile({
	installerPath,
	directory = resolveCliUpdateCacheDirectory(),
}: {
	installerPath: string;
	directory?: string;
}): string | undefined {
	try {
		mkdirSync(directory, { recursive: true });
		const preservedPath = join(directory, basename(installerPath));
		rmSync(preservedPath, { force: true });
		try {
			renameSync(installerPath, preservedPath);
		} catch {
			// Rename fails across devices (tmpdir -> home); fall back to copy.
			copyFileSync(installerPath, preservedPath);
			rmSync(installerPath, { force: true });
		}
		return preservedPath;
	} catch {
		return undefined;
	}
}

/** Removes a previously preserved installer once it has served its purpose. */
export function discardPreservedInstaller({
	preservedPath,
	directory = resolveCliUpdateCacheDirectory(),
}: {
	preservedPath: string;
	directory?: string;
}): void {
	// Only ever delete direct children of the CLI's own cache; reused
	// packages from the app's electron-updater staging area belong to the
	// app, and a `directory/../outside` path must never reach rmSync.
	if (resolve(preservedPath) !== resolve(directory, basename(preservedPath))) {
		return;
	}
	rmSync(preservedPath, { force: true });
}

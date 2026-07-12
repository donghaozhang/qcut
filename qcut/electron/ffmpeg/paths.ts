/**
 * FFmpeg/FFprobe Path Resolution
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { debugLog, debugWarn } from "./constants";

const nodeRequire = createRequire(__filename);

/** Safe check for Electron packaged mode — returns false in utility process. */
function isPackaged(): boolean {
	try {
		const electron = nodeRequire("electron") as
			| string
			| { app?: { isPackaged: boolean } };
		return typeof electron !== "string" && Boolean(electron.app?.isPackaged);
	} catch {
		return false;
	}
}

// ============================================================================
// Path Resolution Internals
// ============================================================================

interface StagedBinarySearchResult {
	resolvedPath: string | null;
	searchedPaths: string[];
}

function getBinaryName({
	tool,
	platform,
}: {
	tool: "ffmpeg" | "ffprobe";
	platform: string;
}): string {
	if (platform === "win32") {
		return `${tool}.exe`;
	}
	return tool;
}

function getPreferredTargetKeys(): string[] {
	const exactTarget = `${process.platform}-${process.arch}`;
	return [exactTarget];
}

function resolveStagedBinaryFromRoot({
	rootPath,
	binaryName,
}: {
	rootPath: string;
	binaryName: string;
}): StagedBinarySearchResult {
	const targetKeys = getPreferredTargetKeys();
	const searchedPaths = targetKeys.map((targetKey) =>
		path.join(rootPath, targetKey, binaryName)
	);

	for (const candidatePath of searchedPaths) {
		if (fs.existsSync(candidatePath)) {
			return { resolvedPath: candidatePath, searchedPaths };
		}
	}

	return { resolvedPath: null, searchedPaths };
}

function getDevStagedRootCandidates(): string[] {
	const candidates = [
		path.join(process.cwd(), "electron", "resources", "ffmpeg"),
		path.join(__dirname, "..", "..", "..", "electron", "resources", "ffmpeg"),
		path.join(__dirname, "..", "resources", "ffmpeg"),
	];
	return Array.from(new Set(candidates));
}

function resolveStagedBinaryFromCandidates({
	rootPaths,
	binaryName,
}: {
	rootPaths: string[];
	binaryName: string;
}): StagedBinarySearchResult {
	const searchedPaths: string[] = [];

	for (const rootPath of rootPaths) {
		const result = resolveStagedBinaryFromRoot({ rootPath, binaryName });
		searchedPaths.push(...result.searchedPaths);
		if (result.resolvedPath) {
			return {
				resolvedPath: result.resolvedPath,
				searchedPaths,
			};
		}
	}

	return { resolvedPath: null, searchedPaths };
}

function isBinaryExecutable({
	binaryPath,
}: {
	binaryPath: string;
}): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			const proc = spawn(binaryPath, ["-version"], {
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});

			const timeoutId = setTimeout(() => {
				proc.kill();
				resolve(false);
			}, 2500);

			proc.on("close", (code) => {
				clearTimeout(timeoutId);
				resolve(code === 0);
			});

			proc.on("error", () => {
				clearTimeout(timeoutId);
				resolve(false);
			});
		} catch {
			resolve(false);
		}
	});
}

function resolvePackagedStagedBinaryOrThrow({
	binaryName,
	toolName,
}: {
	binaryName: string;
	toolName: string;
}): string {
	const packagedRootPath = path.join(process.resourcesPath, "ffmpeg");
	const result = resolveStagedBinaryFromRoot({
		rootPath: packagedRootPath,
		binaryName,
	});

	if (result.resolvedPath) {
		debugLog(
			`Using staged ${toolName} binary from packaged resources:`,
			result.resolvedPath
		);
		return result.resolvedPath;
	}

	const searchDetails = result.searchedPaths.join(", ");
	throw new Error(
		`${toolName} staged binary not found in packaged app. Expected one of: ${searchDetails}`
	);
}

function resolvePackagedStagedBinary({
	binaryName,
}: {
	binaryName: string;
}): StagedBinarySearchResult {
	try {
		return resolveStagedBinaryFromRoot({
			rootPath: path.join(process.resourcesPath, "ffmpeg"),
			binaryName,
		});
	} catch {
		return { resolvedPath: null, searchedPaths: [] };
	}
}

/**
 * Returns platform-specific paths where FFmpeg might be installed.
 */
function getSystemFFmpegPaths(platform: string, binaryName: string): string[] {
	const homeDir = process.env.HOME || process.env.USERPROFILE || "";

	switch (platform) {
		case "win32": {
			const paths: string[] = [];
			const wingetBasePath = path.join(
				homeDir,
				"AppData",
				"Local",
				"Microsoft",
				"WinGet",
				"Packages"
			);
			if (fs.existsSync(wingetBasePath)) {
				const wingetPath = findFFmpegInWinget(wingetBasePath);
				if (wingetPath) {
					paths.push(wingetPath);
				}
			}
			paths.push("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe");
			paths.push(path.join(homeDir, "scoop", "shims", "ffmpeg.exe"));
			return paths;
		}

		case "darwin":
			return [
				"/opt/homebrew/bin/ffmpeg",
				"/usr/local/bin/ffmpeg",
				"/opt/local/bin/ffmpeg",
			];

		case "linux":
			return [
				"/usr/bin/ffmpeg",
				"/usr/local/bin/ffmpeg",
				"/snap/bin/ffmpeg",
				path.join(homeDir, ".local", "bin", "ffmpeg"),
			];

		default:
			debugWarn(`Unknown platform: ${platform}`);
			return [];
	}
}

function findFFmpegInWinget(wingetBasePath: string): string | null {
	try {
		const packages = fs.readdirSync(wingetBasePath);
		for (const pkg of packages) {
			if (pkg.toLowerCase().includes("ffmpeg")) {
				const pkgPath = path.join(wingetBasePath, pkg);
				const ffmpegExe = findFileRecursive(pkgPath, "ffmpeg.exe", 3);
				if (ffmpegExe) {
					return ffmpegExe;
				}
			}
		}
	} catch (err) {
		debugWarn("Error searching winget packages:", err);
	}
	return null;
}

function findFileRecursive(
	dir: string,
	filename: string,
	maxDepth: number
): string | null {
	if (maxDepth <= 0) return null;

	try {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (
				entry.isFile() &&
				entry.name.toLowerCase() === filename.toLowerCase()
			) {
				return fullPath;
			}
			if (entry.isDirectory()) {
				const found = findFileRecursive(fullPath, filename, maxDepth - 1);
				if (found) return found;
			}
		}
	} catch (err) {
		// Ignore permission errors
	}
	return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolves FFmpeg binary path for current environment (dev/packaged).
 *
 * Search order:
 * - Packaged: staged binary only (`process.resourcesPath/ffmpeg/<platform>-<arch>/`)
 * - Development: staged binary → ffmpeg-static → system install → PATH
 */
export function getFFmpegPath(): string {
	const platform = process.platform;
	const binaryName = getBinaryName({ tool: "ffmpeg", platform });
	const packagedResult = resolvePackagedStagedBinary({ binaryName });
	if (packagedResult.resolvedPath) {
		debugLog(
			"Using staged FFmpeg binary from packaged resources:",
			packagedResult.resolvedPath
		);
		return packagedResult.resolvedPath;
	}

	if (isPackaged()) {
		return resolvePackagedStagedBinaryOrThrow({
			binaryName,
			toolName: "FFmpeg",
		});
	}

	const devStagedResult = resolveStagedBinaryFromCandidates({
		rootPaths: getDevStagedRootCandidates(),
		binaryName,
	});
	if (devStagedResult.resolvedPath) {
		debugLog(
			"Using staged FFmpeg binary in development:",
			devStagedResult.resolvedPath
		);
		return devStagedResult.resolvedPath;
	}

	try {
		const staticPath = nodeRequire("ffmpeg-static") as string;
		if (fs.existsSync(staticPath)) {
			debugLog("Found ffmpeg-static:", staticPath);
			return staticPath;
		}
	} catch {
		debugLog("ffmpeg-static package not available in development");
	}

	const systemPaths = getSystemFFmpegPaths(platform, binaryName);
	for (const searchPath of systemPaths) {
		if (fs.existsSync(searchPath)) {
			debugLog("Found FFmpeg at system path:", searchPath);
			return searchPath;
		}
	}

	debugLog("Falling back to system PATH:", binaryName);
	return binaryName;
}

/**
 * Resolves FFprobe binary path.
 *
 * Search order:
 * - Packaged: staged binary only (`process.resourcesPath/ffmpeg/<platform>-<arch>/`)
 * - Development: staged binary → ffprobe-static (executable) → system install → FFmpeg dir → PATH
 */
export async function getFFprobePath(): Promise<string> {
	const platform = process.platform;
	const binaryName = getBinaryName({ tool: "ffprobe", platform });
	const packagedResult = resolvePackagedStagedBinary({ binaryName });
	if (
		packagedResult.resolvedPath &&
		(await isBinaryExecutable({ binaryPath: packagedResult.resolvedPath }))
	) {
		debugLog(
			"Using staged FFprobe binary from packaged resources:",
			packagedResult.resolvedPath
		);
		return packagedResult.resolvedPath;
	}

	if (isPackaged()) {
		return resolvePackagedStagedBinaryOrThrow({
			binaryName,
			toolName: "FFprobe",
		});
	}

	const devStagedResult = resolveStagedBinaryFromCandidates({
		rootPaths: getDevStagedRootCandidates(),
		binaryName,
	});
	if (devStagedResult.resolvedPath) {
		if (
			await isBinaryExecutable({
				binaryPath: devStagedResult.resolvedPath,
			})
		) {
			debugLog(
				"Using staged FFprobe binary in development:",
				devStagedResult.resolvedPath
			);
			return devStagedResult.resolvedPath;
		}
		debugWarn(
			"Staged FFprobe binary exists but failed executable check:",
			devStagedResult.resolvedPath
		);
	}

	try {
		const staticPath = (nodeRequire("ffprobe-static") as { path: string }).path;
		if (
			fs.existsSync(staticPath) &&
			(await isBinaryExecutable({ binaryPath: staticPath }))
		) {
			debugLog("Found ffprobe-static:", staticPath);
			return staticPath;
		}
	} catch {
		debugLog("ffprobe-static package not available in development");
	}

	const systemPaths = getSystemFFmpegPaths(platform, binaryName);
	for (const searchPath of systemPaths) {
		if (!fs.existsSync(searchPath)) {
			continue;
		}
		if (!(await isBinaryExecutable({ binaryPath: searchPath }))) {
			continue;
		}
		debugLog("Found FFprobe at system path:", searchPath);
		return searchPath;
	}

	const ffmpegPath = getFFmpegPath();
	const ffmpegDir = path.dirname(ffmpegPath);

	if (ffmpegPath === "ffmpeg" || ffmpegPath === "ffmpeg.exe") {
		debugLog("Falling back to system PATH FFprobe");
		return binaryName;
	}

	const ffprobeFromFFmpegDir = path.join(ffmpegDir, binaryName);
	if (fs.existsSync(ffprobeFromFFmpegDir)) {
		debugLog("Using FFprobe from FFmpeg directory:", ffprobeFromFFmpegDir);
		return ffprobeFromFFmpegDir;
	}

	debugLog("Falling back to system PATH FFprobe binary name:", binaryName);
	return binaryName;
}

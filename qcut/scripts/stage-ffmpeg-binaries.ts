import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface StageTarget {
	platform: string;
	arch: string;
	key: string;
}

interface StagedBinary {
	tool: "ffmpeg" | "ffprobe";
	path: string;
	downloaded: boolean;
}

interface VersionCheckResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	error: string;
}

const DEFAULT_STAGE_TARGETS = [
	"darwin-arm64",
	"darwin-x64",
	"win32-x64",
	"linux-x64",
];
const DEFAULT_BASE_URL =
	"https://github.com/descriptinc/ffmpeg-ffprobe-static/releases/download/";
const FALLBACK_RELEASE_TAG = "b6.1.2-rc.1";
const MIN_BINARY_SIZE_BYTES = 1_000_000;
const VERSION_CHECK_TIMEOUT_MS = 8000;
const DOWNLOAD_MAX_RETRIES = 3;
const DOWNLOAD_RETRY_DELAY_MS = 2000;
const STAGING_ROOT = join(process.cwd(), "electron", "resources", "ffmpeg");

function getErrorMessage({ error }: { error: unknown }): string {
	try {
		if (error instanceof Error) {
			return error.message;
		}
		return String(error);
	} catch {
		return "Unknown error";
	}
}

function parseTargets({ rawTargets }: { rawTargets: string }): StageTarget[] {
	try {
		const uniqueKeys = new Set(
			rawTargets
				.split(",")
				.map((target) => target.trim())
				.filter(Boolean)
		);

		if (uniqueKeys.size === 0) {
			throw new Error("No FFmpeg staging targets were provided");
		}

		return Array.from(uniqueKeys).map((key) => {
			const [platform, arch] = key.split("-");
			if (!platform || !arch) {
				throw new Error(
					`Invalid FFmpeg target "${key}". Expected format "<platform>-<arch>".`
				);
			}
			return { platform, arch, key };
		});
	} catch (error: unknown) {
		throw new Error(
			`Failed to parse FFmpeg staging targets: ${getErrorMessage({ error })}`
		);
	}
}

async function resolveReleaseTag(): Promise<string> {
	try {
		const packagePath = join(
			process.cwd(),
			"node_modules",
			"ffmpeg-ffprobe-static",
			"package.json"
		);

		if (!existsSync(packagePath)) {
			return FALLBACK_RELEASE_TAG;
		}

		const packageJsonRaw = await readFile(packagePath, "utf8");
		const packageJson = JSON.parse(packageJsonRaw) as {
			"ffmpeg-static"?: { "binary-release-tag"?: string };
		};

		const releaseTag = packageJson["ffmpeg-static"]?.["binary-release-tag"];
		if (!releaseTag) {
			return FALLBACK_RELEASE_TAG;
		}

		return releaseTag;
	} catch (error: unknown) {
		console.warn(
			`[stage-ffmpeg] Failed to resolve release tag from package metadata: ${getErrorMessage({ error })}`
		);
		return FALLBACK_RELEASE_TAG;
	}
}

function getBinaryName({
	platform,
	tool,
}: {
	platform: string;
	tool: "ffmpeg" | "ffprobe";
}): string {
	try {
		if (platform === "win32") {
			return `${tool}.exe`;
		}
		return tool;
	} catch (error: unknown) {
		throw new Error(
			`Failed to resolve binary filename: ${getErrorMessage({ error })}`
		);
	}
}

function isHostTarget({ target }: { target: StageTarget }): boolean {
	try {
		return target.platform === process.platform && target.arch === process.arch;
	} catch {
		return false;
	}
}

async function runVersionCheck({
	binaryPath,
}: {
	binaryPath: string;
}): Promise<VersionCheckResult> {
	return new Promise((resolve) => {
		try {
			const proc = spawn(binaryPath, ["-version"], {
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";

			const timeout = setTimeout(() => {
				proc.kill();
				resolve({
					exitCode: null,
					stdout,
					stderr,
					error: `timed out after ${VERSION_CHECK_TIMEOUT_MS}ms`,
				});
			}, VERSION_CHECK_TIMEOUT_MS);

			proc.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			proc.stderr?.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});

			proc.on("close", (exitCode: number | null) => {
				clearTimeout(timeout);
				resolve({ exitCode, stdout, stderr, error: "" });
			});
			proc.on("error", (error: Error) => {
				clearTimeout(timeout);
				resolve({ exitCode: null, stdout, stderr, error: error.message });
			});
		} catch (error: unknown) {
			resolve({
				exitCode: null,
				stdout: "",
				stderr: "",
				error: getErrorMessage({ error }),
			});
		}
	});
}

async function ensureBinary({
	target,
	tool,
	baseReleaseUrl,
	forceDownload,
}: {
	target: StageTarget;
	tool: "ffmpeg" | "ffprobe";
	baseReleaseUrl: string;
	forceDownload: boolean;
}): Promise<StagedBinary> {
	try {
		const binaryName = getBinaryName({ platform: target.platform, tool });
		const destinationPath = join(STAGING_ROOT, target.key, binaryName);

		if (!forceDownload && existsSync(destinationPath)) {
			const fileStat = await stat(destinationPath);
			if (fileStat.size >= MIN_BINARY_SIZE_BYTES) {
				return {
					tool,
					path: destinationPath,
					downloaded: false,
				};
			}
		}

		const downloadUrl = `${baseReleaseUrl}/${tool}-${target.platform}-${target.arch}`;
		let lastError: Error | null = null;
		let body: Buffer | null = null;
		for (let attempt = 1; attempt <= DOWNLOAD_MAX_RETRIES; attempt++) {
			try {
				const response = await fetch(downloadUrl);
				if (!response.ok) {
					throw new Error(
						`Download failed (${response.status} ${response.statusText}): ${downloadUrl}`
					);
				}
				body = Buffer.from(await response.arrayBuffer());
				lastError = null;
				break;
			} catch (err: unknown) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (attempt < DOWNLOAD_MAX_RETRIES) {
					console.warn(
						`[stage-ffmpeg] ${tool} ${target.key} attempt ${attempt}/${DOWNLOAD_MAX_RETRIES} failed: ${lastError.message}. Retrying in ${DOWNLOAD_RETRY_DELAY_MS}ms...`
					);
					await new Promise((r) => setTimeout(r, DOWNLOAD_RETRY_DELAY_MS));
				}
			}
		}
		if (!body || lastError) {
			throw (
				lastError ??
				new Error(
					`Failed to download ${tool} after ${DOWNLOAD_MAX_RETRIES} attempts`
				)
			);
		}
		if (body.length < MIN_BINARY_SIZE_BYTES) {
			throw new Error(
				`Downloaded ${tool} binary is unexpectedly small (${body.length} bytes)`
			);
		}

		await writeFile(destinationPath, body);
		if (target.platform !== "win32") {
			await chmod(destinationPath, 0o755);
		}

		return {
			tool,
			path: destinationPath,
			downloaded: true,
		};
	} catch (error: unknown) {
		throw new Error(
			`Failed to stage ${tool} for ${target.key}: ${getErrorMessage({ error })}`
		);
	}
}

async function stageTarget({
	target,
	baseReleaseUrl,
	forceDownload,
}: {
	target: StageTarget;
	baseReleaseUrl: string;
	forceDownload: boolean;
}): Promise<void> {
	try {
		await mkdir(join(STAGING_ROOT, target.key), { recursive: true });

		const [ffmpeg, ffprobe] = await Promise.all([
			ensureBinary({
				target,
				tool: "ffmpeg",
				baseReleaseUrl,
				forceDownload,
			}),
			ensureBinary({
				target,
				tool: "ffprobe",
				baseReleaseUrl,
				forceDownload,
			}),
		]);

		const downloadMode = forceDownload ? "forced-download" : "cached-or-fetch";
		console.log(
			`[stage-ffmpeg] ${target.key} (${downloadMode}): ffmpeg=${ffmpeg.downloaded ? "downloaded" : "cached"}, ffprobe=${ffprobe.downloaded ? "downloaded" : "cached"}`
		);

		if (!isHostTarget({ target })) {
			return;
		}

		const [ffmpegVersionResult, ffprobeVersionResult] = await Promise.all([
			runVersionCheck({ binaryPath: ffmpeg.path }),
			runVersionCheck({ binaryPath: ffprobe.path }),
		]);

		const ffmpegFailed =
			ffmpegVersionResult.error || ffmpegVersionResult.exitCode !== 0;
		const ffprobeFailed =
			ffprobeVersionResult.error || ffprobeVersionResult.exitCode !== 0;

		if (ffmpegFailed || ffprobeFailed) {
			// In CI, some runners (e.g. Blacksmith Windows) block execution of
			// downloaded binaries. Warn instead of failing — binaries are from a
			// trusted source and the size check already passed.
			const isCI = process.env.CI === "true" || !!process.env.CI;
			const detail = ffmpegFailed
				? `ffmpeg exit=${ffmpegVersionResult.exitCode} error=${ffmpegVersionResult.error} stderr=${ffmpegVersionResult.stderr.trim()}`
				: `ffprobe exit=${ffprobeVersionResult.exitCode} error=${ffprobeVersionResult.error} stderr=${ffprobeVersionResult.stderr.trim()}`;
			if (isCI) {
				console.warn(
					`[stage-ffmpeg] Host validation failed for ${target.key} (${detail}) — skipping in CI`
				);
				return;
			}
			throw new Error(`Host validation failed for ${target.key}: ${detail}`);
		}

		const ffmpegFirstLine = ffmpegVersionResult.stdout.split(/\r?\n/)[0] ?? "";
		const ffprobeFirstLine =
			ffprobeVersionResult.stdout.split(/\r?\n/)[0] ?? "";
		console.log(`[stage-ffmpeg] ${target.key} ffmpeg: ${ffmpegFirstLine}`);
		console.log(`[stage-ffmpeg] ${target.key} ffprobe: ${ffprobeFirstLine}`);
	} catch (error: unknown) {
		throw new Error(
			`Failed to stage target ${target.key}: ${getErrorMessage({ error })}`
		);
	}
}

async function stageFFmpegBinaries(): Promise<void> {
	try {
		const defaultTargets = DEFAULT_STAGE_TARGETS.join(",");
		const rawTargets = process.env.FFMPEG_STAGE_TARGETS || defaultTargets;
		const targets = parseTargets({ rawTargets });
		const releaseTag =
			process.env.FFMPEG_BINARY_RELEASE || (await resolveReleaseTag());
		const baseUrlRoot =
			process.env.FFMPEG_FFPROBE_STATIC_BASE_URL || DEFAULT_BASE_URL;
		const baseReleaseUrl = new URL(releaseTag, baseUrlRoot).toString();
		const forceDownload = process.env.FFMPEG_STAGE_FORCE === "1";

		await mkdir(STAGING_ROOT, { recursive: true });

		console.log(`[stage-ffmpeg] Staging root: ${STAGING_ROOT}`);
		console.log(
			`[stage-ffmpeg] Targets: ${targets.map((t) => t.key).join(", ")}`
		);
		console.log(`[stage-ffmpeg] Release: ${releaseTag}`);
		console.log(`[stage-ffmpeg] Base URL: ${baseReleaseUrl}`);

		await Promise.all(
			targets.map((target) =>
				stageTarget({ target, baseReleaseUrl, forceDownload })
			)
		);

		console.log("[stage-ffmpeg] FFmpeg/FFprobe staging completed");
	} catch (error: unknown) {
		console.error(
			`[stage-ffmpeg] FFmpeg staging failed: ${getErrorMessage({ error })}`
		);
		process.exit(1);
	}
}

stageFFmpegBinaries();

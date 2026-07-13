import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
	chmod,
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { path7za } from "7zip-bin";
import extractZip from "extract-zip";
import {
	getBinaryName,
	getTargetKeys,
	loadFFmpegManifest,
	manifestFingerprint,
	type FFmpegArtifact,
	type FFmpegManifest,
	type FFmpegTarget,
	type FFmpegTool,
} from "./ffmpeg-manifest.js";
import { verifyFFmpegBinaries } from "./ffmpeg-verify.js";

interface StageReceipt {
	fingerprint: string;
	binaryHashes: Record<FFmpegTool, string>;
}

const STAGING_ROOT = join(process.cwd(), "electron", "resources", "ffmpeg");
const CACHE_ROOT = join(process.cwd(), "node_modules", ".cache", "qcut-ffmpeg");
const DOWNLOAD_MAX_RETRIES = 3;
const DOWNLOAD_RETRY_DELAY_MS = 2000;
const DOWNLOAD_TIMEOUT_MS = 300_000;

async function runArchiveCommand({ args }: { args: string[] }): Promise<void> {
	// bun install does not always preserve the executable bit on 7zip-bin's
	// bundled binaries; electron-builder applies the same workaround.
	if (process.platform !== "win32") await chmod(path7za, 0o755);
	return new Promise((resolve, reject) => {
		const child = spawn(path7za, args, {
			stdio: ["ignore", "ignore", "pipe"],
			windowsHide: true,
		});
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (exitCode) => {
			if (exitCode === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`7-Zip extraction failed (exit=${exitCode}): ${stderr.trim()}`
				)
			);
		});
	});
}

function getErrorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function sha256File({ filePath }: { filePath: string }): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("error", reject);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

function isHostTarget({ target }: { target: FFmpegTarget }): boolean {
	return target.platform === process.platform && target.arch === process.arch;
}

function parseTargetKeys({
	rawTargets,
	manifest,
}: {
	rawTargets: string;
	manifest: FFmpegManifest;
}): string[] {
	const keys = Array.from(
		new Set(
			rawTargets
				.split(",")
				.map((target) => target.trim())
				.filter(Boolean)
		)
	);
	if (keys.length === 0) {
		throw new Error("No FFmpeg staging targets were provided");
	}
	for (const key of keys) {
		if (!manifest.targets[key]) {
			throw new Error(`FFmpeg target is not pinned in the manifest: ${key}`);
		}
	}
	return keys;
}

async function downloadArtifact({
	artifact,
	forceDownload,
}: {
	artifact: FFmpegArtifact;
	forceDownload: boolean;
}): Promise<string> {
	const archivePath = join(
		CACHE_ROOT,
		"archives",
		`${artifact.sha256}-${basename(new URL(artifact.url).pathname)}`
	);
	await mkdir(dirname(archivePath), { recursive: true });

	if (!forceDownload) {
		const existingHash = await sha256File({ filePath: archivePath }).catch(
			() => ""
		);
		if (existingHash === artifact.sha256) return archivePath;
	}

	let lastError: Error | null = null;
	for (let attempt = 1; attempt <= DOWNLOAD_MAX_RETRIES; attempt++) {
		const tempPath = `${archivePath}.download`;
		try {
			await rm(tempPath, { force: true });
			const response = await fetch(artifact.url, {
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
			});
			if (!response.ok) {
				throw new Error(
					`Download failed (${response.status} ${response.statusText})`
				);
			}
			await writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
			const actualHash = await sha256File({ filePath: tempPath });
			if (actualHash !== artifact.sha256) {
				throw new Error(
					`SHA256 mismatch: expected ${artifact.sha256}, received ${actualHash}`
				);
			}
			await rename(tempPath, archivePath);
			return archivePath;
		} catch (error: unknown) {
			await rm(tempPath, { force: true });
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < DOWNLOAD_MAX_RETRIES) {
				process.stderr.write(
					`[stage-ffmpeg] ${artifact.id} attempt ${attempt}/${DOWNLOAD_MAX_RETRIES} failed: ${lastError.message}; retrying\n`
				);
				await new Promise((resolve) =>
					setTimeout(resolve, DOWNLOAD_RETRY_DELAY_MS)
				);
			}
		}
	}
	throw lastError ?? new Error(`Failed to download ${artifact.id}`);
}

async function readReceipt({
	targetKey,
}: {
	targetKey: string;
}): Promise<StageReceipt | null> {
	try {
		const receiptPath = join(CACHE_ROOT, "receipts", `${targetKey}.json`);
		return JSON.parse(await readFile(receiptPath, "utf8")) as StageReceipt;
	} catch {
		return null;
	}
}

async function writeReceipt({
	targetKey,
	receipt,
}: {
	targetKey: string;
	receipt: StageReceipt;
}): Promise<void> {
	const receiptPath = join(CACHE_ROOT, "receipts", `${targetKey}.json`);
	await mkdir(dirname(receiptPath), { recursive: true });
	await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}

async function resolveBinaryPaths({
	targetKey,
	target,
}: {
	targetKey: string;
	target: FFmpegTarget;
}): Promise<Record<FFmpegTool, string>> {
	const targetRoot = join(STAGING_ROOT, targetKey);
	return {
		ffmpeg: join(targetRoot, getBinaryName({ target, tool: "ffmpeg" })),
		ffprobe: join(targetRoot, getBinaryName({ target, tool: "ffprobe" })),
	};
}

async function isCurrentStage({
	targetKey,
	target,
	fingerprint,
}: {
	targetKey: string;
	target: FFmpegTarget;
	fingerprint: string;
}): Promise<boolean> {
	const receipt = await readReceipt({ targetKey });
	if (!receipt || receipt.fingerprint !== fingerprint) return false;
	const binaryPaths = await resolveBinaryPaths({ targetKey, target });
	for (const tool of ["ffmpeg", "ffprobe"] as const) {
		const currentHash = await sha256File({ filePath: binaryPaths[tool] }).catch(
			() => ""
		);
		if (currentHash !== receipt.binaryHashes[tool]) return false;
	}
	return true;
}

async function extractArtifact({
	artifact,
	archivePath,
	target,
	tempTargetRoot,
}: {
	artifact: FFmpegArtifact;
	archivePath: string;
	target: FFmpegTarget;
	tempTargetRoot: string;
}): Promise<void> {
	const extractRoot = await mkdtemp(join(CACHE_ROOT, "extract-"));
	try {
		if (artifact.archiveFormat === "zip") {
			await extractZip(archivePath, { dir: extractRoot });
		} else {
			const compressedRoot = join(extractRoot, "compressed");
			await mkdir(compressedRoot, { recursive: true });
			await runArchiveCommand({
				args: ["x", archivePath, `-o${compressedRoot}`, "-y"],
			});
			await runArchiveCommand({
				args: [
					"x",
					join(compressedRoot, basename(archivePath, ".xz")),
					`-o${extractRoot}`,
					"-y",
				],
			});
		}
		for (const [tool, relativePath] of Object.entries(artifact.files) as Array<
			[FFmpegTool, string]
		>) {
			const destination = join(tempTargetRoot, getBinaryName({ target, tool }));
			await copyFile(join(extractRoot, relativePath), destination);
			if (target.platform !== "win32") await chmod(destination, 0o755);
		}
	} finally {
		await rm(extractRoot, { recursive: true, force: true });
	}
}

async function stageTarget({
	targetKey,
	manifest,
	forceDownload,
}: {
	targetKey: string;
	manifest: FFmpegManifest;
	forceDownload: boolean;
}): Promise<void> {
	const target = manifest.targets[targetKey];
	const fingerprint = manifestFingerprint({
		target,
		requiredBuildFlags: manifest.requiredBuildFlags,
		forbiddenBuildFlags: manifest.forbiddenBuildFlags,
	});
	if (
		!forceDownload &&
		(await isCurrentStage({ targetKey, target, fingerprint }))
	) {
		const binaryPaths = await resolveBinaryPaths({ targetKey, target });
		await verifyFFmpegBinaries({
			targetKey,
			target,
			requiredBuildFlags: manifest.requiredBuildFlags,
			forbiddenBuildFlags: manifest.forbiddenBuildFlags,
			ffmpegPath: binaryPaths.ffmpeg,
			ffprobePath: binaryPaths.ffprobe,
			execute: isHostTarget({ target }),
		});
		process.stdout.write(`[stage-ffmpeg] ${targetKey}: verified cache hit\n`);
		return;
	}

	const tempTargetRoot = await mkdtemp(join(CACHE_ROOT, `${targetKey}-`));
	try {
		for (const artifact of target.artifacts) {
			const archivePath = await downloadArtifact({ artifact, forceDownload });
			await extractArtifact({
				artifact,
				archivePath,
				target,
				tempTargetRoot,
			});
		}

		const tempFFmpegPath = join(
			tempTargetRoot,
			getBinaryName({ target, tool: "ffmpeg" })
		);
		const tempFFprobePath = join(
			tempTargetRoot,
			getBinaryName({ target, tool: "ffprobe" })
		);
		await verifyFFmpegBinaries({
			targetKey,
			target,
			requiredBuildFlags: manifest.requiredBuildFlags,
			forbiddenBuildFlags: manifest.forbiddenBuildFlags,
			ffmpegPath: tempFFmpegPath,
			ffprobePath: tempFFprobePath,
			execute: isHostTarget({ target }),
		});

		const destinationRoot = join(STAGING_ROOT, targetKey);
		await rm(destinationRoot, { recursive: true, force: true });
		await mkdir(dirname(destinationRoot), { recursive: true });
		await rename(tempTargetRoot, destinationRoot);

		const binaryPaths = await resolveBinaryPaths({ targetKey, target });
		const binaryHashes: Record<FFmpegTool, string> = {
			ffmpeg: await sha256File({ filePath: binaryPaths.ffmpeg }),
			ffprobe: await sha256File({ filePath: binaryPaths.ffprobe }),
		};
		await writeReceipt({
			targetKey,
			receipt: { fingerprint, binaryHashes },
		});
		process.stdout.write(
			`[stage-ffmpeg] ${targetKey}: staged and verified FFmpeg ${manifest.nativeVersion}\n`
		);
	} catch (error: unknown) {
		await rm(tempTargetRoot, { recursive: true, force: true });
		throw error;
	}
}

async function stageFFmpegBinaries(): Promise<void> {
	try {
		const manifest = await loadFFmpegManifest();
		const defaultTargets = getTargetKeys({ manifest }).join(",");
		const targetKeys = parseTargetKeys({
			rawTargets: process.env.FFMPEG_STAGE_TARGETS || defaultTargets,
			manifest,
		});
		const forceDownload = process.env.FFMPEG_STAGE_FORCE === "1";
		await mkdir(CACHE_ROOT, { recursive: true });
		process.stdout.write(
			`[stage-ffmpeg] FFmpeg ${manifest.nativeVersion}; targets=${targetKeys.join(", ")}\n`
		);
		await Promise.all(
			targetKeys.map((targetKey) =>
				stageTarget({ targetKey, manifest, forceDownload })
			)
		);
		process.stdout.write("[stage-ffmpeg] staging completed\n");
	} catch (error: unknown) {
		process.stderr.write(
			`[stage-ffmpeg] staging failed: ${getErrorMessage({ error })}\n`
		);
		process.exit(1);
	}
}

stageFFmpegBinaries();

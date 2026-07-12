import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	getBinaryName,
	getTargetKeys,
	loadFFmpegManifest,
	type FFmpegManifest,
	type FFmpegTarget,
} from "./ffmpeg-manifest.js";
import { verifyFFmpegBinaries } from "./ffmpeg-verify.js";

interface CandidateDir {
	fullPath: string;
	mtimeMs: number;
}

function getErrorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
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
	if (keys.length === 0) throw new Error("No staged FFmpeg targets configured");
	for (const key of keys) {
		if (!manifest.targets[key]) {
			throw new Error(`FFmpeg target is not pinned in the manifest: ${key}`);
		}
	}
	return keys;
}

async function resolveLatestResourcesDir(): Promise<string> {
	const distDir = join(process.cwd(), "dist-electron");
	if (!existsSync(distDir)) {
		throw new Error(`dist-electron not found: ${distDir}`);
	}

	const entries = await readdir(distDir, { withFileTypes: true });
	const candidateGroups = await Promise.all(
		entries.map(async (entry): Promise<string[]> => {
			if (!entry.isDirectory()) return [];
			const entryPath = join(distDir, entry.name);
			if (
				entry.name.endsWith("win-unpacked") ||
				entry.name.endsWith("linux-unpacked")
			) {
				return [join(entryPath, "resources")];
			}

			const macBundleCandidates = await readdir(entryPath, {
				withFileTypes: true,
			}).catch(() => []);
			return macBundleCandidates
				.filter((macEntry) => macEntry.isDirectory())
				.filter((macEntry) => macEntry.name.endsWith(".app"))
				.map((macEntry) =>
					join(entryPath, macEntry.name, "Contents", "Resources")
				);
		})
	);
	const existingCandidates = candidateGroups
		.flat()
		.filter((dirPath) => existsSync(dirPath));
	if (existingCandidates.length === 0) {
		throw new Error(`No packaged resources directory found in: ${distDir}`);
	}

	const candidates: CandidateDir[] = await Promise.all(
		existingCandidates.map(async (fullPath): Promise<CandidateDir> => {
			const fileStat = await stat(fullPath);
			return { fullPath, mtimeMs: fileStat.mtimeMs };
		})
	);
	return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0].fullPath;
}

function isHostTarget({ target }: { target: FFmpegTarget }): boolean {
	return target.platform === process.platform && target.arch === process.arch;
}

async function verifyPackagedFFmpeg(): Promise<void> {
	try {
		const [resourcesDir, manifest] = await Promise.all([
			process.env.QCUT_PACKAGED_RESOURCES_DIR
				? Promise.resolve(process.env.QCUT_PACKAGED_RESOURCES_DIR)
				: resolveLatestResourcesDir(),
			loadFFmpegManifest(),
		]);
		const stagedRoot = join(resourcesDir, "ffmpeg");
		if (!existsSync(stagedRoot)) {
			throw new Error(
				`Packaged staged FFmpeg directory not found: ${stagedRoot}`
			);
		}

		const packagedEntries = await readdir(stagedRoot, { withFileTypes: true });
		const pinnedTargetKeys = new Set(getTargetKeys({ manifest }));
		const packagedTargetKeys = packagedEntries
			.filter(
				(entry) => entry.isDirectory() && pinnedTargetKeys.has(entry.name)
			)
			.map((entry) => entry.name);
		const targetKeys = process.env.FFMPEG_STAGE_TARGETS
			? parseTargetKeys({
					rawTargets: process.env.FFMPEG_STAGE_TARGETS,
					manifest,
				})
			: packagedTargetKeys;
		if (targetKeys.length !== 1) {
			throw new Error(
				`Packaged app must contain exactly one native FFmpeg target; found: ${targetKeys.join(", ") || "none"}`
			);
		}
		for (const targetKey of targetKeys) {
			const target = manifest.targets[targetKey];
			await verifyFFmpegBinaries({
				targetKey,
				target,
				requiredBuildFlags: manifest.requiredBuildFlags,
				forbiddenBuildFlags: manifest.forbiddenBuildFlags,
				ffmpegPath: join(
					stagedRoot,
					targetKey,
					getBinaryName({ target, tool: "ffmpeg" })
				),
				ffprobePath: join(
					stagedRoot,
					targetKey,
					getBinaryName({ target, tool: "ffprobe" })
				),
				execute: isHostTarget({ target }),
			});
			process.stdout.write(
				`[verify-ffmpeg] ${targetKey}: FFmpeg ${manifest.nativeVersion} verified\n`
			);
		}
		process.stdout.write(
			`[verify-ffmpeg] packaged FFmpeg verification passed: ${resourcesDir}\n`
		);
	} catch (error: unknown) {
		process.stderr.write(
			`[verify-ffmpeg] verification failed: ${getErrorMessage({ error })}\n`
		);
		process.exit(1);
	}
}

verifyPackagedFFmpeg();

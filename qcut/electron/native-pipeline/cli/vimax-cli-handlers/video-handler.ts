/**
 * ViMax Novel2Video handler — Stage 4 of the decomposed pipeline.
 *
 * Reads the per-chunk scripts produced by Stage 3 and the portrait
 * catalogue from Stage 2, then generates one Seedance 2.0 video per
 * shot using the `ref2v` variant when any character has a catalogued
 * portrait and `t2v` otherwise. Output lands at
 * `<proj>/videos/shot_<id>.mp4`, with a sibling `registry.json` that
 * records each shot's outcome for downstream concatenation.
 *
 * Keeps provider key concerns on the proxy side: the handler never
 * reads `GMI_API_KEY` directly — `callModelApi` picks proxy mode
 * automatically when no env key is set and a session token is
 * available (standard `qcut system login` flow).
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/video-handler
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import {
	resolveProjectPaths,
	ensureProjectDirs,
	markStageCompleted,
	safeProjectSlug,
	shotVideoPath,
	videoRegistryPath,
	type ProjectPaths,
} from "../../output/project-paths.js";
import {
	estimateNovel2Video,
	printEstimate,
	printStageSummary,
	startStep,
	describeArtifact,
	formatUsd,
	type GeneratedArtifact,
} from "../../output/stage-reporter.js";
import {
	callModelApi,
	downloadOutput,
	type ApiCallResult,
} from "../../infra/api-caller.js";
import { uploadFileForReference } from "../../output/upload-helper.js";
import {
	adaptShotForSeedance,
	SEEDANCE_ENDPOINT,
	type AdaptedShot,
} from "./video-shot-adapter.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

/** Dep injection surface for tests. Production callers omit this. */
export interface HandleVimaxNovel2VideoDeps {
	uploadImpl?: typeof uploadFileForReference;
	callModelApiImpl?: typeof callModelApi;
	downloadOutputImpl?: typeof downloadOutput;
}

const SEEDANCE_COST_PER_SECOND = 0.052;
const DEFAULT_COST_GATE_USD = 2;
const DEFAULT_SHOT_DURATION = 5;

interface RawShot {
	shot_id?: string;
	description?: string;
	characters?: string[];
	duration_seconds?: number;
	first_frame_url?: string;
}

interface RawScene {
	shots?: RawShot[];
}

interface RawScript {
	scenes?: RawScene[];
}

interface Shot {
	shotId: string;
	description: string;
	characters: string[];
	durationSeconds: number;
	firstFrameUrl?: string;
	sourceChunk: string;
}

interface RegistryEntry {
	shot_id: string;
	status: "success" | "failed" | "skipped";
	variant?: string;
	mp4_path?: string;
	cost_usd?: number;
	duration_seconds?: number;
	reference_urls?: string[];
	error?: string;
	reason?: string;
}

/** vimax:novel2video — generate one MP4 per shot using Seedance 2.0. */
export async function handleVimaxNovel2Video(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	_signal?: AbortSignal,
	deps: HandleVimaxNovel2VideoDeps = {}
): Promise<CLIResult> {
	const slug = options.projectId ? safeProjectSlug(options.projectId) : "";
	if (!slug) {
		return {
			success: false,
			error: "Missing --project (project slug under QCUT_PROJECTS_DIR)",
		};
	}

	const uploadImpl = deps.uploadImpl ?? uploadFileForReference;
	const callApi = deps.callModelApiImpl ?? callModelApi;
	const downloadImpl = deps.downloadOutputImpl ?? downloadOutput;

	const paths = resolveProjectPaths(slug);
	ensureProjectDirs(paths);
	fs.mkdirSync(paths.videosDir, { recursive: true });

	// ── Load shots from scripts/*.json ────────────────────────────
	let shots: Shot[];
	try {
		shots = loadShots(paths);
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
	if (shots.length === 0) {
		return {
			success: false,
			error: `No shots found under ${paths.scriptsDir} — run \`flow novel2script\` first`,
		};
	}

	const maxShots = options.maxShots ?? shots.length;
	const plannedShots = shots.slice(0, Math.max(0, maxShots));
	const durationSeconds = clampShotDuration(options.duration);

	// ── Pre-flight + cost gate ────────────────────────────────────
	printEstimate(estimateNovel2Video(plannedShots.length, durationSeconds));

	const projectedCost =
		plannedShots.length * durationSeconds * SEEDANCE_COST_PER_SECOND;
	const costGate = options.costGate ?? DEFAULT_COST_GATE_USD;
	if (projectedCost > costGate && options.force !== true) {
		return {
			success: false,
			error: `Projected cost ${formatUsd(projectedCost)} exceeds gate ${formatUsd(costGate)} — pass --force or raise --cost-gate`,
		};
	}

	// ── Resolve & upload portraits ────────────────────────────────
	const portraitPaths = readPortraitRegistry(paths);
	const uploadStep = startStep(
		`upload ${Object.keys(portraitPaths).length} portraits`
	);
	const portraitUrls = await uploadPortraits(portraitPaths, uploadImpl);
	uploadStep.end(
		`${Object.keys(portraitUrls).length}/${Object.keys(portraitPaths).length} uploaded`
	);

	// ── Per-shot loop ─────────────────────────────────────────────
	const startTime = Date.now();
	const registry: RegistryEntry[] = [];
	const shotArtifacts: GeneratedArtifact[] = [];
	let successCount = 0;
	let failedCount = 0;
	let skippedCount = 0;
	let totalCost = 0;
	const aspectRatio =
		typeof options.aspectRatio === "string" ? options.aspectRatio : "16:9";
	const resolution =
		typeof options.resolution === "string" ? options.resolution : "720p";

	for (let i = 0; i < plannedShots.length; i++) {
		const shot = plannedShots[i];
		const mp4Path = shotVideoPath(paths, shot.shotId);
		const progressBase = Math.round((i / plannedShots.length) * 90);
		onProgress({
			stage: "generating",
			percent: progressBase,
			message: `Shot ${i + 1}/${plannedShots.length}: ${shot.shotId}`,
		});

		if (fs.existsSync(mp4Path) && options.force !== true) {
			console.error(`  [skip] shot ${shot.shotId} → ${mp4Path} already exists`);
			registry.push({
				shot_id: shot.shotId,
				status: "skipped",
				mp4_path: mp4Path,
				reason: "file exists; rerun with --force to overwrite",
			});
			skippedCount++;
			shotArtifacts.push(describeArtifact(mp4Path, `shot ${shot.shotId}`));
			writeRegistry(paths, registry);
			continue;
		}

		const adapted = adaptShotForSeedance(
			{
				shotId: shot.shotId,
				description: shot.description,
				characters: shot.characters,
				durationSeconds,
				firstFrameUrl: shot.firstFrameUrl,
				aspectRatio,
				resolution,
				generateAudio: true,
			},
			portraitUrls
		);

		const shotStep = startStep(
			`shot ${i + 1}/${plannedShots.length} [${adapted.variant.replace("gmi_seedance_2_0_260128_", "")}]`
		);
		let apiResult: ApiCallResult;
		try {
			apiResult = await callApi({
				endpoint: SEEDANCE_ENDPOINT,
				modelKey: adapted.variant,
				payload: adapted.payload,
				provider: "gmi",
			});
		} catch (err) {
			shotStep.end("failed");
			const message = err instanceof Error ? err.message : String(err);
			registry.push({
				shot_id: shot.shotId,
				status: "failed",
				variant: adapted.variant,
				reference_urls: adapted.referenceUrls,
				error: message,
				reason: adapted.reason,
			});
			failedCount++;
			writeRegistry(paths, registry);
			continue;
		}

		if (!apiResult.success || !apiResult.outputUrl) {
			shotStep.end("failed");
			registry.push({
				shot_id: shot.shotId,
				status: "failed",
				variant: adapted.variant,
				reference_urls: adapted.referenceUrls,
				error: apiResult.error ?? "No output URL returned",
				reason: adapted.reason,
			});
			failedCount++;
			writeRegistry(paths, registry);
			continue;
		}

		try {
			await downloadImpl(apiResult.outputUrl, mp4Path);
		} catch (err) {
			shotStep.end("download failed");
			registry.push({
				shot_id: shot.shotId,
				status: "failed",
				variant: adapted.variant,
				reference_urls: adapted.referenceUrls,
				error: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
				reason: adapted.reason,
			});
			failedCount++;
			writeRegistry(paths, registry);
			continue;
		}

		const cost = apiResult.cost ?? durationSeconds * SEEDANCE_COST_PER_SECOND;
		totalCost += cost;
		successCount++;
		shotStep.end(`${adapted.variant.replace("gmi_seedance_2_0_260128_", "")}, ${formatUsd(cost)}`);
		registry.push({
			shot_id: shot.shotId,
			status: "success",
			variant: adapted.variant,
			mp4_path: mp4Path,
			cost_usd: cost,
			duration_seconds: durationSeconds,
			reference_urls: adapted.referenceUrls,
			reason: adapted.reason,
		});
		shotArtifacts.push(describeArtifact(mp4Path, `shot ${shot.shotId}`));
		writeRegistry(paths, registry);
	}

	onProgress({ stage: "complete", percent: 100, message: "Done" });

	if (successCount > 0) {
		markStageCompleted(paths, "videos");
	}

	const totalDurationSeconds = (Date.now() - startTime) / 1000;
	const summaryArtifacts: GeneratedArtifact[] = [
		describeArtifact(videoRegistryPath(paths), "videos registry"),
		...shotArtifacts,
	];

	printStageSummary({
		title: "Stage 4 — Generate per-shot videos",
		totalSeconds: totalDurationSeconds,
		totalCostUsd: totalCost,
		artifacts: summaryArtifacts,
		extraLines: [
			`Shots succeeded: ${successCount}/${plannedShots.length}`,
			...(skippedCount > 0 ? [`Shots skipped:   ${skippedCount}`] : []),
			...(failedCount > 0 ? [`Shots failed:    ${failedCount}`] : []),
		],
	});

	return {
		success: successCount > 0,
		outputPath: paths.videosDir,
		cost: totalCost,
		duration: totalDurationSeconds,
		data: {
			shots_generated: successCount,
			shots_skipped: skippedCount,
			shots_failed: failedCount,
			shots_total: plannedShots.length,
			registry_path: videoRegistryPath(paths),
			errors: failedCount,
		},
		...(successCount === 0 && failedCount > 0
			? { error: `No shots succeeded (${failedCount} failed)` }
			: {}),
	};
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function clampShotDuration(value: number | string | undefined): number {
	if (value == null || value === "") return DEFAULT_SHOT_DURATION;
	const stripped = typeof value === "string" ? value.replace(/s$/, "") : value;
	const n = Math.round(Number(stripped));
	if (!Number.isFinite(n)) return DEFAULT_SHOT_DURATION;
	if (n < 4) return 4;
	if (n > 15) return 15;
	return n;
}

/** Flatten every `scripts/chunk_*.json` into an ordered Shot[]. */
function loadShots(paths: ProjectPaths): Shot[] {
	if (!fs.existsSync(paths.scriptsDir)) {
		throw new Error(
			`Scripts directory not found: ${paths.scriptsDir} — run \`flow novel2script\` first`
		);
	}

	const chunkFiles = fs
		.readdirSync(paths.scriptsDir)
		.filter((f) => /^chunk_\d+\.json$/.test(f))
		.sort();

	const out: Shot[] = [];
	for (const chunkFile of chunkFiles) {
		const chunkPath = path.join(paths.scriptsDir, chunkFile);
		const raw = JSON.parse(fs.readFileSync(chunkPath, "utf-8")) as RawScript;
		const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
		for (const scene of scenes) {
			const sceneShots = Array.isArray(scene?.shots) ? scene.shots : [];
			for (const shot of sceneShots) {
				if (!shot || typeof shot.shot_id !== "string") continue;
				out.push({
					shotId: shot.shot_id,
					description:
						typeof shot.description === "string" ? shot.description : "",
					characters: Array.isArray(shot.characters)
						? shot.characters.filter((c): c is string => typeof c === "string")
						: [],
					durationSeconds: Number(shot.duration_seconds) || DEFAULT_SHOT_DURATION,
					firstFrameUrl:
						typeof shot.first_frame_url === "string"
							? shot.first_frame_url
							: undefined,
					sourceChunk: chunkFile,
				});
			}
		}
	}
	return out;
}

interface PortraitRegistryFile {
	portraits?: Record<string, { front_view?: string }>;
}

/** Read portraits/registry.json — returns `name → local path` map. */
function readPortraitRegistry(paths: ProjectPaths): Record<string, string> {
	if (!fs.existsSync(paths.portraitRegistryPath)) return {};
	try {
		const raw = JSON.parse(
			fs.readFileSync(paths.portraitRegistryPath, "utf-8")
		) as PortraitRegistryFile;
		const portraits = raw?.portraits ?? {};
		const out: Record<string, string> = {};
		for (const [name, entry] of Object.entries(portraits)) {
			if (entry?.front_view && fs.existsSync(entry.front_view)) {
				out[name] = entry.front_view;
			}
		}
		return out;
	} catch {
		return {};
	}
}

/**
 * Upload every portrait file in parallel (bounded) and return the
 * `name → HTTPS URL` map. Failed uploads are logged and the name is
 * omitted — downstream shots degrade to t2v via the adapter.
 */
async function uploadPortraits(
	localPaths: Record<string, string>,
	uploadImpl: typeof uploadFileForReference
): Promise<Record<string, string>> {
	const entries = Object.entries(localPaths);
	const out: Record<string, string> = {};
	await Promise.all(
		entries.map(async ([name, localPath]) => {
			try {
				const result = await uploadImpl({ filePath: localPath });
				out[name] = result.url;
			} catch (err) {
				console.error(
					`  [warn] portrait upload failed for ${name}: ${err instanceof Error ? err.message : String(err)}`
				);
			}
		})
	);
	return out;
}

/** Write the per-run shot registry to disk (overwrites each time). */
function writeRegistry(paths: ProjectPaths, entries: RegistryEntry[]): void {
	fs.writeFileSync(
		videoRegistryPath(paths),
		JSON.stringify(
			{
				project_id: paths.slug,
				updated_at: new Date().toISOString(),
				shots: entries,
			},
			null,
			2
		)
	);
}

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
	readProjectMetadata,
	safeProjectSlug,
	shotVideoPath,
	videoRegistryPath,
	klingElementCachePath,
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
	resolveSeedanceFamily,
	type AdaptedShot,
	type SeedanceFamily,
} from "./video-shot-adapter.js";
import { ensureKlingElements } from "./kling-element-orchestrator.js";
import { lintScripts } from "./script-linter.js";
import { loadLintCorpus } from "./script-lint-handler.js";

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

/**
 * Conservative per-second cost ceiling per family. Used for the
 * pre-flight gate; the actual shot cost is recorded after the call
 * returns. FAL Seedance 2.0 ref2v is ~$0.6/s — we use that as the
 * worst-case across variants so the gate doesn't under-estimate.
 */
const COST_PER_SECOND: Record<SeedanceFamily, number> = {
	gmi: 0.052,
	fal: 0.6,
	// Vidu Q3 mix is $0.154/s at 720p/1080p and $0.07/s at 360p/540p.
	// Use the 720p+ rate as worst-case so the cost gate doesn't
	// under-estimate resolution-agnostic runs.
	vidu: 0.154,
	// Kling V3 Omni: std $0.084/s, std+sound $0.112/s, pro $0.112/s,
	// pro+sound $0.14/s. We default `mode: "pro"` and `sound: "on"`
	// when generateAudio is true — use the worst-case $0.14/s so the
	// gate doesn't under-estimate.
	"kling-omni": 0.14,
};

const DEFAULT_COST_GATE_USD = 2;
const DEFAULT_SHOT_DURATION = 5;

/** Strip the family prefix from a variant key for compact step labels. */
function shortVariantLabel(variant: string): string {
	return variant
		.replace(/^gmi_seedance_2_0_260128_/, "")
		.replace(/^seedance_2_0_/, "")
		.replace(/^seedance_2_0$/, "t2v")
		.replace(/^vidu_q3_/, "vidu-")
		.replace(/^gmi_kling_v3_omni_/, "kling-omni-");
}

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
	signal?: AbortSignal,
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

	// Passive lint: surface shots whose description mentions a catalogued
	// character not in characters[]. Non-blocking — users can inspect and
	// re-run after `flow lint-scripts --auto-fix` if they want to include
	// the mentioned characters via portrait/element refs.
	try {
		const { catalogued, shots: lintShots } = loadLintCorpus(paths);
		if (catalogued.length > 0 && lintShots.length > 0) {
			const findings = lintScripts({ catalogued, shots: lintShots });
			if (findings.length > 0) {
				console.error(
					`[lint] ${findings.length} shot(s) mention catalogued characters not in characters[]:`
				);
				for (const f of findings.slice(0, 5)) {
					console.error(`  ${f.shot_id}: missing [${f.missing.join(", ")}]`);
				}
				if (findings.length > 5) {
					console.error(
						`  … ${findings.length - 5} more. Run \`qcut flow lint-scripts --project ${slug}\` for the full report.`
					);
				}
			}
		}
	} catch {
		// Lint is advisory — never block the render pipeline on its errors.
	}

	const maxShots = options.maxShots ?? shots.length;
	const plannedShots = shots.slice(0, Math.max(0, maxShots));
	// When --duration is omitted, preserve each shot's script-authored
	// duration. When set, it acts as a global override.
	const durationOverride =
		options.duration != null && options.duration !== ""
			? clampShotDuration(options.duration)
			: undefined;
	const shotDuration = (shot: Shot): number =>
		durationOverride ?? clampShotDuration(shot.durationSeconds);

	let family: SeedanceFamily;
	try {
		family = resolveSeedanceFamily(options.model);
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}

	const costPerSecond = COST_PER_SECOND[family];

	// ── Pre-flight + cost gate ────────────────────────────────────
	const totalPlannedSeconds = plannedShots.reduce(
		(sum, shot) => sum + shotDuration(shot),
		0
	);
	const avgDuration =
		plannedShots.length > 0
			? totalPlannedSeconds / plannedShots.length
			: DEFAULT_SHOT_DURATION;
	printEstimate(
		estimateNovel2Video(plannedShots.length, avgDuration, costPerSecond)
	);

	const projectedCost = totalPlannedSeconds * costPerSecond;
	const costGate = options.costGate ?? DEFAULT_COST_GATE_USD;
	if (projectedCost > costGate && options.force !== true) {
		return {
			success: false,
			error: `Projected cost ${formatUsd(projectedCost)} (${family.toUpperCase()} @ $${costPerSecond}/s) exceeds gate ${formatUsd(costGate)} — pass --force or raise --cost-gate`,
		};
	}

	// ── Resolve & upload portraits ────────────────────────────────
	const portraitPaths = readPortraitRegistry(paths);
	const uploadStep = startStep(
		`upload ${Object.keys(portraitPaths).length} portraits`
	);
	const portraitUrls = await uploadPortraits(portraitPaths, uploadImpl, signal);
	uploadStep.end(
		`${Object.keys(portraitUrls).length}/${Object.keys(portraitPaths).length} uploaded`
	);

	// ── Kling Omni element pre-flight ─────────────────────────────
	// For the Kling Omni family, adaptShotForSeedance expects
	// `portraits` as `name → element_id` (not URL). Create an element
	// per portrait once (or reuse from the cache) before rendering.
	let portraitCatalog: Record<string, string> = portraitUrls;
	if (family === "kling-omni") {
		const elementStep = startStep(
			`ensure ${Object.keys(portraitUrls).length} Kling elements`
		);
		const result = await ensureKlingElements({
			portraitUrls,
			cachePath: klingElementCachePath(paths),
			onProgress: (ev) => {
				if (ev.status === "creating" || ev.status === "failed") {
					console.error(
						`  [kling-element ${ev.index}/${ev.total}] ${ev.name}: ${ev.status}${ev.error ? ` — ${ev.error}` : ""}`
					);
				}
			},
		});
		elementStep.end(
			`${result.cached.length} cached, ${result.created.length} created, ${Object.keys(result.failed).length} failed`
		);
		if (Object.keys(result.elementIds).length === 0) {
			return {
				success: false,
				error: `Kling Omni element pre-flight produced no element IDs — first error: ${Object.values(result.failed)[0] ?? "unknown"}`,
			};
		}
		portraitCatalog = result.elementIds;
	}

	// ── Resolve style prompt ──────────────────────────────────────
	// Priority: CLI --style-prompt > project.json style > (none).
	// The prompt is prepended to every shot's description so the video
	// model sees aesthetic cues BEFORE the scene description. Without
	// this, ref2v models (Seedance especially) pull toward their
	// photorealistic training bias when the shot description doesn't
	// name a referenced character (the ref image's style influence is
	// weak without a matching subject in the prompt).
	const projectMetadata = readProjectMetadata(paths);
	const stylePromptCandidate =
		(typeof options.stylePrompt === "string" && options.stylePrompt.trim()) ||
		(typeof projectMetadata?.style === "string" &&
			projectMetadata.style.trim()) ||
		"";
	const stylePrompt =
		stylePromptCandidate.length > 0 ? stylePromptCandidate : undefined;
	if (stylePrompt) {
		const source = options.stylePrompt?.trim()
			? "--style-prompt"
			: "project.json";
		console.error(
			`  [style] prepending "${stylePrompt}" to every shot prompt (source: ${source})`
		);
	}

	// ── Build character description map ───────────────────────────
	// Read portrait attributes from characters.json and format each into
	// a short visual description string. The adapter injects these as
	// `[Reference: name — description]` clauses into the prompt so the
	// model can bind reference images to the correct person.
	const characterDescriptions: Record<string, string> = {};
	try {
		if (fs.existsSync(paths.charactersPath)) {
			const chars = JSON.parse(
				fs.readFileSync(paths.charactersPath, "utf-8")
			) as Array<{
				name?: string;
				portrait?: Record<string, string>;
			}>;
			for (const c of chars) {
				if (!c.name) continue;
				const p = c.portrait ?? {};
				const parts = [p.age, p.ethnicity, p.gender, p.hair, p.clothing]
					.filter((v) => typeof v === "string" && v.trim().length > 0)
					.map((v) => v!.trim());
				if (parts.length > 0) {
					characterDescriptions[c.name] = parts.join(", ");
				}
			}
		}
	} catch {
		// Non-critical — prompts work without descriptions, just less accurately.
	}
	if (Object.keys(characterDescriptions).length > 0) {
		console.error(
			`  [refs] ${Object.keys(characterDescriptions).length} character descriptions loaded for prompt injection`
		);
	}

	// ── Resolve --style-anchor ────────────────────────────────────
	// Look up the user-specified anchor name in the final portrait
	// catalog. Unknown name → log a warning and skip (no anchor
	// fallback); per-shot behavior stays the same as before.
	let styleAnchor: { name: string; value: string } | undefined;
	if (options.styleAnchor) {
		const anchorName = options.styleAnchor.trim();
		const value = portraitCatalog[anchorName];
		if (value) {
			styleAnchor = { name: anchorName, value };
			console.error(
				`  [anchor] shots without catalogued characters will use "${anchorName}" as a style-ref fallback`
			);
		} else {
			console.error(
				`  [anchor] --style-anchor "${anchorName}" not found in portraits registry — ignoring`
			);
		}
	}

	// ── Per-shot pool ─────────────────────────────────────────────
	// Each shot is independent — poll + download happen inside callApi,
	// so running N shots concurrently parallelizes their wait loops.
	// Node is single-threaded, so pushing to shared arrays and
	// incrementing counters is atomic across await points; no locks.
	const startTime = Date.now();
	const registry: RegistryEntry[] = [];
	const shotArtifacts: GeneratedArtifact[] = [];
	let successCount = 0;
	let failedCount = 0;
	let skippedCount = 0;
	let totalCost = 0;
	let completedCount = 0;
	const aspectRatio =
		typeof options.aspectRatio === "string" ? options.aspectRatio : "16:9";
	const resolution =
		typeof options.resolution === "string" ? options.resolution : "720p";

	const concurrency = Math.max(
		1,
		Math.min(options.concurrency ?? 1, plannedShots.length)
	);
	if (concurrency > 1) {
		console.error(`  [pool] running up to ${concurrency} shots in parallel`);
	}

	const runOneShot = async (index: number): Promise<void> => {
		const shot = plannedShots[index];
		const mp4Path = shotVideoPath(paths, shot.shotId);
		const thisShotDuration = shotDuration(shot);

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
			return;
		}

		const adapted = adaptShotForSeedance(
			{
				shotId: shot.shotId,
				description: shot.description,
				characters: shot.characters,
				durationSeconds: thisShotDuration,
				firstFrameUrl: shot.firstFrameUrl,
				aspectRatio,
				resolution,
				generateAudio: true,
				styleAnchor,
				stylePrompt,
				characterDescriptions,
			},
			portraitCatalog,
			family
		);

		const shotStep = startStep(
			`shot ${shot.shotId} [${shortVariantLabel(adapted.variant)}]`
		);

		let apiResult: ApiCallResult;
		try {
			apiResult = await callApi({
				endpoint: adapted.endpoint,
				modelKey: adapted.variant,
				payload: adapted.payload,
				provider: adapted.provider,
				signal,
			});
		} catch (err) {
			shotStep.end("failed");
			registry.push({
				shot_id: shot.shotId,
				status: "failed",
				variant: adapted.variant,
				reference_urls: adapted.referenceUrls,
				error: err instanceof Error ? err.message : String(err),
				reason: adapted.reason,
			});
			failedCount++;
			writeRegistry(paths, registry);
			return;
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
			return;
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
			return;
		}

		const cost = apiResult.cost ?? thisShotDuration * costPerSecond;
		totalCost += cost;
		successCount++;
		shotStep.end(`${shortVariantLabel(adapted.variant)}, ${formatUsd(cost)}`);
		registry.push({
			shot_id: shot.shotId,
			status: "success",
			variant: adapted.variant,
			mp4_path: mp4Path,
			cost_usd: cost,
			duration_seconds: thisShotDuration,
			reference_urls: adapted.referenceUrls,
			reason: adapted.reason,
		});
		shotArtifacts.push(describeArtifact(mp4Path, `shot ${shot.shotId}`));
		writeRegistry(paths, registry);
	};

	// Worker pulls next index from the shared queue. Stops when empty.
	let nextIndex = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const i = nextIndex++;
			if (i >= plannedShots.length) return;
			onProgress({
				stage: "generating",
				percent: Math.round((completedCount / plannedShots.length) * 90),
				message: `Shot ${i + 1}/${plannedShots.length}: ${plannedShots[i].shotId}`,
			});
			await runOneShot(i);
			completedCount++;
		}
	};

	const workers: Promise<void>[] = [];
	for (let w = 0; w < concurrency; w++) workers.push(worker());
	await Promise.all(workers);

	onProgress({ stage: "complete", percent: 100, message: "Done" });

	if (successCount > 0 || (failedCount === 0 && skippedCount > 0)) {
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

	const allSkipped =
		successCount === 0 && failedCount === 0 && skippedCount > 0;
	return {
		success: successCount > 0 || allSkipped,
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
		.sort((a, b) => {
			const na = Number(a.match(/^chunk_(\d+)\.json$/)?.[1] ?? 0);
			const nb = Number(b.match(/^chunk_(\d+)\.json$/)?.[1] ?? 0);
			return na - nb;
		});

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
					durationSeconds:
						Number(shot.duration_seconds) || DEFAULT_SHOT_DURATION,
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

/**
 * Read portraits/registry.json — returns `name → local path` map.
 *
 * Missing registry is optional (returns `{}` → t2v fallback). An
 * unreadable or invalid registry fails fast so Stage 4 does not burn
 * budget on plain T2V when the user expected ref2v.
 */
function readPortraitRegistry(paths: ProjectPaths): Record<string, string> {
	if (!fs.existsSync(paths.portraitRegistryPath)) return {};
	const rawText = fs.readFileSync(paths.portraitRegistryPath, "utf-8");
	let parsed: PortraitRegistryFile;
	try {
		parsed = JSON.parse(rawText) as PortraitRegistryFile;
	} catch (err) {
		throw new Error(
			`Invalid JSON in ${paths.portraitRegistryPath}: ${err instanceof Error ? err.message : String(err)}`
		);
	}
	const portraits = parsed?.portraits ?? {};
	const out: Record<string, string> = {};
	for (const [name, entry] of Object.entries(portraits)) {
		if (entry?.front_view && fs.existsSync(entry.front_view)) {
			out[name] = entry.front_view;
		}
	}
	return out;
}

/**
 * Upload every portrait file in parallel (bounded) and return the
 * `name → HTTPS URL` map. Failed uploads are logged and the name is
 * omitted — downstream shots degrade to t2v via the adapter.
 */
async function uploadPortraits(
	localPaths: Record<string, string>,
	uploadImpl: typeof uploadFileForReference,
	signal?: AbortSignal
): Promise<Record<string, string>> {
	const entries = Object.entries(localPaths);
	const out: Record<string, string> = {};
	await Promise.all(
		entries.map(async ([name, localPath]) => {
			try {
				const result = await uploadImpl({ filePath: localPath, signal });
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

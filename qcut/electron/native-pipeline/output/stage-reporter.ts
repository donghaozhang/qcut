/**
 * Stage reporter for the staged novel-to-movie CLI commands.
 *
 * Provides three concerns behind a single small surface:
 *   1. Pre-flight estimates (expected duration + cost) based on novel
 *      length or character count, printed before the stage starts.
 *   2. Sub-step wall-clock timers emitted on stderr so users can watch
 *      where minutes go.
 *   3. Stage summary with absolute paths of every generated file plus a
 *      total duration number.
 *
 * All output goes through console.error so JSON stdout
 * (`--json` / `--stream`) stays machine-parsable.
 *
 * @module electron/native-pipeline/output/stage-reporter
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Rough duration+cost envelope for a stage, derived from observed runs. */
export interface StageEstimate {
	title: string;
	inputSummary: string;
	estLowSeconds: number;
	estHighSeconds: number;
	estLowCostUsd: number;
	estHighCostUsd: number;
	notes: string[];
}

/** Estimate stage 1 (character extraction) from novel length in chars. */
export function estimateCharacters(novelChars: number): StageEstimate {
	// CharacterExtractor only reads the first 50K chars, so novel length
	// beyond that doesn't affect runtime. Flash-lite on ~50K tokens:
	// observed 3-15s, <$0.02.
	return {
		title: "Stage 1 — Extract characters",
		inputSummary: `novel ${novelChars.toLocaleString()} chars (caps at 50,000 for extraction)`,
		estLowSeconds: 3,
		estHighSeconds: 15,
		estLowCostUsd: 0.005,
		estHighCostUsd: 0.02,
		notes: ["One LLM call; size-independent beyond the 50K-char window"],
	};
}

/** Estimate stage 2 (portraits) from character count. */
export function estimatePortraits(
	characterCount: number,
	views = 1
): StageEstimate {
	// Observed: flash-image portrait ~30-90s, $0.02/image.
	const calls = characterCount * views;
	return {
		title: "Stage 2 — Generate portraits",
		inputSummary: `${characterCount} characters × ${views} view(s) = ${calls} image calls`,
		estLowSeconds: 30 * calls,
		estHighSeconds: 90 * calls,
		estLowCostUsd: 0.02 * calls,
		estHighCostUsd: 0.03 * calls,
		notes: [
			"Portraits are generated sequentially — budget grows linearly",
			"GMI flash-image default; swap with --image-model for other providers",
		],
	};
}

/**
 * Estimate stage 3 (novel2script) from novel length + chunking config.
 *
 * Matches the chunking behaviour of splitNovelText so the predicted
 * chunk count aligns with what actually runs.
 */
export function estimateNovel2Script(
	novelChars: number,
	chunkSize = 2_000,
	overlap = 200
): StageEstimate {
	const stride = Math.max(1, chunkSize - overlap);
	// Deliberately matches the (start < text.length) loop in splitNovelText:
	// the stride-based iteration can emit small tail chunks past the last
	// "meaningful" boundary, so the real chunk count is floor((N-1)/stride) + 1.
	const chunks = Math.max(1, Math.ceil(novelChars / stride));
	// Flash-lite on ~2000 chars: observed 4-70s per call.
	return {
		title: "Stage 3 — Segment novel into scripts",
		inputSummary: `novel ${novelChars.toLocaleString()} chars → ~${chunks} chunks (${chunkSize}/${overlap})`,
		estLowSeconds: 4 * chunks,
		estHighSeconds: 70 * chunks,
		estLowCostUsd: 0.003 * chunks,
		estHighCostUsd: 0.01 * chunks,
		notes: [
			"Per-chunk variance is high — LLM can return in 4s or stall to 60s+",
			"Use --max-scenes N to cap the run once N scenes have been produced",
		],
	};
}

/**
 * Estimate stage 4 (novel2video) from shot count + average shot duration.
 *
 * Seedance 2.0 bills $0.052 / second; per-call wall-clock runs 3-6 min
 * based on the Apr-14 smoke run (3 shots, 4m 21s / 4m 25s / 4m 56s).
 */
export function estimateNovel2Video(
	shotCount: number,
	averageShotSeconds = 5
): StageEstimate {
	const cost = shotCount * averageShotSeconds * 0.052;
	return {
		title: "Stage 4 — Generate per-shot videos",
		inputSummary: `${shotCount} shot${shotCount === 1 ? "" : "s"} × ${averageShotSeconds}s → ${shotCount} Seedance calls`,
		// 3m-6m per shot observed; run serially unless --concurrency raised.
		estLowSeconds: 180 * shotCount,
		estHighSeconds: 360 * shotCount,
		estLowCostUsd: cost,
		estHighCostUsd: cost,
		notes: [
			"Per-shot wall-clock is 3-6 min (Apr-14 smoke run)",
			"Cost is fixed at $0.052/s — --max-shots caps total spend",
			"--force bypasses the cost gate; otherwise $2 projected limit",
		],
	};
}

/** Format seconds as `MMm SSs` (or `SSs` if under a minute). */
export function formatDuration(totalSeconds: number): string {
	if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
	const m = Math.floor(totalSeconds / 60);
	const s = Math.round(totalSeconds - m * 60);
	return `${m}m ${s}s`;
}

/** Format USD with three decimal places, always prefixed with `$`. */
export function formatUsd(amount: number): string {
	return `$${amount.toFixed(3)}`;
}

/** Print the pre-flight estimate banner to stderr. */
export function printEstimate(estimate: StageEstimate): void {
	const lines: string[] = [];
	lines.push("");
	lines.push("━".repeat(60));
	lines.push(`  ${estimate.title}`);
	lines.push("─".repeat(60));
	lines.push(`  Input:     ${estimate.inputSummary}`);
	lines.push(
		`  Expected:  ${formatDuration(estimate.estLowSeconds)}–${formatDuration(estimate.estHighSeconds)}  (${formatUsd(estimate.estLowCostUsd)}–${formatUsd(estimate.estHighCostUsd)})`
	);
	for (const note of estimate.notes) {
		lines.push(`  Note:      ${note}`);
	}
	lines.push("━".repeat(60));
	lines.push("");
	console.error(lines.join("\n"));
}

/** Start a named wall-clock step; returns an `end` function that logs elapsed. */
export interface StepHandle {
	label: string;
	end: (extras?: string) => number;
	elapsedSeconds: () => number;
}

export function startStep(label: string): StepHandle {
	const startMs = Date.now();
	return {
		label,
		elapsedSeconds: () => (Date.now() - startMs) / 1000,
		end: (extras?: string) => {
			const elapsed = (Date.now() - startMs) / 1000;
			const tail = extras ? `  ${extras}` : "";
			console.error(`  [step] ${label} — ${formatDuration(elapsed)}${tail}`);
			return elapsed;
		},
	};
}

/**
 * Describe a generated artifact for the stage summary.
 *
 * `path` must be an absolute filesystem path. `bytes` is optional and
 * auto-detected from disk when omitted.
 */
export interface GeneratedArtifact {
	path: string;
	label?: string;
	bytes?: number;
}

/** Resolve absolute path + optionally stat the file size. */
export function describeArtifact(
	filePath: string,
	label?: string
): GeneratedArtifact {
	const abs = path.resolve(filePath);
	let bytes: number | undefined;
	try {
		const stat = fs.statSync(abs);
		bytes = stat.size;
	} catch {
		bytes = undefined;
	}
	return { path: abs, label, bytes };
}

function humanBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Print the end-of-stage summary with absolute paths of every artifact. */
export function printStageSummary(params: {
	title: string;
	totalSeconds: number;
	totalCostUsd?: number;
	artifacts: GeneratedArtifact[];
	extraLines?: string[];
}): void {
	const lines: string[] = [];
	lines.push("");
	lines.push("━".repeat(60));
	lines.push(`  ${params.title} — complete`);
	lines.push("─".repeat(60));
	lines.push(`  Duration:  ${formatDuration(params.totalSeconds)}`);
	if (params.totalCostUsd != null) {
		lines.push(`  Cost:      ${formatUsd(params.totalCostUsd)}`);
	}
	if (params.extraLines) {
		for (const line of params.extraLines) {
			lines.push(`  ${line}`);
		}
	}
	if (params.artifacts.length > 0) {
		lines.push("  Outputs:");
		for (const art of params.artifacts) {
			const size = art.bytes != null ? ` (${humanBytes(art.bytes)})` : "";
			const label = art.label ? `  ${art.label}:` : "";
			lines.push(`    •${label} ${art.path}${size}`);
		}
	}
	lines.push("━".repeat(60));
	lines.push("");
	console.error(lines.join("\n"));
}

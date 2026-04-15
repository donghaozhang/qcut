/**
 * CLI handler for `flow lint-scripts` (a.k.a. `vimax:lint-scripts`).
 *
 * Reads the project's `characters.json` + every `scripts/chunk_*.json`
 * and uses the pure `lintScripts` helper to surface shots where the
 * description mentions a catalogued character that is not in the shot's
 * `characters[]` array. With `--auto-fix`, rewrites each chunk file
 * in place (backup saved alongside with a `.bak.<timestamp>` suffix).
 *
 * Keeps fs/IO concerns here so the linter itself stays pure.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/script-lint-handler
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import {
	resolveProjectPaths,
	safeProjectSlug,
	type ProjectPaths,
} from "../../output/project-paths.js";
import {
	lintScripts,
	applyLintAutoFix,
	type LintFinding,
	type LintShot,
} from "./script-linter.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

interface RawShot {
	shot_id?: string;
	description?: string;
	characters?: string[];
	[k: string]: unknown;
}

interface RawScene {
	shots?: RawShot[];
	[k: string]: unknown;
}

interface RawScript {
	scenes?: RawScene[];
	[k: string]: unknown;
}

interface RawCharacter {
	name?: string;
	[k: string]: unknown;
}

function readCataloguedNames(paths: ProjectPaths): string[] {
	if (!fs.existsSync(paths.charactersPath)) return [];
	try {
		const raw = fs.readFileSync(paths.charactersPath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return (parsed as RawCharacter[])
			.map((c) => (typeof c?.name === "string" ? c.name : ""))
			.filter((n) => n.length > 0);
	} catch {
		return [];
	}
}

function listChunkFiles(scriptsDir: string): string[] {
	if (!fs.existsSync(scriptsDir)) return [];
	return fs
		.readdirSync(scriptsDir)
		.filter((f) => /^chunk_\d+\.json$/.test(f))
		.sort((a, b) => {
			const na = Number(a.match(/^chunk_(\d+)\.json$/)?.[1] ?? 0);
			const nb = Number(b.match(/^chunk_(\d+)\.json$/)?.[1] ?? 0);
			return na - nb;
		});
}

interface ChunkFile {
	file: string;
	data: RawScript;
}

function readChunks(paths: ProjectPaths): ChunkFile[] {
	const chunks: ChunkFile[] = [];
	for (const file of listChunkFiles(paths.scriptsDir)) {
		const p = path.join(paths.scriptsDir, file);
		try {
			const data = JSON.parse(fs.readFileSync(p, "utf-8")) as RawScript;
			chunks.push({ file, data });
		} catch {
			// Skip unreadable files — surfaced via "0 findings" + stderr line.
			console.error(`[lint] skipped unreadable chunk: ${file}`);
		}
	}
	return chunks;
}

function flattenShots(chunks: ChunkFile[]): LintShot[] {
	const out: LintShot[] = [];
	for (const { data } of chunks) {
		const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
		for (const scene of scenes) {
			const shots = Array.isArray(scene?.shots) ? scene.shots : [];
			for (const shot of shots) {
				if (typeof shot?.shot_id !== "string") continue;
				out.push({
					shot_id: shot.shot_id,
					description: shot.description ?? "",
					characters: Array.isArray(shot.characters)
						? shot.characters.filter(
								(c): c is string => typeof c === "string"
							)
						: [],
				});
			}
		}
	}
	return out;
}

/**
 * Collect a flat `LintShot[]` from the project for use by Stage 4
 * passive warnings. Returns `{shots, catalogued}` so the caller can
 * directly pass them to `lintScripts`.
 */
export function loadLintCorpus(paths: ProjectPaths): {
	catalogued: string[];
	shots: LintShot[];
} {
	return {
		catalogued: readCataloguedNames(paths),
		shots: flattenShots(readChunks(paths)),
	};
}

/** CLI entry. Resolves the project, runs the linter, optionally auto-fixes. */
export async function handleLintScripts(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const raw = (options.projectId ?? "").trim();
	if (raw.length === 0) {
		return { success: false, error: "--project is required" };
	}
	const slug = safeProjectSlug(raw);
	const paths = resolveProjectPaths(slug);

	onProgress({ stage: "loading", percent: 10, message: "Reading project files" });
	const catalogued = readCataloguedNames(paths);
	if (catalogued.length === 0) {
		return {
			success: false,
			error: `No catalogued characters at ${paths.charactersPath} — run \`flow characters\` first`,
		};
	}
	const chunks = readChunks(paths);
	if (chunks.length === 0) {
		return {
			success: false,
			error: `No scripts/chunk_*.json files at ${paths.scriptsDir} — run \`flow novel2script\` first`,
		};
	}

	onProgress({ stage: "linting", percent: 40, message: "Scanning shots" });
	const shots = flattenShots(chunks);
	const findings = lintScripts({ catalogued, shots });

	// Human-friendly report to stderr so --json stays clean.
	if (findings.length === 0) {
		console.error(
			`[lint] ${shots.length} shot(s) scanned — no missing character references`
		);
	} else {
		console.error(
			`[lint] ${findings.length}/${shots.length} shot(s) mention catalogued characters not in characters[]:`
		);
		for (const f of findings) {
			console.error(
				`  ${f.shot_id}: missing [${f.missing.join(", ")}] · listed [${f.listed.join(", ") || "—"}]`
			);
		}
	}

	const autoFix = Boolean(options.autoFix);
	let applied = 0;
	if (autoFix && findings.length > 0) {
		onProgress({ stage: "fixing", percent: 70, message: "Applying auto-fix" });
		// Group findings by chunk by re-scanning each chunk's shots.
		for (const chunk of chunks) {
			const chunkShots = flattenShots([chunk]);
			const chunkFindings = findings.filter((f) =>
				chunkShots.some((s) => s.shot_id === f.shot_id)
			);
			if (chunkFindings.length === 0) continue;
			// Mutate the raw chunk in place by matching shot_ids.
			const findingMap = new Map(chunkFindings.map((f) => [f.shot_id, f]));
			const scenes = Array.isArray(chunk.data.scenes) ? chunk.data.scenes : [];
			for (const scene of scenes) {
				const rawShots = Array.isArray(scene?.shots) ? scene.shots : [];
				for (const shot of rawShots) {
					if (typeof shot?.shot_id !== "string") continue;
					const f = findingMap.get(shot.shot_id);
					if (!f) continue;
					const listed = Array.isArray(shot.characters)
						? (shot.characters.filter(
								(c): c is string => typeof c === "string"
							) as string[])
						: [];
					const seen = new Set(listed);
					for (const name of f.missing) {
						if (!seen.has(name)) {
							listed.push(name);
							seen.add(name);
							applied++;
						}
					}
					shot.characters = listed;
				}
			}
			// Write-through with a timestamped backup so a bad auto-fix is
			// reversible.
			const chunkPath = path.join(paths.scriptsDir, chunk.file);
			const backup = `${chunkPath}.bak.${Date.now()}`;
			fs.copyFileSync(chunkPath, backup);
			fs.writeFileSync(
				chunkPath,
				`${JSON.stringify(chunk.data, null, 2)}\n`,
				"utf-8"
			);
			console.error(
				`  [auto-fix] ${chunk.file} rewritten (backup: ${path.basename(backup)})`
			);
		}
	}

	onProgress({ stage: "complete", percent: 100, message: "Done" });

	return {
		success: true,
		data: {
			project: slug,
			scanned: shots.length,
			findings,
			auto_fix_applied: applied,
		},
	};
}

// Re-export so the rest of the codebase can grab the pure helpers from a
// single module entry.
export { lintScripts, applyLintAutoFix };
export type { LintFinding, LintShot };

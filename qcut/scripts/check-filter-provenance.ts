/**
 * Filter Provenance Check (FLP-008)
 *
 * QCut's interop features may DISCOVER and USE the user's locally installed
 * Jianying/CapCut runtime (draft export, font preflight, the filter-lab
 * oracle). What they must never do is REDISTRIBUTE it: no private runtime
 * binary, segmentation model, effect package, or cache database may be
 * tracked in this repository or packed into a shipped build.
 *
 * Two static checks, no content heuristics (per FLP-008 停止条件):
 *
 * 1. Tracked-artifact check — `git ls-files` must contain no file whose
 *    path matches a known private-artifact pattern (model files, private
 *    dylibs, effect caches).
 * 2. Build-manifest check — electron-builder `files` / `extraResources` in
 *    package.json must not reference research or private-runtime locations.
 *
 * Usage:
 *   bun scripts/check-filter-provenance.ts
 *
 * See docs/task/jianying-filter-runtime-research/filter-parity-long-tail-plan.zh.md (FLP-008)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const __dir = import.meta.dirname ?? import.meta.dir;
const ROOT = resolve(__dir, "..");

export interface ProvenanceViolation {
	rule: string;
	subject: string;
	why: string;
	fix: string;
}

interface ArtifactRule {
	rule: string;
	pattern: RegExp;
	why: string;
}

/**
 * Concrete private-artifact patterns. Path-based only: a source file that
 * *mentions* `tt_skin_seg` in a string is research/interop code and legal;
 * a tracked FILE named like a model or private framework is redistribution.
 */
const TRACKED_ARTIFACT_RULES: ArtifactRule[] = [
	{
		rule: "no-private-framework-binary",
		pattern:
			/(?:^|\/)(?:libcccreator|libbytenn|libeffect[a-z-]*|libamazing[a-z-]*|libAGFX)[^/]*\.(?:dylib|so|dll)$/i,
		why: "A private Jianying framework binary is tracked in the repository.",
	},
	{
		rule: "no-segmentation-model-file",
		pattern:
			/(?:^|\/)(?:tt_skin_seg|tt_face|tt_matting)[^/]*$|\.(?:mlmodel|mlmodelc|bytenn|bnnmodel)(?:$|\/)/i,
		why: "A private segmentation/face model file is tracked in the repository.",
	},
	{
		rule: "no-effect-package-payload",
		pattern: /(?:^|\/)artistEffect\/|(?:^|\/)(?:rp|rp_master)\.db$/,
		why: "A Jianying effect package or cache database is tracked in the repository.",
	},
	{
		rule: "no-private-runtime-copy",
		pattern: /(?:^|\/)\.local\/jianying-runtime\//,
		why: "A copy of the private Jianying runtime is tracked in the repository.",
	},
];

/** Locations a shipped build may draw resources from. */
const FORBIDDEN_MANIFEST_PATTERNS: ArtifactRule[] = [
	{
		rule: "no-research-in-build",
		pattern: /(?:^|[!/])research\//,
		why: "The build manifest packs the research tree into the app.",
	},
	{
		rule: "no-private-runtime-in-build",
		pattern: /\.local\//,
		why: "The build manifest packs a private local runtime into the app.",
	},
];

/** Pure check over the tracked-file list, so tests can inject paths. */
export function checkTrackedPaths(paths: string[]): ProvenanceViolation[] {
	const violations: ProvenanceViolation[] = [];
	for (const path of paths) {
		for (const rule of TRACKED_ARTIFACT_RULES) {
			if (!rule.pattern.test(path)) continue;
			violations.push({
				rule: rule.rule,
				subject: path,
				why: rule.why,
				fix: "Remove the file from git. Research artifacts live outside the repository (external evidence dirs).",
			});
		}
	}
	return violations;
}

/** Pure check over electron-builder manifest entries. */
export function checkBuildManifest(build: {
	files?: unknown[];
	extraResources?: unknown[];
}): ProvenanceViolation[] {
	const violations: ProvenanceViolation[] = [];
	const entries: string[] = [];
	for (const value of [
		...(build.files ?? []),
		...(build.extraResources ?? []),
	]) {
		if (typeof value === "string") {
			entries.push(value);
		} else if (value && typeof value === "object") {
			const record = value as { from?: unknown; to?: unknown };
			if (typeof record.from === "string") entries.push(record.from);
		}
	}
	for (const entry of entries) {
		// Exclusions ("!research/**") keep things OUT of the build; only
		// inclusive entries can smuggle content in.
		if (entry.startsWith("!")) continue;
		for (const rule of FORBIDDEN_MANIFEST_PATTERNS) {
			if (!rule.pattern.test(entry)) continue;
			violations.push({
				rule: rule.rule,
				subject: entry,
				why: rule.why,
				fix: "Ship only QCut-owned resources (resources/, electron/resources/, build/).",
			});
		}
	}
	return violations;
}

function main() {
	// Scan from the Git top level, not the qcut package directory: a private
	// artifact committed outside qcut/ must fail the gate too.
	const gitRoot = execSync("git rev-parse --show-toplevel", {
		encoding: "utf-8",
		cwd: ROOT,
	}).trim();
	const tracked = execSync("git ls-files", { encoding: "utf-8", cwd: gitRoot })
		.trim()
		.split("\n")
		.filter(Boolean);
	const packageJson = JSON.parse(
		readFileSync(resolve(ROOT, "package.json"), "utf-8")
	) as { build?: { files?: unknown[]; extraResources?: unknown[] } };

	const violations = [
		...checkTrackedPaths(tracked),
		...checkBuildManifest(packageJson.build ?? {}),
	];

	if (violations.length === 0) {
		console.log(
			`Filter provenance check passed (${tracked.length} tracked files, build manifest clean).`
		);
		process.exit(0);
	}

	console.error(`\nFilter provenance violations (${violations.length}):\n`);
	for (const violation of violations) {
		console.error(`ERROR [${violation.rule}] ${violation.subject}`);
		console.error(`  Why: ${violation.why}`);
		console.error(`  Fix: ${violation.fix}\n`);
	}
	console.error(
		"Interop may use the user's local Jianying install; the repo and the shipped app may not contain it.\n" +
			"See docs/task/jianying-filter-runtime-research/filter-parity-long-tail-plan.zh.md (FLP-008)\n"
	);
	process.exit(1);
}

if (import.meta.main) {
	main();
}

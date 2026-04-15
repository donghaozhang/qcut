/**
 * Script linter — flags shots whose `description` mentions a catalogued
 * character by name that is NOT included in the shot's `characters[]`
 * array. This catches a common Stage-3 segmenter drift where a character
 * appears in dialogue or narration but isn't bound to the shot, which
 * would cause Stage 4 to render them without portrait/element reference
 * (the shot degrades to a less-consistent t2v path).
 *
 * Pure data in, pure data out — zero IO so it is trivially testable and
 * can be reused both by the CLI (`flow lint-scripts`) and by the Stage 4
 * passive-warning pass inside `video-handler.ts`.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/script-linter
 */

export interface LintShot {
	shot_id: string;
	description?: string;
	characters?: string[];
}

export interface LintFinding {
	shot_id: string;
	/** Characters mentioned in description but not in shot.characters[]. */
	missing: string[];
	/** Characters already listed in the shot (for context). */
	listed: string[];
}

/**
 * Scan each shot's `description` for catalogued character names not
 * already in `shot.characters[]`. Returns findings only for shots with
 * at least one missing name. Shots with no issues are omitted.
 */
export function lintScripts(args: {
	catalogued: string[];
	shots: LintShot[];
}): LintFinding[] {
	const { catalogued, shots } = args;
	if (!Array.isArray(catalogued) || catalogued.length === 0) return [];

	// Sort by length descending so longer names win over shorter prefixes
	// (e.g. `沈念安` matches before `沈念`). Empty/whitespace names are
	// excluded as they'd match everywhere.
	const names = catalogued
		.filter((n) => typeof n === "string" && n.trim().length > 0)
		.sort((a, b) => b.length - a.length);

	const findings: LintFinding[] = [];

	for (const shot of shots) {
		const description = shot.description ?? "";
		if (description.length === 0) continue;
		const listed = new Set(shot.characters ?? []);
		const missing: string[] = [];
		for (const name of names) {
			if (listed.has(name)) continue;
			if (description.includes(name) && !missing.includes(name)) {
				missing.push(name);
			}
		}
		if (missing.length > 0) {
			findings.push({
				shot_id: shot.shot_id,
				missing,
				listed: Array.from(listed),
			});
		}
	}

	return findings;
}

/**
 * Apply auto-fix: append each shot's `missing` to its `characters[]` in
 * place. Returns the updated shot list (mutated) and the number of
 * characters added. Keeps the original order; appended names go at the
 * end.
 */
export function applyLintAutoFix(
	shots: LintShot[],
	findings: LintFinding[]
): { added: number } {
	let added = 0;
	const byId = new Map<string, LintShot>();
	for (const s of shots) byId.set(s.shot_id, s);
	for (const f of findings) {
		const shot = byId.get(f.shot_id);
		if (!shot) continue;
		const chars = shot.characters ?? [];
		const seen = new Set(chars);
		for (const name of f.missing) {
			if (!seen.has(name)) {
				chars.push(name);
				seen.add(name);
				added++;
			}
		}
		shot.characters = chars;
	}
	return { added };
}

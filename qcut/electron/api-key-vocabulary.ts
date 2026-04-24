/**
 * Centralised API-key vocabulary for QCut.
 *
 * Owns the field ↔ env-var-name mappings that consumers (save handler,
 * pipeline spawn env, migration routine) use to talk about the same set of
 * keys in one place.
 *
 * ## Why this module exists
 *
 * Historically, three locations each carried a copy of the key vocabulary:
 *
 *   - `api-key-handler.ts` had `AICP_REVERSE_MAP` (AICP-vocab: 3 keys) and
 *     `QCUT_ENV_MAP` (full native-CLI vocab: 8 keys).
 *   - `ai-pipeline-handler/command-builder.ts` hard-coded a subset in
 *     `buildSpawnEnvironment()`.
 *   - Tests and future migration code would have drifted a third copy.
 *
 * Collapsing them here keeps adding a new provider to a single-file edit
 * and prevents the injection env from silently diverging from what the
 * GUI save handler writes.
 *
 * See `docs/task/api-keys-precedence-ux/ONE-ENV-FILE-IMPLEMENTATION.md`
 * ST-2 for the audit-driven rationale.
 *
 * @module electron/api-key-vocabulary
 */

/**
 * Shape of the key set QCut's GUI manages. Every entry here corresponds to a
 * field in the Save API Keys form and to exactly one env-var name per target
 * (AICP or native-CLI).
 */
export interface ApiKeys {
	falApiKey: string;
	freesoundApiKey: string;
	geminiApiKey: string;
	openRouterApiKey: string;
	anthropicApiKey: string;
	elevenLabsApiKey: string;
	gmiApiKey: string;
	runwayApiKey: string;
}

/** The canonical set of QCut-managed fields, in the order the GUI displays them. */
export const API_KEY_FIELDS = [
	"falApiKey",
	"freesoundApiKey",
	"geminiApiKey",
	"openRouterApiKey",
	"anthropicApiKey",
	"elevenLabsApiKey",
	"gmiApiKey",
	"runwayApiKey",
] as const satisfies ReadonlyArray<keyof ApiKeys>;

export type ApiKeyField = (typeof API_KEY_FIELDS)[number];

/**
 * Field → env-var-name for the full native-CLI vocabulary (`~/.qcut/.env`).
 *
 * Adding a new provider: add the field to `ApiKeys`, append to
 * `API_KEY_FIELDS`, add the env-name here. Tests in
 * `electron/__tests__/command-builder-env.test.ts` verify the mapping is
 * consumed end-to-end.
 */
export const QCUT_ENV_MAP = {
	falApiKey: "FAL_KEY",
	freesoundApiKey: "FREESOUND_API_KEY",
	geminiApiKey: "GEMINI_API_KEY",
	openRouterApiKey: "OPENROUTER_API_KEY",
	anthropicApiKey: "ANTHROPIC_API_KEY",
	elevenLabsApiKey: "ELEVENLABS_API_KEY",
	gmiApiKey: "GMI_API_KEY",
	runwayApiKey: "RUNWAY_API_KEY",
} as const satisfies Record<ApiKeyField, string>;

/**
 * Field → env-var-name for the subset AICP's Python binary understands.
 *
 * AICP's credential file historically owns only these three keys — see
 * `resources/default-skills/ai-content-pipeline/Skill.md`. Everything else
 * is a native-CLI-only concern.
 */
export const AICP_ENV_MAP = {
	falApiKey: "FAL_KEY",
	geminiApiKey: "GEMINI_API_KEY",
	openRouterApiKey: "OPENROUTER_API_KEY",
} as const satisfies Partial<Record<ApiKeyField, string>>;

/** Reverse of QCUT_ENV_MAP — env-var-name → field, for reading env files. */
export const QCUT_ENV_READ_MAP: Record<string, ApiKeyField> =
	Object.fromEntries(
		Object.entries(QCUT_ENV_MAP).map(([field, envName]) => [
			envName,
			field as ApiKeyField,
		])
	) as Record<string, ApiKeyField>;

/** Reverse of AICP_ENV_MAP — env-var-name → field, for reading AICP credentials. */
export const AICP_ENV_READ_MAP: Record<string, ApiKeyField> =
	Object.fromEntries(
		Object.entries(AICP_ENV_MAP).map(([field, envName]) => [
			envName,
			field as ApiKeyField,
		])
	) as Record<string, ApiKeyField>;

/**
 * Sibling env vars that should be set alongside the canonical one when a
 * value is injected into a spawned process's environment. FAL historically
 * supported both `FAL_KEY` and `FAL_API_KEY`; keep both populated so
 * downstream binaries read whichever they check first.
 */
export const SPAWN_ENV_SIBLINGS: Readonly<Record<string, readonly string[]>> = {
	FAL_KEY: ["FAL_API_KEY"],
};

/**
 * Return the set of env-var names AICP's Python binary recognises. Used by
 * the ST-3 migration routine to decide which keys to copy from the legacy
 * `credentials.env` into `~/.qcut/.env` and by any future wrapper that
 * needs to know the AICP subset without re-deriving it.
 */
export function getAicpKeyNames(): readonly string[] {
	return Object.values(AICP_ENV_MAP);
}

/**
 * Return all env-var names QCut's GUI manages — the complete vocabulary that
 * `buildSpawnEnvironment` uses to populate child-process env.
 */
export function getQcutEnvKeyNames(): readonly string[] {
	return Object.values(QCUT_ENV_MAP);
}

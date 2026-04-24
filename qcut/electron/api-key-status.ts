/**
 * Precedence for API key sources. Highest-priority tier wins.
 *
 * ⚠ Mirrored in `packages/platform-core/src/types/core-api.ts` and
 * `electron/preload-types/supporting-types.ts`. Electron's tsconfig uses
 * `rootDir: "."` + `moduleResolution: "node"` and can't resolve workspace
 * subpath exports, so the constant lives here and is duplicated out —
 * a convention documented elsewhere in electron/ (see
 * `electron/native-pipeline/subtitle/subtitle-types.ts` header). Any
 * reorder or new tier MUST land in all three copies together — the
 * snapshot assertion in `electron/__tests__/api-key-status.test.ts`
 * catches ordering drift.
 *
 * As of the ONE-ENV-FILE migration, the two file-based tiers collapsed
 * into a single `file` tier — `~/.qcut/.env` is the canonical store and
 * AICP's credentials.env is read through the same loader for backwards
 * compatibility during the beta window. See
 * `docs/task/api-keys-precedence-ux/ONE-ENV-FILE-IMPLEMENTATION.md` ST-4.
 */
export const KEY_SOURCE_PRECEDENCE = [
	"environment",
	"electron",
	"file",
] as const;

export type KeySource = (typeof KEY_SOURCE_PRECEDENCE)[number];
export type KeyStatusSource = KeySource | "not-set";

export interface KeyPresence {
	env: boolean;
	electron: boolean;
	file: boolean;
}

export interface KeyStatus {
	set: boolean;
	source: KeyStatusSource;
	shadowedBy: KeySource[];
}

export function computeKeyStatus({
	env,
	electron,
	file,
}: KeyPresence): KeyStatus {
	const presenceBySource = {
		environment: env,
		electron,
		file,
	} satisfies Record<KeySource, boolean>;

	const source = KEY_SOURCE_PRECEDENCE.find(
		(keySource) => presenceBySource[keySource]
	);

	if (!source) {
		return { set: false, source: "not-set", shadowedBy: [] };
	}

	const sourceIndex = KEY_SOURCE_PRECEDENCE.indexOf(source);
	const shadowedBy = KEY_SOURCE_PRECEDENCE.slice(sourceIndex + 1).filter(
		(keySource) => presenceBySource[keySource]
	);

	return { set: true, source, shadowedBy };
}

/**
 * Canvas ratio catalog for the CLI (mirrors @qcut/editor-core/canvas-presets).
 *
 * The electron build cannot import from packages/ at runtime, so the catalog
 * is duplicated here; electron/__tests__/canvas-presets-mirror.test.ts fails
 * the moment the two copies drift.
 *
 * @module electron/native-pipeline/editor/canvas-presets
 */

export interface CanvasPresetMirror {
	name: string;
	nameKey?: string;
	width: number;
	height: number;
	group?: "landscape" | "portrait";
	badgeKey?: string;
	aliases?: string[];
}

export const DEFAULT_CANVAS_PRESETS: readonly CanvasPresetMirror[] = [
	{
		badgeKey: "editor.preview.ratioBadgeXigua",
		group: "landscape",
		height: 1080,
		name: "16:9",
		width: 1920,
	},
	{ group: "landscape", height: 1080, name: "4:3", width: 1440 },
	{ group: "landscape", height: 816, name: "2.35:1", width: 1920 },
	{ group: "landscape", height: 960, name: "2:1", width: 1920 },
	{ group: "landscape", height: 1038, name: "1.85:1", width: 1920 },
	{
		badgeKey: "editor.preview.ratioBadgeDouyin",
		group: "portrait",
		height: 1920,
		name: "9:16",
		width: 1080,
	},
	{ group: "portrait", height: 1440, name: "3:4", width: 1080 },
	{
		aliases: ["5.8寸", "5.8-inch", "5.8inch", "5.8"],
		group: "portrait",
		height: 2340,
		name: "9:19.5",
		nameKey: "editor.preview.ratio58Inch",
		width: 1080,
	},
	{ group: "portrait", height: 1080, name: "1:1", width: 1080 },
	{ group: "portrait", height: 2160, name: "1:2", width: 1080 },
];

/** Names accepted by `--ratio`, with aliases folded in for help text. */
export const CANVAS_PRESET_NAMES: readonly string[] =
	DEFAULT_CANVAS_PRESETS.map((preset) =>
		preset.aliases?.length
			? `${preset.name} (${preset.aliases[0]})`
			: preset.name
	);

function normalizeCanvasPresetName({ name }: { name: string }): string {
	return name.trim().toLowerCase().replace(/：/g, ":").replace(/\s+/g, "");
}

/** Resolve a preset by its display name or one of its aliases (e.g. 5.8寸). */
export function findCanvasPresetByName({
	name,
	presets = DEFAULT_CANVAS_PRESETS,
}: {
	name: string;
	presets?: readonly CanvasPresetMirror[];
}): CanvasPresetMirror | undefined {
	const wanted = normalizeCanvasPresetName({ name });
	if (!wanted) return undefined;
	return presets.find(
		(preset) =>
			normalizeCanvasPresetName({ name: preset.name }) === wanted ||
			(preset.aliases ?? []).some(
				(alias) => normalizeCanvasPresetName({ name: alias }) === wanted
			)
	);
}

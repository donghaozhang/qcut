import {
	generateUUID,
	MEDIA_PORTRAIT_ADJUSTMENT_KEYS,
	normalizeMediaPortraitAdjustments,
} from "@qcut/editor-core";
import type {
	MediaPortraitAdjustmentKey,
	MediaPortraitAdjustments,
	MediaPortraitFaceTarget,
	MediaPortraitMakeupCategory,
	MediaPortraitMakeupSelection,
	MediaPortraitManualBody,
} from "@/types/timeline";

export const PORTRAIT_PRESET_STORAGE_KEY = "qcut-portrait-presets-v1";
export const PORTRAIT_PRESETS_CHANGED_EVENT = "qcut:portrait-presets-changed";

export type PortraitPresetScope = "face" | "body";

/** Preset payload version, so an import can reject a shape it cannot read. */
export const PORTRAIT_PRESET_EXPORT_VERSION = 1;

export interface SavedPortraitPreset {
	id: string;
	name: string;
	scope: PortraitPresetScope;
	createdAt: string;
	/**
	 * Small data-URL preview of the frame the preset was saved from. Optional
	 * because presets saved before thumbnails, or saved with no preview
	 * available, must keep working.
	 */
	thumbnailDataUrl?: string;
	values: Partial<Record<MediaPortraitAdjustmentKey, number>>;
	faceTarget?: MediaPortraitFaceTarget;
	makeup?: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	>;
	manualBody?: MediaPortraitManualBody;
}

export function portraitAdjustmentKeyScope({
	key,
}: {
	key: MediaPortraitAdjustmentKey;
}): PortraitPresetScope {
	return key.startsWith("body_adjust_") ? "body" : "face";
}

function valuesForScope({
	scope,
	values,
}: {
	scope: PortraitPresetScope;
	values: unknown;
}): SavedPortraitPreset["values"] {
	if (typeof values !== "object" || values === null) return {};
	const source = values as Record<string, unknown>;
	const result: SavedPortraitPreset["values"] = {};
	for (const key of MEDIA_PORTRAIT_ADJUSTMENT_KEYS) {
		if (portraitAdjustmentKeyScope({ key }) !== scope) continue;
		const value = source[key];
		if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
			result[key] = value;
		}
	}
	return result;
}

export function parsePortraitPreset({
	value,
}: {
	value: unknown;
}): SavedPortraitPreset | null {
	if (typeof value !== "object" || value === null) return null;
	const candidate = value as Partial<SavedPortraitPreset>;
	if (
		typeof candidate.id !== "string" ||
		typeof candidate.name !== "string" ||
		typeof candidate.createdAt !== "string" ||
		(candidate.scope !== "face" && candidate.scope !== "body")
	) {
		return null;
	}
	const normalized = normalizeMediaPortraitAdjustments({
		adjustments: {
			enabled: true,
			values: {},
			faceTarget: candidate.faceTarget,
			makeup: candidate.makeup,
			manualBody: candidate.manualBody,
		},
	});
	return {
		id: candidate.id,
		name: candidate.name,
		createdAt: candidate.createdAt,
		scope: candidate.scope,
		...(isPortraitPresetThumbnail(candidate.thumbnailDataUrl)
			? { thumbnailDataUrl: candidate.thumbnailDataUrl }
			: {}),
		values: valuesForScope({
			scope: candidate.scope,
			values: candidate.values,
		}),
		...(candidate.scope === "face" && normalized.faceTarget
			? { faceTarget: normalized.faceTarget }
			: {}),
		...(candidate.scope === "face" && normalized.makeup
			? { makeup: normalized.makeup }
			: {}),
		...(candidate.scope === "body" && normalized.manualBody
			? { manualBody: normalized.manualBody }
			: {}),
	};
}

export function loadPortraitPresets(): SavedPortraitPreset[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem(PORTRAIT_PRESET_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(stored)) return [];
		return stored
			.map((value) => parsePortraitPreset({ value }))
			.filter((preset): preset is SavedPortraitPreset => preset !== null);
	} catch {
		return [];
	}
}

export function persistPortraitPresets({
	presets,
}: {
	presets: SavedPortraitPreset[];
}) {
	localStorage.setItem(PORTRAIT_PRESET_STORAGE_KEY, JSON.stringify(presets));
	window.dispatchEvent(new Event(PORTRAIT_PRESETS_CHANGED_EVENT));
}

export function createPortraitPreset({
	adjustments,
	name,
	scope,
	thumbnailDataUrl,
}: {
	adjustments: MediaPortraitAdjustments;
	name?: string;
	scope: PortraitPresetScope;
	thumbnailDataUrl?: string;
}): SavedPortraitPreset {
	const createdAt = new Date().toISOString();
	return {
		id: `portrait-preset-${generateUUID()}`,
		name:
			name?.trim() ||
			`${scope === "face" ? "美颜" : "美体"}预设 ${new Date(createdAt).toLocaleString()}`,
		scope,
		createdAt,
		...(isPortraitPresetThumbnail(thumbnailDataUrl)
			? { thumbnailDataUrl }
			: {}),
		values: valuesForScope({ scope, values: adjustments.values }),
		...(scope === "face" && adjustments.faceTarget
			? { faceTarget: adjustments.faceTarget }
			: {}),
		...(scope === "face" && adjustments.makeup
			? { makeup: adjustments.makeup }
			: {}),
		...(scope === "body" && adjustments.manualBody
			? { manualBody: adjustments.manualBody }
			: {}),
	};
}

export function hasPortraitPresetContent({
	preset,
}: {
	preset: SavedPortraitPreset;
}) {
	return (
		Object.keys(preset.values).length > 0 ||
		Object.keys(preset.makeup ?? {}).length > 0 ||
		(preset.manualBody?.stretch?.intensity ?? 0) !== 0 ||
		(preset.manualBody?.slim?.intensity ?? 0) !== 0 ||
		(preset.manualBody?.zoom?.intensity ?? 0) !== 0
	);
}

export function applyPortraitPreset({
	adjustments,
	preset,
}: {
	adjustments: MediaPortraitAdjustments;
	preset: SavedPortraitPreset;
}): MediaPortraitAdjustments {
	const values: MediaPortraitAdjustments["values"] = {};
	for (const key of MEDIA_PORTRAIT_ADJUSTMENT_KEYS) {
		if (portraitAdjustmentKeyScope({ key }) === preset.scope) continue;
		const value = adjustments.values[key];
		if (value !== undefined) values[key] = value;
	}
	const mergedValues = { ...values, ...preset.values };
	if (preset.scope === "face") {
		return {
			enabled: true,
			values: mergedValues,
			...(preset.faceTarget ? { faceTarget: preset.faceTarget } : {}),
			...(preset.makeup ? { makeup: preset.makeup } : {}),
			// Presets are per-face-agnostic today; applying one must not delete
			// another writer's per-face adjustment sets.
			...(adjustments.faces ? { faces: adjustments.faces } : {}),
			...(adjustments.manualRetouch
				? { manualRetouch: adjustments.manualRetouch }
				: {}),
			...(adjustments.manualBody ? { manualBody: adjustments.manualBody } : {}),
		};
	}
	return {
		...adjustments,
		enabled: true,
		values: mergedValues,
		...(preset.manualBody ? { manualBody: preset.manualBody } : {}),
	};
}

/**
 * Thumbnails are stored inline, so an untrusted value is bounded on both shape
 * and size — a preset file must not be able to smuggle in a huge or non-image
 * payload that later lands in an `img` tag.
 */
const MAXIMUM_THUMBNAIL_LENGTH = 64_000;

export function isPortraitPresetThumbnail(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= MAXIMUM_THUMBNAIL_LENGTH &&
		/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
	);
}

export function renamePortraitPreset({
	presets,
	id,
	name,
}: {
	presets: SavedPortraitPreset[];
	id: string;
	name: string;
}): SavedPortraitPreset[] {
	const trimmed = name.trim();
	if (!trimmed) return presets;
	return presets.map((preset) =>
		preset.id === id ? { ...preset, name: trimmed } : preset
	);
}

/**
 * Replaces a preset's captured values in place, keeping its id and name so a
 * preset the user already applied elsewhere stays the same preset.
 */
export function overwritePortraitPreset({
	presets,
	id,
	adjustments,
	thumbnailDataUrl,
}: {
	presets: SavedPortraitPreset[];
	id: string;
	adjustments: MediaPortraitAdjustments;
	thumbnailDataUrl?: string;
}): SavedPortraitPreset[] {
	return presets.map((preset) => {
		if (preset.id !== id) return preset;
		const replacement = createPortraitPreset({
			adjustments,
			name: preset.name,
			scope: preset.scope,
			...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
		});
		return {
			...replacement,
			id: preset.id,
			createdAt: preset.createdAt,
			...(replacement.thumbnailDataUrl
				? { thumbnailDataUrl: replacement.thumbnailDataUrl }
				: preset.thumbnailDataUrl
					? { thumbnailDataUrl: preset.thumbnailDataUrl }
					: {}),
		};
	});
}

export interface PortraitPresetExport {
	kind: "qcut-portrait-presets";
	version: number;
	presets: SavedPortraitPreset[];
}

export function serializePortraitPresets({
	presets,
}: {
	presets: SavedPortraitPreset[];
}): string {
	return JSON.stringify(
		{
			kind: "qcut-portrait-presets",
			version: PORTRAIT_PRESET_EXPORT_VERSION,
			presets,
		} satisfies PortraitPresetExport,
		null,
		2
	);
}

/**
 * Reads an exported preset file. Every entry goes through the same parser the
 * stored presets use, so an imported file can never widen what a preset may
 * contain. Ids are regenerated to avoid colliding with existing presets.
 */
export function parsePortraitPresetExport({
	value,
}: {
	value: unknown;
}): SavedPortraitPreset[] {
	if (typeof value !== "object" || value === null) {
		throw new Error("预设文件格式无效");
	}
	const candidate = value as Partial<PortraitPresetExport>;
	if (candidate.kind !== "qcut-portrait-presets") {
		throw new Error("这不是 QCut 美颜预设文件");
	}
	if (candidate.version !== PORTRAIT_PRESET_EXPORT_VERSION) {
		throw new Error("预设文件版本不受支持");
	}
	if (!Array.isArray(candidate.presets)) {
		throw new Error("预设文件缺少预设列表");
	}
	const imported = candidate.presets
		.map((entry) => parsePortraitPreset({ value: entry }))
		.filter((preset): preset is SavedPortraitPreset => preset !== null)
		.map((preset) => ({ ...preset, id: `portrait-preset-${generateUUID()}` }));
	if (imported.length === 0) {
		throw new Error("预设文件里没有可用的预设");
	}
	return imported;
}

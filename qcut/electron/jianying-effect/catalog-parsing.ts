import type {
	JianyingEffectAdjustParameter,
	JianyingEffectPanel,
} from "../jianying-effect-contract.js";

/**
 * Pure catalog parsing, kept free of `node:sqlite` so it can be unit tested —
 * a static import of that builtin cannot be bundled by the test runner.
 */

export interface CatalogRow {
	url: string;
	responseBody: string;
}

export interface CatalogItem {
	effectId: string;
	title: string;
	md5: string;
	resourceId: string;
	panel: JianyingEffectPanel;
	durationMs: number;
	requirements: string[];
	adjustParameters: JianyingEffectAdjustParameter[];
	vip: boolean;
	/** Signed package download URLs from the catalog (may be empty). */
	itemUrls: string[];
}

/** 画面特效 lives in the `effects2` panel, 人物特效 in `face-prop`. */
const EFFECT_PANELS: readonly JianyingEffectPanel[] = ["effects2", "face-prop"];

/**
 * Effects whose requirements go beyond a plain blit need Jianying's CV models
 * (matting, face landmarks) wired to a real frame source, which QCut does not
 * provide yet. They are catalogued but reported unsupported instead of
 * rendering something wrong.
 */
export const SUPPORTED_REQUIREMENTS = new Set(["blit", "texture_blit"]);

const DEFAULT_EFFECT_DURATION_MS = 3000;

function parseJsonObject({ text }: { text: string }): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function readString({
	source,
	key,
}: {
	source: Record<string, unknown>;
	key: string;
}): string {
	const value = source[key];
	return typeof value === "string" ? value : "";
}

/**
 * Slider schema, declared identically in the catalog's `sdk_extra` and the
 * package's `extra.json`. Values are normalized, so a draft's 0..1 value can be
 * handed to the runtime untouched.
 */
export function readAdjustParameters({
	sdkExtra,
}: {
	sdkExtra: string;
}): JianyingEffectAdjustParameter[] {
	const parsed = parseJsonObject({ text: sdkExtra });
	const setting = parsed.setting;
	if (typeof setting !== "object" || setting === null) return [];
	const params = (setting as Record<string, unknown>).effect_adjust_params;
	if (!Array.isArray(params)) return [];

	return params.flatMap((entry): JianyingEffectAdjustParameter[] => {
		if (typeof entry !== "object" || entry === null) return [];
		const record = entry as Record<string, unknown>;
		const key = readString({ source: record, key: "effect_key" });
		if (key.length === 0) return [];
		const defaultValue = record.default;
		const minimum = record.min;
		const maximum = record.max;
		return [
			{
				key,
				defaultValue: typeof defaultValue === "number" ? defaultValue : 0,
				minimum: typeof minimum === "number" ? minimum : 0,
				maximum: typeof maximum === "number" ? maximum : 1,
			},
		];
	});
}

function readDurationMs({
	item,
	extra,
}: {
	item: Record<string, unknown>;
	extra: Record<string, unknown>;
}): number {
	const specialEffect = item.special_effect;
	if (typeof specialEffect === "object" && specialEffect !== null) {
		const duration = (specialEffect as Record<string, unknown>).effect_duration;
		if (typeof duration === "number" && duration > 0) return duration;
	}
	const fallback = extra.effect_duration;
	return typeof fallback === "number" && fallback > 0
		? fallback
		: DEFAULT_EFFECT_DURATION_MS;
}

function readPanel({ url }: { url: string }): JianyingEffectPanel | null {
	return EFFECT_PANELS.find((panel) => url.includes(`_${panel}_`)) ?? null;
}

/**
 * Zip entries that could escape the extraction directory. Checked against the
 * archive listing before unzip runs, because the CLI extractor offers no
 * containment guarantee of its own.
 */
export function findUnsafeZipEntries({
	entries,
}: {
	entries: string[];
}): string[] {
	return entries.filter((entry) => {
		if (entry.startsWith("/") || entry.startsWith("\\")) return true;
		if (/^[A-Za-z]:/.test(entry)) return true;
		return entry.split(/[\\/]/).some((segment) => segment === "..");
	});
}

export function collectCatalogItems({
	rows,
}: {
	rows: CatalogRow[];
}): CatalogItem[] {
	const byEffectId = new Map<string, CatalogItem>();

	for (const row of rows) {
		const panel = readPanel({ url: row.url });
		if (panel === null) continue;

		const body = parseJsonObject({ text: row.responseBody });
		const data = body.data;
		if (typeof data !== "object" || data === null) continue;
		const items = (data as Record<string, unknown>).effect_item_list;
		if (!Array.isArray(items)) continue;

		for (const rawItem of items) {
			if (typeof rawItem !== "object" || rawItem === null) continue;
			const item = rawItem as Record<string, unknown>;
			const common = item.common_attr;
			if (typeof common !== "object" || common === null) continue;
			const attributes = common as Record<string, unknown>;

			const effectId = readString({ source: attributes, key: "effect_id" });
			const md5 = readString({ source: attributes, key: "md5" });
			if (effectId.length === 0 || md5.length === 0) continue;

			const extra = parseJsonObject({
				text: readString({ source: attributes, key: "extra" }),
			});
			const requirements = Array.isArray(attributes.requirements)
				? attributes.requirements.filter(
						(value): value is string => typeof value === "string"
					)
				: [];

			const itemUrls = Array.isArray(attributes.item_urls)
				? attributes.item_urls.filter(
						(value): value is string =>
							typeof value === "string" && value.startsWith("https://")
					)
				: [];

			byEffectId.set(effectId, {
				effectId,
				title: readString({ source: attributes, key: "title" }),
				md5,
				resourceId:
					readString({ source: attributes, key: "third_resource_id_str" }) ||
					effectId,
				panel,
				durationMs: readDurationMs({ item, extra }),
				requirements,
				adjustParameters: readAdjustParameters({
					sdkExtra: readString({ source: attributes, key: "sdk_extra" }),
				}),
				vip: extra.is_vip === true,
				itemUrls,
			});
		}
	}

	return [...byEffectId.values()];
}

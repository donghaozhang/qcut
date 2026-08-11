import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
	JianyingTextStyleCompatibility,
	JianyingTextStyleFillKind,
	JianyingTextStylePackageKind,
	JianyingTextStyleQcutApproximation,
} from "./jianying-text-style-lab-contract.js";
import type { JianyingTextRuntimeReference } from "./jianying-text-runtime-contract.js";
import {
	detectJianyingTextPackageKind,
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
	readJianyingTextTemplateDuration,
} from "./jianying-text-package-metadata.js";
import { jianyingEffectCacheRoot } from "./native-pipeline/filters/filter-lab-lut.js";

const MAXIMUM_PACKAGE_COUNT = 5000;
const MAXIMUM_COVER_BYTES = 8 * 1024 * 1024;
const SCAN_CONCURRENCY = 8;
const APPROXIMATION_FONT_SIZE = 72;
const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface JianyingTextStyleCatalogEntry {
	styleId: string;
	resourceId: string;
	version: string;
	packageKind: JianyingTextStylePackageKind;
	packageVersion: string;
	fillKind: JianyingTextStyleFillKind;
	strokeCount: number;
	innerShadowCount: number;
	shadowCount: number;
	textureLayerCount: number;
	hasCover: boolean;
	compatibility: JianyingTextStyleCompatibility;
	approximation?: JianyingTextStyleQcutApproximation;
	runtimeReference?: JianyingTextRuntimeReference;
	coverPath?: string;
}

export interface JianyingTextStyleCatalog {
	entries: JianyingTextStyleCatalogEntry[];
	packageCount: number;
	invalidPackageCount: number;
}

export interface BuildJianyingTextStyleCatalogOptions {
	root?: string;
}

type ScannedPackage =
	| { kind: "valid"; entry: JianyingTextStyleCatalogEntry }
	| { kind: "skip" }
	| { kind: "invalid" };

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function parseFillKind({
	value,
}: {
	value: unknown;
}): JianyingTextStyleFillKind {
	return value === "solid" || value === "gradient" || value === "texture"
		? value
		: "unknown";
}

function contentForLayer({ layer }: { layer: unknown }) {
	return asRecord(asRecord(layer)?.content);
}

function getLayerKind({ layer }: { layer: unknown }) {
	return parseFillKind({ value: contentForLayer({ layer })?.render_type });
}

function isEnabledLayer({ layer }: { layer: unknown }) {
	return asRecord(layer)?.enable !== false;
}

function countEnabledLayers({ value }: { value: unknown }) {
	return Array.isArray(value)
		? value.filter((layer) => isEnabledLayer({ layer })).length
		: 0;
}

function countRenderType({
	value,
	target,
}: {
	value: unknown;
	target: string;
}): number {
	if (Array.isArray(value)) {
		return value.reduce(
			(total, entry) => total + countRenderType({ value: entry, target }),
			0
		);
	}
	const record = asRecord(value);
	if (!record) return 0;
	const current = record.render_type === target ? 1 : 0;
	return Object.values(record).reduce<number>(
		(total, entry) => total + countRenderType({ value: entry, target }),
		current
	);
}

function normalizedColorToHex({ value }: { value: unknown }): string | null {
	if (!(Array.isArray(value) && value.length >= 3)) return null;
	const channels = value.slice(0, 3).map(asFiniteNumber);
	if (channels.some((channel) => channel === null)) return null;
	return `#${channels
		.map((channel) =>
			Math.round(clamp({ value: channel ?? 0, min: 0, max: 1 }) * 255)
				.toString(16)
				.padStart(2, "0")
		)
		.join("")}`;
}

function colorFromContent({
	content,
}: {
	content: Record<string, unknown> | null;
}) {
	if (!content) return null;
	const kind = parseFillKind({ value: content.render_type });
	if (kind === "solid") {
		return normalizedColorToHex({ value: asRecord(content.solid)?.color });
	}
	if (kind === "gradient") {
		const colors = asRecord(content.gradient)?.color;
		return Array.isArray(colors)
			? normalizedColorToHex({ value: colors[0] })
			: null;
	}
	return null;
}

function layerOpacity({ layer }: { layer: unknown }) {
	const record = asRecord(layer);
	const content = contentForLayer({ layer });
	const kind = parseFillKind({ value: content?.render_type });
	const source = kind === "gradient" ? content?.gradient : content?.solid;
	const layerAlpha = asFiniteNumber(record?.alpha) ?? 1;
	const contentAlpha = asFiniteNumber(asRecord(source)?.alpha) ?? 1;
	return clamp({ value: layerAlpha * contentAlpha, min: 0, max: 1 });
}

function enabledLayers({ value }: { value: unknown }) {
	return Array.isArray(value)
		? value.filter((layer) => isEnabledLayer({ layer }))
		: [];
}

function widestSolidStroke({ value }: { value: unknown }) {
	return enabledLayers({ value })
		.filter((layer) => getLayerKind({ layer }) === "solid")
		.map((layer) => ({
			layer,
			width: asFiniteNumber(asRecord(layer)?.width) ?? 0,
		}))
		.sort((left, right) => right.width - left.width)[0];
}

function farthestSolidShadow({ value }: { value: unknown }) {
	return enabledLayers({ value })
		.filter((layer) => getLayerKind({ layer }) === "solid")
		.map((layer) => ({
			layer,
			distance: Math.max(0, asFiniteNumber(asRecord(layer)?.distance) ?? 0),
		}))
		.sort((left, right) => right.distance - left.distance)[0];
}

function zeroDistanceSolidShadow({ value }: { value: unknown }) {
	return enabledLayers({ value }).find(
		(layer) =>
			getLayerKind({ layer }) === "solid" &&
			Math.abs(asFiniteNumber(asRecord(layer)?.distance) ?? 0) < 0.1
	);
}

function createApproximation({ style }: { style: Record<string, unknown> }) {
	const fill = asRecord(style.fill);
	const color = colorFromContent({ content: contentForLayer({ layer: fill }) });
	if (!color) return undefined;
	const stroke = widestSolidStroke({ value: style.strokes });
	const shadow = farthestSolidShadow({ value: style.shadows });
	const glow = zeroDistanceSolidShadow({ value: style.shadows });
	const strokeColor = stroke
		? colorFromContent({ content: contentForLayer({ layer: stroke.layer }) })
		: null;
	const shadowColor = shadow
		? colorFromContent({ content: contentForLayer({ layer: shadow.layer }) })
		: null;
	const glowColor = glow
		? colorFromContent({ content: contentForLayer({ layer: glow }) })
		: null;
	const angle = asFiniteNumber(asRecord(shadow?.layer)?.angle) ?? -45;
	const angleRadians = (angle * Math.PI) / 180;
	const shadowDistance = shadow?.distance ?? 0;
	const diffuse = asFiniteNumber(asRecord(shadow?.layer)?.diffuse) ?? 0;
	return {
		version: 1,
		color,
		strokeColor: strokeColor ?? "#000000",
		strokeWidth: clamp({
			value: (stroke?.width ?? 0) * APPROXIMATION_FONT_SIZE,
			min: 0,
			max: 16,
		}),
		strokeOpacity: stroke ? layerOpacity({ layer: stroke.layer }) : 0,
		shadowColor: shadowColor ?? "#000000",
		shadowOpacity: shadow ? layerOpacity({ layer: shadow.layer }) : 0,
		shadowOffsetX: Math.cos(angleRadians) * shadowDistance,
		shadowOffsetY: -Math.sin(angleRadians) * shadowDistance,
		shadowBlur: clamp({
			value: diffuse * APPROXIMATION_FONT_SIZE,
			min: 0,
			max: 40,
		}),
		glowColor: glowColor ?? "#ffffff",
		glowOpacity: glow ? layerOpacity({ layer: glow }) : 0,
		glowBlur: glow
			? clamp({
					value:
						(asFiniteNumber(asRecord(glow)?.diffuse) ?? 0.08) *
						APPROXIMATION_FONT_SIZE,
					min: 4,
					max: 40,
				})
			: 12,
	} satisfies JianyingTextStyleQcutApproximation;
}

function classifyCompatibility({
	fillKind,
	strokeCount,
	innerShadowCount,
	shadowCount,
	textureLayerCount,
	gradientLayerCount,
	approximation,
}: {
	fillKind: JianyingTextStyleFillKind;
	strokeCount: number;
	innerShadowCount: number;
	shadowCount: number;
	textureLayerCount: number;
	gradientLayerCount: number;
	approximation?: JianyingTextStyleQcutApproximation;
}): JianyingTextStyleCompatibility {
	if (!approximation || fillKind === "texture") return "preview-only";
	if (
		fillKind === "solid" &&
		strokeCount <= 1 &&
		innerShadowCount === 0 &&
		shadowCount <= 1 &&
		textureLayerCount === 0 &&
		gradientLayerCount === 0
	) {
		return "flat-compatible";
	}
	return "approximated";
}

export function createJianyingTextStyleId({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	return `${resourceId}/${version}`;
}

export function isValidJianyingTextStyleId({ styleId }: { styleId: string }) {
	const [resourceId, version, extra] = styleId.split("/");
	return (
		extra === undefined &&
		JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId ?? "") &&
		JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(version ?? "")
	);
}

async function hasValidCover({ coverPath }: { coverPath: string }) {
	try {
		const fileStats = await stat(coverPath);
		return (
			fileStats.isFile() &&
			fileStats.size > 0 &&
			fileStats.size <= MAXIMUM_COVER_BYTES
		);
	} catch {
		return false;
	}
}

async function scanPackage({
	packagePath,
	resourceId,
	version,
}: {
	packagePath: string;
	resourceId: string;
	version: string;
}): Promise<ScannedPackage> {
	let config: unknown;
	try {
		config = await readBoundedJianyingTextJson({
			filePath: join(packagePath, "config.json"),
		});
	} catch {
		return { kind: "skip" };
	}
	const packageKind = detectJianyingTextPackageKind({ config });
	const coverPath = join(packagePath, "cover_icon.png");
	const hasCover = await hasValidCover({ coverPath });
	if (
		packageKind === "InfoSticker" ||
		packageKind === "ScriptInfoSticker"
	) {
		try {
			const templateDuration = await readJianyingTextTemplateDuration({
				packagePath,
				packageKind,
			});
			return {
				kind: "valid",
				entry: {
					styleId: createJianyingTextStyleId({ resourceId, version }),
					resourceId,
					version,
					packageKind,
					packageVersion: "runtime",
					fillKind: "unknown",
					strokeCount: 0,
					innerShadowCount: 0,
					shadowCount: 0,
					textureLayerCount: 0,
					hasCover,
					compatibility: "native-runtime",
					runtimeReference: {
						schemaVersion: 1,
						source: "jianying-cache",
						packageKind,
						resourceId,
						packageHash: version,
						editMode: "runtime-with-preload-fallback",
						slotMapping: "line-to-widget",
						timeMapping: "stretch",
						templateDuration,
					},
					...(hasCover ? { coverPath } : {}),
				},
			};
		} catch {
			return { kind: "invalid" };
		}
	}
	if (packageKind !== "TextStyle") {
		return {
			kind: "valid",
			entry: {
				styleId: createJianyingTextStyleId({ resourceId, version }),
				resourceId,
				version,
				packageKind,
				packageVersion: "runtime",
				fillKind: "unknown",
				strokeCount: 0,
				innerShadowCount: 0,
				shadowCount: 0,
				textureLayerCount: 0,
				hasCover,
				compatibility: "preview-only",
				...(hasCover ? { coverPath } : {}),
			},
		};
	}

	try {
		const styleValue = await readBoundedJianyingTextJson({
			filePath: join(packagePath, "effectStyle.json"),
		});
		const style = asRecord(styleValue);
		if (!style) return { kind: "invalid" };
		const fillKind = getLayerKind({ layer: style.fill });
		const strokeCount = countEnabledLayers({ value: style.strokes });
		const innerShadowCount = countEnabledLayers({ value: style.inner_shadows });
		const shadowCount = countEnabledLayers({ value: style.shadows });
		const textureLayerCount = countRenderType({
			value: style,
			target: "texture",
		});
		const gradientLayerCount = countRenderType({
			value: style,
			target: "gradient",
		});
		const approximation = createApproximation({ style });
		return {
			kind: "valid",
			entry: {
				styleId: createJianyingTextStyleId({ resourceId, version }),
				resourceId,
				version,
				packageKind,
				packageVersion:
					typeof style.version === "string" ? style.version : "unknown",
				fillKind,
				strokeCount,
				innerShadowCount,
				shadowCount,
				textureLayerCount,
				hasCover,
				compatibility: classifyCompatibility({
					fillKind,
					strokeCount,
					innerShadowCount,
					shadowCount,
					textureLayerCount,
					gradientLayerCount,
					approximation,
				}),
				...(approximation ? { approximation } : {}),
				...(hasCover ? { coverPath } : {}),
			},
		};
	} catch {
		return { kind: "invalid" };
	}
}

async function listPackageCandidates({ root }: { root: string }) {
	const resourceDirectories = await readdir(root, {
		withFileTypes: true,
	}).catch(() => []);
	const candidates: {
		packagePath: string;
		resourceId: string;
		version: string;
	}[] = [];
	for (const resourceDirectory of resourceDirectories) {
		if (
			!resourceDirectory.isDirectory() ||
			!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceDirectory.name)
		) {
			continue;
		}
		const resourcePath = join(root, resourceDirectory.name);
		const versionDirectories = await readdir(resourcePath, {
			withFileTypes: true,
		}).catch(() => []);
		for (const versionDirectory of versionDirectories) {
			if (
				!versionDirectory.isDirectory() ||
				!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(versionDirectory.name)
			) {
				continue;
			}
			candidates.push({
				packagePath: join(resourcePath, versionDirectory.name),
				resourceId: resourceDirectory.name,
				version: versionDirectory.name,
			});
			if (candidates.length >= MAXIMUM_PACKAGE_COUNT) return candidates;
		}
	}
	return candidates;
}

async function mapWithConcurrency<TItem, TResult>({
	items,
	mapper,
	limit,
}: {
	items: TItem[];
	mapper: ({ item }: { item: TItem }) => Promise<TResult>;
	limit: number;
}) {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		results[index] = await mapper({ item: items[index] });
		await runNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, () => runNext())
	);
	return results;
}

export async function buildJianyingTextStyleCatalog({
	root = jianyingEffectCacheRoot(),
}: BuildJianyingTextStyleCatalogOptions = {}): Promise<JianyingTextStyleCatalog> {
	const candidates = await listPackageCandidates({ root });
	const scanned = await mapWithConcurrency({
		items: candidates,
		limit: SCAN_CONCURRENCY,
		mapper: ({ item }) => scanPackage(item),
	});
	const entries = scanned
		.flatMap((result) => (result.kind === "valid" ? [result.entry] : []))
		.sort((left, right) => left.styleId.localeCompare(right.styleId));
	return {
		entries,
		packageCount: candidates.length,
		invalidPackageCount: scanned.filter(({ kind }) => kind === "invalid")
			.length,
	};
}

export async function readJianyingTextStyleCover({
	entry,
}: {
	entry: JianyingTextStyleCatalogEntry;
}) {
	if (!entry.coverPath) throw new Error("本机花字缓存没有缩略图");
	const fileStats = await stat(entry.coverPath);
	if (!(fileStats.isFile() && fileStats.size > 0)) {
		throw new Error("本机花字缩略图已经消失");
	}
	if (fileStats.size > MAXIMUM_COVER_BYTES) {
		throw new Error("本机花字缩略图过大");
	}
	const bytes = await readFile(entry.coverPath);
	if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
		throw new Error("本机花字缩略图格式无效");
	}
	return bytes;
}

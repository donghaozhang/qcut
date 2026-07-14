import { assetManifestVersionKey, type AssetFileRole } from "@qcut/editor-core";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type {
	AssetResourceCacheStorage,
	ResolvedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import { ensureAssetResources } from "@/lib/assets/asset-resource-cache";
import { resolveTextTemplateAssetEntry } from "@/lib/assets/qcut-asset-manifest";
import type { CreateTextElement, TextElement } from "@/types/timeline";
import { DEFAULT_TEXT_ASSET_REMOTE_BASE_URL } from "./text-resource-catalog";
import {
	buildTextTemplate,
	type TextTemplateDefinition,
} from "./text-template-registry";
import {
	buildTextTemplatePackCopySlots,
	type TextTemplatePackCopySlot,
	type TextTemplatePackPayload,
} from "./text-template-packs";

export interface DownloadedTextTemplateResource {
	cacheKey: string;
	cacheHitCount: number;
	cachedBytes: number;
	cachedFileCount: number;
	files: DownloadedTextTemplateResourceFile[];
	packageUrl?: string;
	sourceUrl?: string;
	thumbnailUrl?: string;
}

export interface DownloadedTextTemplateResourceFile {
	byteSize?: number;
	cacheKey: string;
	checksumSha256?: string;
	fromCache: boolean;
	mimeType?: string;
	role: AssetFileRole;
	sourceUrl: string;
	url: string;
}

export interface TextTemplatePackageSource {
	assetId: string;
	cacheKey: string;
	packageId: string;
	resources: TextTemplatePackageResourceFile[];
	template: Partial<TextElement>;
	templatePack?: TextTemplatePackagePackSource;
	version: number;
}

export interface TextTemplatePackageResourceFile {
	byteSize: number;
	checksumSha256: string;
	mimeType: string;
	path: string;
	role: Extract<AssetFileRole, "source" | "thumbnail">;
	url: string;
}

export interface TextTemplatePackagePackSource {
	category: string;
	copySlots?: TextTemplatePackCopySlot[];
	elements: Partial<TextElement>[];
	id: string;
	name: string;
}

export type ResolvedTextTemplatePack = TextTemplatePackPayload;

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringValue({
	record,
	key,
}: {
	key: string;
	record: Record<string, unknown>;
}) {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberValue({
	record,
	key,
}: {
	key: string;
	record: Record<string, unknown>;
}) {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function parseTextAlign({
	value,
}: {
	value: unknown;
}): TextElement["textAlign"] | undefined {
	return value === "left" || value === "center" || value === "right"
		? value
		: undefined;
}

function parseFontWeight({
	value,
}: {
	value: unknown;
}): TextElement["fontWeight"] | undefined {
	return value === "normal" || value === "bold" ? value : undefined;
}

function parseFontStyle({
	value,
}: {
	value: unknown;
}): TextElement["fontStyle"] | undefined {
	return value === "normal" || value === "italic" ? value : undefined;
}

function parseTextDecoration({
	value,
}: {
	value: unknown;
}): TextElement["textDecoration"] | undefined {
	return value === "none" || value === "underline" || value === "line-through"
		? value
		: undefined;
}

function parseTextTemplate({
	value,
}: {
	value: unknown;
}): Partial<TextElement> | null {
	const record = asRecord({ value });
	if (!record || record.type !== "text") return null;
	const id = stringValue({ record, key: "id" });
	const name = stringValue({ record, key: "name" });
	const content = stringValue({ record, key: "content" });
	if (!id || !name || !content) return null;
	return {
		id,
		type: "text",
		name,
		content,
		fontSize: numberValue({ record, key: "fontSize" }),
		fontFamily: stringValue({ record, key: "fontFamily" }),
		color: stringValue({ record, key: "color" }),
		backgroundColor: stringValue({ record, key: "backgroundColor" }),
		textAlign: parseTextAlign({ value: record.textAlign }),
		fontWeight: parseFontWeight({ value: record.fontWeight }),
		fontStyle: parseFontStyle({ value: record.fontStyle }),
		textDecoration: parseTextDecoration({ value: record.textDecoration }),
		x: numberValue({ record, key: "x" }),
		y: numberValue({ record, key: "y" }),
		rotation: numberValue({ record, key: "rotation" }),
		opacity: numberValue({ record, key: "opacity" }),
		width: numberValue({ record, key: "width" }),
		height: numberValue({ record, key: "height" }),
		letterSpacing: numberValue({ record, key: "letterSpacing" }),
		lineHeight: numberValue({ record, key: "lineHeight" }),
		strokeColor: stringValue({ record, key: "strokeColor" }),
		strokeWidth: numberValue({ record, key: "strokeWidth" }),
		strokeOpacity: numberValue({ record, key: "strokeOpacity" }),
		backgroundOpacity: numberValue({ record, key: "backgroundOpacity" }),
		backgroundRadius: numberValue({ record, key: "backgroundRadius" }),
		backgroundPadding: numberValue({ record, key: "backgroundPadding" }),
		shadowColor: stringValue({ record, key: "shadowColor" }),
		shadowOpacity: numberValue({ record, key: "shadowOpacity" }),
		shadowOffsetX: numberValue({ record, key: "shadowOffsetX" }),
		shadowOffsetY: numberValue({ record, key: "shadowOffsetY" }),
		shadowBlur: numberValue({ record, key: "shadowBlur" }),
		glowColor: stringValue({ record, key: "glowColor" }),
		glowOpacity: numberValue({ record, key: "glowOpacity" }),
		glowBlur: numberValue({ record, key: "glowBlur" }),
		curve: numberValue({ record, key: "curve" }),
		animationDuration: numberValue({ record, key: "animationDuration" }),
		animationDelay: numberValue({ record, key: "animationDelay" }),
	};
}

function parseTextTemplatePackSource({
	value,
}: {
	value: unknown;
}): TextTemplatePackagePackSource | undefined {
	if (value === undefined) return undefined;
	const record = asRecord({ value });
	if (!record) throw new Error("Invalid QCut text template pack");
	const id = stringValue({ record, key: "id" });
	const name = stringValue({ record, key: "name" });
	const category = stringValue({ record, key: "category" });
	if (!id || !name || !category || !Array.isArray(record.elements)) {
		throw new Error("Incomplete QCut text template pack");
	}
	const elements = record.elements.map((element) =>
		parseTextTemplate({ value: element })
	);
	if (elements.some((element) => !element)) {
		throw new Error("Invalid QCut text template pack element");
	}
	return {
		category,
		copySlots: parseTextTemplatePackCopySlots({ value: record.copySlots }),
		elements: elements.filter(
			(element): element is Partial<TextElement> => element !== null
		),
		id,
		name,
	};
}

function parseTextTemplatePackCopySlots({
	value,
}: {
	value: unknown;
}): TextTemplatePackCopySlot[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error("Invalid QCut text template pack copy slots");
	}
	return value.map((slot, index) => {
		const record = asRecord({ value: slot });
		const id = record ? stringValue({ record, key: "id" }) : undefined;
		const label = record ? stringValue({ record, key: "label" }) : undefined;
		const defaultContent = record
			? stringValue({ record, key: "defaultContent" })
			: undefined;
		const elementIndex = record
			? numberValue({ record, key: "elementIndex" })
			: undefined;
		if (
			!id ||
			!label ||
			defaultContent === undefined ||
			elementIndex === undefined
		) {
			throw new Error(`Invalid QCut text template pack copy slot ${index}`);
		}
		return {
			defaultContent,
			elementIndex,
			id,
			label,
		};
	});
}

function parseTextTemplatePackageResourceRole({
	value,
}: {
	value: unknown;
}): TextTemplatePackageResourceFile["role"] | undefined {
	return value === "source" || value === "thumbnail" ? value : undefined;
}

function parseTextTemplatePackageResources({
	value,
}: {
	value: unknown;
}): TextTemplatePackageResourceFile[] {
	if (!Array.isArray(value)) {
		throw new Error("Invalid QCut text template package resources");
	}
	const resources = value.map((resource, index) => {
		const record = asRecord({ value: resource });
		const role = record
			? parseTextTemplatePackageResourceRole({ value: record.role })
			: undefined;
		const path = record ? stringValue({ record, key: "path" }) : undefined;
		const url = record ? stringValue({ record, key: "url" }) : undefined;
		const mimeType = record
			? stringValue({ record, key: "mimeType" })
			: undefined;
		const byteSize = record
			? numberValue({ record, key: "byteSize" })
			: undefined;
		const checksumSha256 = record
			? stringValue({ record, key: "checksumSha256" })
			: undefined;
		if (!role || !path || !url || !mimeType || !byteSize || !checksumSha256) {
			throw new Error(`Invalid QCut text template package resource ${index}`);
		}
		return { byteSize, checksumSha256, mimeType, path, role, url };
	});
	assertTextTemplatePackageResourceRoles({ resources });
	return resources;
}

function assertTextTemplatePackageResourceRoles({
	resources,
}: {
	resources: readonly TextTemplatePackageResourceFile[];
}): void {
	const roles = new Set<TextTemplatePackageResourceFile["role"]>();
	for (const resource of resources) {
		if (roles.has(resource.role)) {
			throw new Error(
				`Duplicate QCut text template package resource role: ${resource.role}`
			);
		}
		roles.add(resource.role);
	}
	const missingRoles = ["thumbnail", "source"].filter(
		(role) => !roles.has(role as TextTemplatePackageResourceFile["role"])
	);
	if (missingRoles.length === 0) return;
	throw new Error(
		`Incomplete QCut text template package resources: missing ${missingRoles.join(", ")}`
	);
}

function downloadedResourceFiles({
	resources,
}: {
	resources: readonly ResolvedAssetResource[];
}): DownloadedTextTemplateResourceFile[] {
	return resources.map((resource) => ({
		byteSize: resource.byteSize,
		cacheKey: resource.cacheKey,
		checksumSha256: resource.checksumSha256,
		fromCache: resource.fromCache,
		mimeType: resource.mimeType,
		role: resource.role,
		sourceUrl: resource.sourceUrl,
		url: resource.url,
	}));
}

function downloadedResourceSummary({
	cacheKey,
	resources,
}: {
	cacheKey: string;
	resources: readonly ResolvedAssetResource[];
}): DownloadedTextTemplateResource {
	const files = downloadedResourceFiles({ resources });
	return {
		cacheKey,
		cacheHitCount: files.filter((file) => file.fromCache).length,
		cachedBytes: files.reduce((total, file) => total + (file.byteSize ?? 0), 0),
		cachedFileCount: files.length,
		files,
		packageUrl: files.find((file) => file.role === "package")?.url,
		sourceUrl: files.find((file) => file.role === "source")?.url,
		thumbnailUrl: files.find((file) => file.role === "thumbnail")?.url,
	};
}

export function parseTextTemplatePackage({
	text,
}: {
	text: string;
}): TextTemplatePackageSource {
	const root = asRecord({ value: JSON.parse(text) });
	if (!root || root.kind !== "qcut-text-template-package") {
		throw new Error("Invalid QCut text template package");
	}
	const source = asRecord({ value: root.source });
	const template = parseTextTemplate({ value: source?.template });
	const templatePack = parseTextTemplatePackSource({
		value: source?.templatePack,
	});
	const resources = parseTextTemplatePackageResources({
		value: root.resources,
	});
	const assetId = stringValue({ record: root, key: "assetId" });
	const packageId = stringValue({ record: root, key: "packageId" });
	const cacheKey = stringValue({ record: root, key: "cacheKey" });
	const version = numberValue({ record: root, key: "version" });
	if (!assetId || !packageId || !cacheKey || !version || !template) {
		throw new Error("Incomplete QCut text template package");
	}
	return {
		assetId,
		cacheKey,
		packageId,
		resources,
		template,
		templatePack,
		version,
	};
}

async function fetchText({
	fetchImpl,
	url,
}: {
	fetchImpl: typeof fetch;
	url: string;
}) {
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(
			`Text template package request failed (${response.status})`
		);
	}
	return response.text();
}

function bundledTextAssetUrlFromRemoteInput({
	input,
}: {
	input: RequestInfo | URL;
}): string | undefined {
	const urlText =
		typeof input === "string"
			? input
			: input instanceof URL
				? input.toString()
				: input.url;
	try {
		const url = new URL(urlText);
		const remoteBase = new URL(DEFAULT_TEXT_ASSET_REMOTE_BASE_URL);
		if (url.origin !== remoteBase.origin) return undefined;
		if (!url.pathname.startsWith("/text-assets/")) return undefined;
		return `${url.pathname}${url.search}`;
	} catch {
		return undefined;
	}
}

async function fetchBundledTextAssetFallback({
	fetchImpl,
	init,
	input,
}: {
	fetchImpl: typeof fetch;
	init?: RequestInit;
	input: RequestInfo | URL;
}): Promise<Response | undefined> {
	const bundledUrl = bundledTextAssetUrlFromRemoteInput({ input });
	if (!bundledUrl) return undefined;
	try {
		const response = await fetchImpl(bundledUrl, init);
		return response.ok ? response : undefined;
	} catch {
		return undefined;
	}
}

export function textAssetFetchWithBundledFallback({
	fetchImpl,
}: {
	fetchImpl: typeof fetch;
}): typeof fetch {
	return async (input, init) => {
		try {
			const response = await fetchImpl(input, init);
			if (response.ok) return response;
			return (
				(await fetchBundledTextAssetFallback({ fetchImpl, init, input })) ??
				response
			);
		} catch (error) {
			const fallback = await fetchBundledTextAssetFallback({
				fetchImpl,
				init,
				input,
			});
			if (fallback) return fallback;
			throw error;
		}
	};
}

export async function downloadTextTemplateResource({
	definition,
	fetchImpl = fetch,
	onProgress,
	storage,
}: {
	definition: TextTemplateDefinition;
	fetchImpl?: typeof fetch;
	onProgress?: ({ progress }: { progress: number }) => void;
	storage?: AssetResourceCacheStorage;
}): Promise<DownloadedTextTemplateResource> {
	const asset = resolveTextTemplateAssetEntry({ definition });
	const cacheKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	if (asset.kind !== "text-template") {
		throw new Error(`Expected text-template asset, received ${asset.kind}`);
	}
	if (asset.delivery !== "remote") {
		const resources = await ensureAssetResources({
			asset,
			cacheBundledResources: asset.delivery === "bundled",
			fetchImpl,
			onProgress,
			storage,
		});
		return downloadedResourceSummary({ cacheKey, resources });
	}
	if (asset.files.length === 0) {
		throw new Error(`Text template ${asset.id} has no downloadable files`);
	}

	const resources = await ensureAssetResources({
		asset,
		fetchImpl: textAssetFetchWithBundledFallback({ fetchImpl }),
		onProgress,
		storage,
	});
	return downloadedResourceSummary({ cacheKey, resources });
}

export async function loadTextTemplatePackageSource({
	definition,
	fetchImpl = fetch,
	storage,
}: {
	definition: TextTemplateDefinition;
	fetchImpl?: typeof fetch;
	storage?: AssetResourceCacheStorage;
}): Promise<TextTemplatePackageSource> {
	const asset = resolveTextTemplateAssetEntry({ definition });
	const packageFile = asset.files.find((file) => file.role === "package");
	if (!packageFile) {
		throw new Error(`Text template ${asset.id} has no package file`);
	}
	if (asset.delivery !== "remote") {
		const [resource] = await ensureAssetResources({
			asset,
			cacheBundledResources: asset.delivery === "bundled",
			fetchImpl,
			roles: ["package"],
			storage,
		});
		const text = resource?.blob
			? await resource.blob.text()
			: await fetchText({ fetchImpl, url: packageFile.url });
		return parseTextTemplatePackage({ text });
	}
	const [resource] = await ensureAssetResources({
		asset,
		fetchImpl: textAssetFetchWithBundledFallback({ fetchImpl }),
		roles: ["package"],
		storage,
	});
	const text = resource?.blob
		? await resource.blob.text()
		: await fetchText({ fetchImpl, url: packageFile.url });
	return parseTextTemplatePackage({ text });
}

export async function loadTextTemplateThumbnailBlob({
	definition,
	fetchImpl = fetch,
	storage,
}: {
	definition: TextTemplateDefinition;
	fetchImpl?: typeof fetch;
	storage?: AssetResourceCacheStorage;
}): Promise<Blob | null> {
	const asset = resolveTextTemplateAssetEntry({ definition });
	const [resource] = await ensureAssetResources({
		asset,
		cacheBundledResources: asset.delivery === "bundled",
		fetchImpl: textAssetFetchWithBundledFallback({ fetchImpl }),
		roles: ["thumbnail"],
		storage,
	});
	return resource?.blob ?? null;
}

export async function resolveTextTemplateForTimeline({
	definition,
	enabled = true,
	fallbackTemplate,
	fetchImpl = fetch,
	storage,
}: {
	definition: TextTemplateDefinition;
	enabled?: boolean;
	fallbackTemplate: TextElement;
	fetchImpl?: typeof fetch;
	storage?: AssetResourceCacheStorage;
}): Promise<TextElement> {
	if (!enabled) return fallbackTemplate;
	try {
		const packageSource = await loadTextTemplatePackageSource({
			definition,
			fetchImpl,
			storage,
		});
		return {
			...fallbackTemplate,
			...packageSource.template,
			id: fallbackTemplate.id,
			type: fallbackTemplate.type,
		};
	} catch {
		return fallbackTemplate;
	}
}

function completeTextTemplatePackElement({
	baseTemplate,
	currentTime,
	element,
	fallbackElement,
}: {
	baseTemplate: TextElement;
	currentTime: number;
	element: Partial<TextElement>;
	fallbackElement?: CreateTextElement;
}): CreateTextElement {
	return {
		...baseTemplate,
		...fallbackElement,
		...element,
		type: "text",
		startTime: currentTime,
		duration:
			element.duration ??
			fallbackElement?.duration ??
			baseTemplate.duration ??
			TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
		trimStart: 0,
		trimEnd: 0,
	};
}

function resolvePackageBaseTemplate({
	definition,
	fallbackTemplate,
	packageTemplate,
}: {
	definition: TextTemplateDefinition;
	fallbackTemplate?: TextElement;
	packageTemplate: Partial<TextElement>;
}): TextElement {
	const registryTemplate =
		fallbackTemplate ?? buildTextTemplate({ definition });
	return {
		...registryTemplate,
		...packageTemplate,
		id: registryTemplate.id,
		type: "text",
	};
}

function buildResolvedTextTemplatePack({
	currentTime,
	definition,
	fallbackPack,
	fallbackTemplate,
	packageSource,
}: {
	currentTime: number;
	definition: TextTemplateDefinition;
	fallbackPack: ResolvedTextTemplatePack | null;
	fallbackTemplate?: TextElement;
	packageSource: TextTemplatePackageSource;
}): ResolvedTextTemplatePack | null {
	if (!packageSource.templatePack) return fallbackPack;
	const baseTemplate = resolvePackageBaseTemplate({
		definition,
		fallbackTemplate,
		packageTemplate: packageSource.template,
	});
	const elements = packageSource.templatePack.elements.map((element, index) =>
		completeTextTemplatePackElement({
			baseTemplate,
			currentTime,
			element,
			fallbackElement: fallbackPack?.elements[index],
		})
	);
	return {
		category: packageSource.templatePack.category,
		copySlots:
			packageSource.templatePack.copySlots ??
			buildTextTemplatePackCopySlots({
				definition,
				elements,
			}),
		elements,
		id: packageSource.templatePack.id,
		name: packageSource.templatePack.name,
	};
}

export async function resolveTextTemplatePackForTimeline({
	currentTime = 0,
	definition,
	enabled = true,
	fallbackPack,
	fallbackTemplate,
	fetchImpl = fetch,
	storage,
}: {
	currentTime?: number;
	definition: TextTemplateDefinition;
	enabled?: boolean;
	fallbackPack: ResolvedTextTemplatePack | null;
	fallbackTemplate?: TextElement;
	fetchImpl?: typeof fetch;
	storage?: AssetResourceCacheStorage;
}): Promise<ResolvedTextTemplatePack | null> {
	if (!enabled) return fallbackPack;
	try {
		const packageSource = await loadTextTemplatePackageSource({
			definition,
			fetchImpl,
			storage,
		});
		return buildResolvedTextTemplatePack({
			currentTime,
			definition,
			fallbackPack,
			fallbackTemplate,
			packageSource,
		});
	} catch {
		return fallbackPack;
	}
}

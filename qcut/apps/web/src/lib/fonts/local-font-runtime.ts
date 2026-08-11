import type {
	TextElement,
	TextFontAssetReference,
	TimelineTrack,
} from "@/types/timeline";
import type { JianyingFontLabFontSummary } from "@/types/electron";

const fontPromises = new Map<string, Promise<FontFace>>();
const loadedFontFaces = new Map<string, FontFace>();

function getFontCacheKey({ asset }: { asset: TextFontAssetReference }) {
	return `${asset.assetId}:${asset.cssFamily}`;
}

export function isLocalFontAssetReference({
	value,
}: {
	value: unknown;
}): boolean {
	if (!value || typeof value !== "object") return false;
	return (
		"kind" in value &&
		value.kind === "local-font" &&
		"source" in value &&
		value.source === "jianying-cache" &&
		"assetId" in value &&
		typeof value.assetId === "string" &&
		"cssFamily" in value &&
		typeof value.cssFamily === "string" &&
		"familyName" in value &&
		typeof value.familyName === "string" &&
		"fullName" in value &&
		typeof value.fullName === "string" &&
		"postscriptName" in value &&
		typeof value.postscriptName === "string"
	);
}

function resolveLocalFontAssetReference({
	value,
}: {
	value: unknown;
}): TextFontAssetReference | null {
	return isLocalFontAssetReference({ value })
		? (value as TextFontAssetReference)
		: null;
}

export function createLocalFontAssetReference({
	font,
}: {
	font: JianyingFontLabFontSummary;
}): TextFontAssetReference {
	return {
		kind: "local-font",
		source: "jianying-cache",
		assetId: font.fontId,
		cssFamily: font.cssFamily,
		familyName: font.familyName,
		fullName: font.fullName,
		postscriptName: font.postscriptName,
	};
}

function toExactArrayBuffer({ bytes }: { bytes: Uint8Array }) {
	return bytes.slice().buffer;
}

async function readLocalFontBytes({
	asset,
}: {
	asset: TextFontAssetReference;
}) {
	const api = window.electronAPI?.jianyingFontLab;
	if (!api) throw new Error("字体实验室仅在 QCut 桌面版中可用");
	const loaded = await api.load({ fontId: asset.assetId });
	if (
		loaded.font.fontId !== asset.assetId ||
		loaded.font.cssFamily !== asset.cssFamily
	) {
		throw new Error("本机字体与项目保存的字体引用不一致");
	}
	return new Uint8Array(loaded.bytes);
}

function createLocalFontFace({
	asset,
	bytes,
}: {
	asset: TextFontAssetReference;
	bytes: Uint8Array;
}) {
	return new FontFace(asset.cssFamily, toExactArrayBuffer({ bytes }), {
		display: "block",
	});
}

async function loadLocalFont({
	asset,
}: {
	asset: TextFontAssetReference;
}): Promise<FontFace> {
	const bytes = await readLocalFontBytes({ asset });
	const face = createLocalFontFace({ asset, bytes });
	document.fonts.add(face);
	try {
		await face.load();
		loadedFontFaces.set(getFontCacheKey({ asset }), face);
		return face;
	} catch (cause) {
		document.fonts.delete(face);
		throw cause;
	}
}

export async function loadTransientLocalFontFace({
	asset,
}: {
	asset: TextFontAssetReference;
}) {
	const bytes = await readLocalFontBytes({ asset });
	const face = createLocalFontFace({ asset, bytes });
	document.fonts.add(face);
	try {
		await face.load();
	} catch (cause) {
		document.fonts.delete(face);
		throw cause;
	}
	return {
		face,
		release: () => document.fonts.delete(face),
	};
}

export async function ensureLocalFontLoaded({
	asset,
}: {
	asset: TextFontAssetReference;
}): Promise<FontFace> {
	const cacheKey = getFontCacheKey({ asset });
	const loaded = loadedFontFaces.get(cacheKey);
	if (loaded) return loaded;
	const pending = fontPromises.get(cacheKey);
	if (pending) return pending;
	const promise = loadLocalFont({ asset });
	fontPromises.set(cacheKey, promise);
	try {
		return await promise;
	} catch (cause) {
		fontPromises.delete(cacheKey);
		throw cause;
	}
}

export async function ensureTextElementLocalFontLoaded({
	element,
}: {
	element: TextElement;
}) {
	const asset = resolveLocalFontAssetReference({ value: element.fontAsset });
	if (!asset) return null;
	return ensureLocalFontLoaded({ asset });
}

export async function ensureTimelineLocalFontsLoaded({
	tracks,
}: {
	tracks: TimelineTrack[];
}) {
	const assets = new Map<string, TextFontAssetReference>();
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type !== "text") continue;
			const asset = resolveLocalFontAssetReference({
				value: element.fontAsset,
			});
			if (asset) assets.set(asset.assetId, asset);
		}
	}
	return Promise.all(
		Array.from(assets.values()).map((asset) => ensureLocalFontLoaded({ asset }))
	);
}

export function resetLocalFontRuntimeForTests() {
	fontPromises.clear();
	loadedFontFaces.clear();
}

import type { AssetManifestEntry } from "@qcut/editor-core";

const MAX_ANIMATION_HEADER_BYTES = 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function matchesBytes({
	bytes,
	expected,
	offset,
}: {
	bytes: Uint8Array;
	expected: readonly number[];
	offset: number;
}): boolean {
	if (offset + expected.length > bytes.length) return false;
	return expected.every((value, index) => bytes[offset + index] === value);
}

function readChunkName({
	bytes,
	offset,
}: {
	bytes: Uint8Array;
	offset: number;
}): string {
	return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

function containsApngAnimationChunk({ bytes }: { bytes: Uint8Array }): boolean {
	if (!matchesBytes({ bytes, expected: PNG_SIGNATURE, offset: 0 }))
		return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset: number = PNG_SIGNATURE.length;

	while (offset + 12 <= bytes.length) {
		const chunkLength = view.getUint32(offset);
		const chunkName = readChunkName({ bytes, offset: offset + 4 });
		if (chunkName === "acTL") return true;
		if (chunkName === "IEND") return false;

		const nextOffset = offset + 12 + chunkLength;
		if (nextOffset <= offset || nextOffset > bytes.length) return false;
		offset = nextOffset;
	}

	return false;
}

function containsWebpAnimationChunk({ bytes }: { bytes: Uint8Array }): boolean {
	if (
		readChunkName({ bytes, offset: 0 }) !== "RIFF" ||
		readChunkName({ bytes, offset: 8 }) !== "WEBP"
	) {
		return false;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 12;
	while (offset + 8 <= bytes.length) {
		const chunkName = readChunkName({ bytes, offset });
		if (chunkName === "ANIM") return true;
		const chunkLength = view.getUint32(offset + 4, true);
		const paddedLength = chunkLength + (chunkLength % 2);
		const nextOffset = offset + 8 + paddedLength;
		if (nextOffset <= offset || nextOffset > bytes.length) return false;
		offset = nextOffset;
	}

	return false;
}

function hasAnimatedMetadata({ metadata }: { metadata: unknown }): boolean {
	if (typeof metadata !== "object" || metadata === null) return false;
	return Reflect.get(metadata, "animated") === true;
}

export function isAnimatedStickerAsset({
	asset,
}: {
	asset: AssetManifestEntry;
}): boolean {
	if (!hasAnimatedMetadata({ metadata: asset.metadata })) return false;
	const source = asset.files.find((file) => file.role === "source");
	const mimeType = source?.mimeType?.toLocaleLowerCase() ?? "";
	const sourceUrl = source?.url.toLocaleLowerCase() ?? "";
	return !mimeType.includes("svg") && !sourceUrl.includes(".svg");
}

export async function isAnimatedStickerFile({
	file,
}: {
	file: File;
}): Promise<boolean> {
	const fileName = file.name.toLocaleLowerCase();
	const mimeType = file.type.toLocaleLowerCase();
	if (mimeType === "image/gif" || fileName.endsWith(".gif")) return true;
	if (fileName.endsWith(".apng")) return true;

	const shouldInspectPng =
		mimeType === "image/png" || fileName.endsWith(".png");
	const shouldInspectWebp =
		mimeType === "image/webp" || fileName.endsWith(".webp");
	if (!shouldInspectPng && !shouldInspectWebp) return false;

	const bytes = new Uint8Array(
		await file.slice(0, MAX_ANIMATION_HEADER_BYTES).arrayBuffer()
	);
	if (shouldInspectPng) return containsApngAnimationChunk({ bytes });
	return containsWebpAnimationChunk({ bytes });
}

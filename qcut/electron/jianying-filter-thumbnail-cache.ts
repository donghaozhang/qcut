import {
	readJianyingCachedImage,
	type JianyingImageMimeType,
} from "./jianying-image-cache.js";

export interface JianyingFilterThumbnailSource {
	resourceId: string;
	version?: string;
	sourcePath?: string;
	sourceUrl?: string;
}

export interface JianyingFilterThumbnail {
	mimeType: Exclude<JianyingImageMimeType, "image/gif">;
	bytes: Buffer;
	fromCache: boolean;
}

export async function readJianyingFilterThumbnail({
	source,
	cacheRoot,
	fetcher = fetch,
}: {
	source: JianyingFilterThumbnailSource;
	cacheRoot: string;
	fetcher?: typeof fetch;
}): Promise<JianyingFilterThumbnail> {
	const image = await readJianyingCachedImage({
		cacheRoot,
		fetcher,
		label: "剪映滤镜缩略图",
		source: {
			cacheKey: [
				source.resourceId,
				source.version ?? "",
				source.sourcePath ?? "",
				source.sourceUrl ?? "",
			].join("\0"),
			...(source.sourcePath ? { sourcePath: source.sourcePath } : {}),
			...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
		},
	});
	const { mimeType } = image;
	if (mimeType === "image/gif") {
		throw new Error("剪映滤镜缩略图格式不受支持");
	}
	return { ...image, mimeType };
}

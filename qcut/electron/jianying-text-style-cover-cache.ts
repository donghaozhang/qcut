import {
	readJianyingCachedImage,
	type JianyingCachedImage,
} from "./jianying-image-cache.js";

const TEXT_STYLE_COVER_CACHE_VERSION = 3;

export function readJianyingTextStyleCoverImage({
	cacheRoot,
	fetcher = fetch,
	produceFallback,
	sourceUrl,
	styleId,
}: {
	cacheRoot: string;
	fetcher?: typeof fetch;
	produceFallback?: () => Promise<Buffer>;
	sourceUrl: string;
	styleId: string;
}): Promise<JianyingCachedImage> {
	return readJianyingCachedImage({
		cacheRoot,
		fetcher,
		label: "剪映花字封面",
		source: {
			cacheKey: `v${TEXT_STYLE_COVER_CACHE_VERSION}:${styleId}`,
			produce: produceFallback,
			sourceUrl,
		},
	});
}

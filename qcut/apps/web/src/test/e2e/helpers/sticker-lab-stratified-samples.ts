import type {
	LocalStickerLabDiscovery,
	LocalStickerLabMimeType,
	LocalStickerLabReference,
} from "../../../../../../electron/preload-types/api-types/sticker-lab-api";

export interface StratifiedStickerSample {
	batchId: string;
	byteSize: number;
	categoryId: string;
	categoryLabel: string;
	checksumSha256: string;
	cycleDurationSeconds: number;
	displayName: string;
	frameCount: number;
	frameRate: number | null;
	itemId: string;
	mimeType: LocalStickerLabMimeType;
	sourceKind: LocalStickerLabReference["sourceKind"];
}

interface StickerCandidate {
	batchId: string;
	categoryId: string;
	categoryLabel: string;
	item: LocalStickerLabReference;
}

function compareCategoryIds({
	left,
	right,
}: {
	left: { categoryId: string; itemId: string };
	right: { categoryId: string; itemId: string };
}): number {
	const leftId = BigInt(left.categoryId);
	const rightId = BigInt(right.categoryId);
	if (leftId < rightId) return -1;
	if (leftId > rightId) return 1;
	return left.itemId.localeCompare(right.itemId);
}

function compareBySizeThenId({
	left,
	right,
}: {
	left: StickerCandidate;
	right: StickerCandidate;
}): number {
	return (
		left.item.asset.byteSize - right.item.asset.byteSize ||
		left.item.id.localeCompare(right.item.id)
	);
}

function toSample({
	candidate,
}: {
	candidate: StickerCandidate;
}): StratifiedStickerSample {
	const { item } = candidate;
	return {
		batchId: candidate.batchId,
		byteSize: item.asset.byteSize,
		categoryId: candidate.categoryId,
		categoryLabel: candidate.categoryLabel,
		checksumSha256: item.asset.checksumSha256,
		cycleDurationSeconds:
			item.playback.kind === "animated" ? item.playback.cycleDuration : 0,
		displayName: item.displayName,
		frameCount:
			item.playback.kind === "animated" ? item.playback.frameCount : 1,
		frameRate:
			item.playback.kind === "animated"
				? (item.playback.frameRate ?? null)
				: null,
		itemId: item.id,
		mimeType: item.mimeType,
		sourceKind: item.sourceKind,
	};
}

function candidatesByCategory({
	discovery,
}: {
	discovery: LocalStickerLabDiscovery;
}): Map<string, StickerCandidate[]> {
	const grouped = new Map<string, StickerCandidate[]>();
	for (const catalog of discovery.catalogs) {
		for (const category of catalog.categories) {
			const candidates = grouped.get(category.id) ?? [];
			for (const item of category.items) {
				candidates.push({
					batchId: catalog.batchId,
					categoryId: category.id,
					categoryLabel: category.label,
					item,
				});
			}
			grouped.set(category.id, candidates);
		}
	}
	return grouped;
}

function chooseCategoryPair({
	candidates,
}: {
	candidates: StickerCandidate[];
}): StickerCandidate[] {
	if (candidates.length < 2) {
		throw new Error(
			`Sticker category ${candidates[0]?.categoryId ?? "unknown"} has fewer than two runnable items`
		);
	}
	const gifs = candidates
		.filter(({ item }) => item.mimeType === "image/gif")
		.sort((left, right) => compareBySizeThenId({ left, right }));
	const pngs = candidates
		.filter(({ item }) => item.mimeType === "image/png")
		.sort((left, right) => compareBySizeThenId({ left, right }));
	if (gifs.length > 0 && pngs.length > 0) return [gifs[0], pngs[0]];
	const singleFormat = gifs.length > 0 ? gifs : pngs;
	const largest = singleFormat.at(-1);
	if (!largest) throw new Error("Sticker category selection is empty");
	return [singleFormat[0], largest];
}

function withinGifCycleLimit({
	candidate,
	maxGifCycleDurationSeconds,
}: {
	candidate: StickerCandidate;
	maxGifCycleDurationSeconds?: number;
}): boolean {
	if (
		maxGifCycleDurationSeconds === undefined ||
		candidate.item.playback.kind !== "animated"
	) {
		return true;
	}
	return candidate.item.playback.cycleDuration <= maxGifCycleDurationSeconds;
}

export function selectStratifiedStickerSamples({
	discovery,
	maxGifCycleDurationSeconds,
}: {
	discovery: LocalStickerLabDiscovery;
	maxGifCycleDurationSeconds?: number;
}): StratifiedStickerSample[] {
	if (
		maxGifCycleDurationSeconds !== undefined &&
		(!Number.isFinite(maxGifCycleDurationSeconds) ||
			maxGifCycleDurationSeconds <= 0)
	) {
		throw new Error("GIF cycle duration limit must be finite and positive");
	}
	if (discovery.warnings.length > 0) {
		throw new Error(
			`Sticker Lab discovery returned ${discovery.warnings.length} warning(s)`
		);
	}
	const grouped = candidatesByCategory({ discovery });
	if (grouped.size !== discovery.summary.categoryCount) {
		throw new Error(
			`Sticker Lab category count mismatch: ${grouped.size} selected from ${discovery.summary.categoryCount}`
		);
	}
	const categoryPairs = [...grouped.values()]
		.sort((left, right) =>
			compareCategoryIds({
				left: { categoryId: left[0].categoryId, itemId: left[0].item.id },
				right: { categoryId: right[0].categoryId, itemId: right[0].item.id },
			})
		)
		.flatMap((candidates) =>
			chooseCategoryPair({
				candidates: candidates.filter((candidate) =>
					withinGifCycleLimit({ candidate, maxGifCycleDurationSeconds })
				),
			})
		);
	const samples = categoryPairs.map((candidate) => toSample({ candidate }));
	if (new Set(samples.map(({ itemId }) => itemId)).size !== samples.length) {
		throw new Error("Stratified Sticker Lab samples contain duplicate items");
	}
	return samples;
}

function evenlySpaced<T>({ items, limit }: { items: T[]; limit: number }): T[] {
	if (items.length <= limit) return items;
	return Array.from(
		{ length: limit },
		(_, index) => items[Math.floor((index * items.length) / limit)]
	);
}

export function selectRepresentativeUiSamples({
	limit = 12,
	samples,
}: {
	limit?: number;
	samples: StratifiedStickerSample[];
}): StratifiedStickerSample[] {
	const gifLimit = Math.ceil(limit / 2);
	const pngLimit = limit - gifLimit;
	const selectedGifs = evenlySpaced({
		items: samples.filter(({ mimeType }) => mimeType === "image/gif"),
		limit: gifLimit,
	});
	const usedCategories = new Set(
		selectedGifs.map(({ categoryId }) => categoryId)
	);
	const pngCandidates = samples.filter(
		({ categoryId, mimeType }) =>
			mimeType === "image/png" && !usedCategories.has(categoryId)
	);
	const selectedPngs = evenlySpaced({ items: pngCandidates, limit: pngLimit });
	const selected = [...selectedGifs, ...selectedPngs].sort((left, right) =>
		compareCategoryIds({ left, right })
	);
	if (selected.length !== limit) {
		throw new Error(
			`Could not select ${limit} representative UI Sticker Lab samples`
		);
	}
	return selected;
}

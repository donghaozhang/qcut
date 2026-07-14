export interface TransitionPreviewAsset {
	from: string;
	to: string;
}

const TRANSITION_PREVIEW_IMAGES = [
	"coastal",
	"golden-hour",
	"city-rain",
	"neon-city",
	"forest-trail",
	"warm-room",
	"open-field",
	"night-market",
	"sunset-ridge",
	"studio-white",
	"desert-sun",
	"lake-glass",
	"street-contrast",
	"museum-soft",
	"window-light",
	"lantern-night",
	"ocean-blue",
	"apartment-day",
	"wide-valley",
	"cozy-cafe",
	"moonlit",
	"trail-sun",
	"gallery-white",
	"street-neon",
	"misty-hills",
	"warm-kitchen",
	"sunset-camp",
	"night-blue",
	"beach-breeze",
	"camp-morning",
	"alpine",
	"fresh-brunch",
] as const;

function stableHash({ value }: { value: string }): number {
	let hash = 2166136261;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function previewUrl({ name }: { name: string }): string {
	return `/images/filter-previews/${name}.webp`;
}

export function getTransitionPreviewAsset({
	presetId,
}: {
	presetId: string;
}): TransitionPreviewAsset {
	const hash = stableHash({ value: presetId });
	const fromIndex = hash % TRANSITION_PREVIEW_IMAGES.length;
	const toIndex =
		(hash * 7 + 11 + fromIndex) % TRANSITION_PREVIEW_IMAGES.length;
	const distinctToIndex =
		toIndex === fromIndex
			? (toIndex + 1) % TRANSITION_PREVIEW_IMAGES.length
			: toIndex;
	return {
		from: previewUrl({ name: TRANSITION_PREVIEW_IMAGES[fromIndex] }),
		to: previewUrl({ name: TRANSITION_PREVIEW_IMAGES[distinctToIndex] }),
	};
}

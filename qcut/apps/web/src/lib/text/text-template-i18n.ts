import type { AppLocale } from "@/lib/i18n";
import type { TextTemplatePackCopySlot } from "@/lib/text/text-template-packs";
import type {
	TextTemplateCategory,
	TextTemplateCategoryId,
	TextTemplateDefinition,
	TextTemplateGroup,
	TextTemplateGroupId,
} from "@/lib/text/text-template-registry";

const ENGLISH_GROUP_LABELS = {
	"new-text": "New text",
	mine: "My library",
	"smart-packaging": "Smart packaging",
	fancy: "Text styles",
	templates: "Text templates",
	"smart-text": "Smart text",
} satisfies Record<TextTemplateGroupId, string>;

const ENGLISH_CATEGORY_LABELS = {
	basic: "Basic text",
	title: "Title",
	caption: "Description",
	"lower-third": "Lower third",
	quote: "Quote",
	favorites: "Favorites",
	recent: "Recently used",
	"brand-kit": "Brand text",
	downloaded: "Downloaded",
	drafts: "Drafts",
	"cover-pack": "Cover graphics",
	"intro-outro": "Intro and outro",
	"talking-head": "Talking-head cards",
	"commerce-badge": "Commerce badges",
	"info-strip": "Information strips",
	recommended: "Recommended",
	trending: "Trending now",
	popular: "Popular",
	latest: "Latest",
	summer: "Summer",
	variety: "Variety",
	guofeng: "Chinese style",
	glow: "Glow",
	gradient: "Gradient",
	texture: "Texture",
	red: "Red",
	yellow: "Yellow",
	"black-white": "Black and white",
	blue: "Blue",
	pink: "Pink",
	green: "Green",
	purple: "Purple",
	"headline-template": "Headline templates",
	"quote-template": "Quote templates",
	"list-template": "List templates",
	"split-template": "Split-screen templates",
	"timeline-template": "Timeline templates",
	summary: "Auto summary",
	"key-point": "Key points",
	chapter: "Chapter titles",
	"subtitle-title": "Caption to title",
	rewrite: "AI rewrite",
} satisfies Record<TextTemplateCategoryId, string>;

const ENGLISH_CATEGORY_CONTENT = {
	basic: "Default text",
	title: "Title",
	caption: "Description",
	"lower-third": "Name and role",
	quote: "Key quote",
	favorites: "Favorite",
	recent: "Recent",
	"brand-kit": "Brand",
	downloaded: "Downloaded",
	drafts: "Draft",
	"cover-pack": "Featured story",
	"intro-outro": "Opening",
	"talking-head": "Key point",
	"commerce-badge": "Special offer",
	"info-strip": "Information",
	recommended: "Text",
	trending: "Text",
	popular: "Text",
	latest: "Text",
	summer: "Text",
	variety: "Text",
	guofeng: "Text",
	glow: "Text",
	gradient: "Text",
	texture: "Text",
	red: "Text",
	yellow: "Text",
	"black-white": "Text",
	blue: "Text",
	pink: "Text",
	green: "Text",
	purple: "Text",
	"headline-template": "Main headline",
	"quote-template": "Key quote",
	"list-template": "Key steps",
	"split-template": "Before and after",
	"timeline-template": "Milestone",
	summary: "Summary",
	"key-point": "Key point",
	chapter: "Chapter",
	"subtitle-title": "Title",
	rewrite: "Rewrite",
} satisfies Record<TextTemplateCategoryId, string>;

const ENGLISH_VARIANT_LABELS: Readonly<Record<string, string>> = {
	plain: "Basic",
	outline: "Outline",
	label: "Label",
	pop: "Pop",
	glow: "Glow",
	fire: "Fire",
	sticker: "Sticker",
	glitch: "Glitch",
	pixel: "Pixel",
	ink: "Ink",
	gold: "Gold",
	chrome: "Metal",
	comic: "Comic",
	bubble: "Bubble",
	stamp: "Stamp",
	cutout: "Paper cut",
	glass: "Glass",
	shadow: "Double shadow",
	candy: "Candy",
	warning: "Warning",
	"soft-card": "Soft card",
	ribbon: "Ribbon",
	"red-burst": "Red burst",
	lava: "Lava",
	"texture-grain": "Grain",
	"torn-paper": "Torn paper",
	"gradient-duotone": "Duotone",
	"gradient-shine": "Shimmer",
	"blue-ice": "Ice blue",
	"pink-heart": "Sweetheart",
	"green-fresh": "Fresh",
	"purple-dream": "Dream purple",
};

const ENGLISH_PACK_SLOT_LABELS: Readonly<Record<string, string>> = {
	quote: "Quote",
	attribution: "Attribution",
	title: "Title",
	"item-1": "Item 1",
	"item-2": "Item 2",
	left: "Left copy",
	right: "Right copy",
	"stage-1": "Stage 1",
	"stage-2": "Stage 2",
	"stage-3": "Stage 3",
	kicker: "Kicker",
	headline: "Headline",
	subhead: "Subhead",
};

export function getLocalizedTextTemplateGroupLabel({
	group,
	locale,
}: {
	group: Pick<TextTemplateGroup, "id" | "label">;
	locale: AppLocale;
}): string {
	return locale === "en" ? ENGLISH_GROUP_LABELS[group.id] : group.label;
}

export function getLocalizedTextTemplateCategoryLabel({
	category,
	locale,
}: {
	category: Pick<TextTemplateCategory, "id" | "label">;
	locale: AppLocale;
}): string {
	return locale === "en"
		? ENGLISH_CATEGORY_LABELS[category.id]
		: category.label;
}

export function getLocalizedTextTemplateDefinition({
	definition,
	locale,
}: {
	definition: TextTemplateDefinition;
	locale: AppLocale;
}): TextTemplateDefinition {
	if (locale === "zh") return definition;
	const variantLabel = ENGLISH_VARIANT_LABELS[definition.variantId];
	if (!variantLabel) return definition;
	return {
		...definition,
		content: ENGLISH_CATEGORY_CONTENT[definition.category],
		name: `${ENGLISH_CATEGORY_LABELS[definition.category]} ${variantLabel}`,
	};
}

export function getLocalizedTextTemplateDefinitionName({
	definition,
	locale,
}: {
	definition: TextTemplateDefinition;
	locale: AppLocale;
}): string {
	return getLocalizedTextTemplateDefinition({ definition, locale }).name;
}

export function getLocalizedTextTemplatePackSlotLabel({
	locale,
	slot,
}: {
	locale: AppLocale;
	slot: Pick<TextTemplatePackCopySlot, "id" | "label">;
}): string {
	if (locale === "zh") return slot.label;
	return ENGLISH_PACK_SLOT_LABELS[slot.id] ?? slot.label;
}

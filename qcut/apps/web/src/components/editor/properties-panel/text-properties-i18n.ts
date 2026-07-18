import type { TranslationKey } from "@/lib/i18n";
import type { TextKeyframeProperty } from "@/types/timeline";
import type { TEXT_ANIMATION_TYPES } from "@/lib/text/text-animation";
import type { TEXT_BLEND_MODES } from "@/lib/text/text-style";

export const TEXT_ANIMATION_TYPE_KEYS: Record<
	(typeof TEXT_ANIMATION_TYPES)[number],
	TranslationKey
> = {
	none: "textProperties.animation.none",
	fade: "textProperties.animation.fade",
	"slide-up": "textProperties.animation.slideUp",
	"slide-left": "textProperties.animation.slideLeft",
};

export const TEXT_BLEND_MODE_KEYS: Record<
	(typeof TEXT_BLEND_MODES)[number],
	TranslationKey
> = {
	normal: "textProperties.blend.normal",
	multiply: "textProperties.blend.multiply",
	screen: "textProperties.blend.screen",
	overlay: "textProperties.blend.overlay",
	darken: "textProperties.blend.darken",
	lighten: "textProperties.blend.lighten",
};

export const TEXT_KEYFRAME_PROPERTY_KEYS: Record<
	TextKeyframeProperty,
	TranslationKey
> = {
	x: "textProperties.keyframe.x",
	y: "textProperties.keyframe.y",
	rotation: "textProperties.keyframe.rotation",
	opacity: "textProperties.keyframe.opacity",
	fontSize: "textProperties.keyframe.fontSize",
};

export const TEXT_ALIGN_LABEL_KEYS: Record<
	"left" | "center" | "right",
	TranslationKey
> = {
	left: "textProperties.align.left",
	center: "textProperties.align.center",
	right: "textProperties.align.right",
};

export const TEXT_VERTICAL_ALIGN_LABEL_KEYS: Record<
	"top" | "middle" | "bottom",
	TranslationKey
> = {
	top: "textProperties.align.top",
	middle: "textProperties.align.middle",
	bottom: "textProperties.align.bottom",
};

export const TEXT_REWRITE_MODE_KEYS: Record<
	"shorter" | "punchier" | "professional",
	TranslationKey
> = {
	shorter: "textProperties.mode.shorter",
	punchier: "textProperties.mode.punchier",
	professional: "textProperties.mode.professional",
};

/** Built-in preset ids only; custom presets keep their user-supplied names. */
export const TEXT_PRESET_NAME_KEYS: Partial<Record<string, TranslationKey>> = {
	"clean-white": "textProperties.preset.name.cleanWhite",
	subtitle: "textProperties.preset.name.subtitle",
	"yellow-pop": "textProperties.preset.name.yellowPop",
	"soft-shadow": "textProperties.preset.name.softShadow",
	highlight: "textProperties.preset.name.highlight",
	"red-label": "textProperties.preset.name.redLabel",
	"cyan-neon": "textProperties.preset.name.cyanNeon",
	"pink-neon": "textProperties.preset.name.pinkNeon",
	"blue-outline": "textProperties.preset.name.blueOutline",
	editorial: "textProperties.preset.name.editorial",
	"rounded-label": "textProperties.preset.name.roundedLabel",
	"dark-bubble": "textProperties.preset.name.darkBubble",
	"yellow-callout": "textProperties.preset.name.yellowCallout",
};

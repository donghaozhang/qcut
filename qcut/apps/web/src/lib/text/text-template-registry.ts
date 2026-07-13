import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import type { TextElement } from "@/types/timeline";
import { BUILT_IN_TEXT_PRESETS, type TextStylePreset } from "./text-presets";

export type TextTemplateCategoryId =
	| "basic"
	| "social"
	| "labels"
	| "decorative";

export interface TextTemplateCategory {
	id: TextTemplateCategoryId;
	label: string;
}

export interface TextTemplateDefinition {
	id: string;
	name: string;
	category: TextTemplateCategoryId;
	content: string;
	stylePresetId: string;
	overrides?: Partial<TextElement>;
}

export const TEXT_TEMPLATE_CATEGORIES: readonly TextTemplateCategory[] = [
	{ id: "basic", label: "Basic" },
	{ id: "social", label: "Social" },
	{ id: "labels", label: "Labels" },
	{ id: "decorative", label: "Decorative" },
];

const BASE_TEXT_TEMPLATE: TextElement = {
	id: "default-text",
	type: "text",
	name: "Default text",
	content: "Default text",
	fontSize: 48,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	width: 640,
	height: 180,
	letterSpacing: 0,
	lineHeight: 1.2,
	verticalAlign: "middle",
	strokeColor: "#000000",
	strokeWidth: 0,
	strokeOpacity: 1,
	backgroundOpacity: 0,
	backgroundRadius: 4,
	backgroundPadding: 12,
	shadowColor: "#000000",
	shadowOpacity: 0,
	shadowOffsetX: 4,
	shadowOffsetY: 4,
	shadowBlur: 8,
	glowColor: "#ffffff",
	glowOpacity: 0,
	glowBlur: 12,
	curve: 0,
	animationType: "none",
	animationDuration: 0.6,
	animationDelay: 0,
	blendMode: "normal",
	duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

export const TEXT_TEMPLATE_DEFINITIONS: readonly TextTemplateDefinition[] = [
	{
		id: "default-text",
		name: "Default text",
		category: "basic",
		content: "Default text",
		stylePresetId: "clean-white",
	},
	{
		id: "heading-text",
		name: "Heading",
		category: "basic",
		content: "Heading",
		stylePresetId: "soft-shadow",
		overrides: { fontSize: 84, fontWeight: "bold", width: 900, height: 220 },
	},
	{
		id: "subtitle-text",
		name: "Subtitle",
		category: "basic",
		content: "Subtitle",
		stylePresetId: "subtitle",
		overrides: { width: 820, height: 160 },
	},
	{
		id: "editorial-title",
		name: "Editorial title",
		category: "basic",
		content: "Editorial",
		stylePresetId: "editorial",
		overrides: { fontSize: 76, width: 800, height: 220 },
	},
	{
		id: "social-hook",
		name: "Social hook",
		category: "social",
		content: "Watch this",
		stylePresetId: "yellow-pop",
		overrides: {
			fontSize: 72,
			curve: -18,
			width: 760,
			height: 220,
			animationType: "slide-up",
		},
	},
	{
		id: "social-question",
		name: "Question",
		category: "social",
		content: "Did you know?",
		stylePresetId: "pink-neon",
		overrides: {
			fontSize: 68,
			width: 780,
			height: 220,
			animationType: "fade",
		},
	},
	{
		id: "social-tip",
		name: "Quick tip",
		category: "social",
		content: "Quick tip",
		stylePresetId: "highlight",
		overrides: { fontSize: 60, width: 600, height: 180 },
	},
	{
		id: "social-breaking",
		name: "Breaking",
		category: "social",
		content: "BREAKING",
		stylePresetId: "red-label",
		overrides: {
			fontSize: 58,
			width: 620,
			height: 170,
			animationType: "slide-left",
		},
	},
	{
		id: "rounded-label",
		name: "Rounded label",
		category: "labels",
		content: "Rounded label",
		stylePresetId: "rounded-label",
		overrides: { width: 620, height: 150 },
	},
	{
		id: "dark-bubble",
		name: "Dark bubble",
		category: "labels",
		content: "Dark bubble",
		stylePresetId: "dark-bubble",
		overrides: { width: 600, height: 150 },
	},
	{
		id: "yellow-callout",
		name: "Yellow callout",
		category: "labels",
		content: "Important",
		stylePresetId: "yellow-callout",
		overrides: { rotation: -3, width: 520, height: 150 },
	},
	{
		id: "blue-outline-label",
		name: "Blue outline",
		category: "labels",
		content: "Chapter one",
		stylePresetId: "blue-outline",
		overrides: { fontSize: 64, width: 720, height: 190 },
	},
	{
		id: "cyan-neon",
		name: "Cyan neon",
		category: "decorative",
		content: "Neon",
		stylePresetId: "cyan-neon",
		overrides: {
			fontSize: 80,
			width: 700,
			height: 240,
			animationType: "fade",
		},
	},
	{
		id: "pink-neon-title",
		name: "Pink neon",
		category: "decorative",
		content: "Night life",
		stylePresetId: "pink-neon",
		overrides: { fontSize: 76, width: 760, height: 230 },
	},
	{
		id: "curved-pop",
		name: "Curved pop",
		category: "decorative",
		content: "Big moment",
		stylePresetId: "yellow-pop",
		overrides: { fontSize: 72, curve: 20, width: 760, height: 240 },
	},
	{
		id: "clean-quote",
		name: "Clean quote",
		category: "decorative",
		content: "A memorable line",
		stylePresetId: "editorial",
		overrides: { fontSize: 60, width: 860, height: 220 },
	},
];

const textPresetsById = new Map<string, TextStylePreset>(
	BUILT_IN_TEXT_PRESETS.map((preset) => [preset.id, preset])
);

export function buildTextTemplate({
	definition,
}: {
	definition: TextTemplateDefinition;
}): TextElement {
	const stylePreset = textPresetsById.get(definition.stylePresetId);
	if (!stylePreset) {
		throw new Error(
			`Unknown text style preset '${definition.stylePresetId}' for '${definition.id}'`
		);
	}

	return {
		...BASE_TEXT_TEMPLATE,
		...stylePreset.updates,
		...definition.overrides,
		id: definition.id,
		name: definition.name,
		content: definition.content,
	};
}

export const TEXT_TEMPLATES: readonly TextElement[] =
	TEXT_TEMPLATE_DEFINITIONS.map((definition) =>
		buildTextTemplate({ definition })
	);

export function getTextTemplatesByCategory({
	category,
}: {
	category: TextTemplateCategoryId;
}): TextElement[] {
	const templateIds = new Set(
		TEXT_TEMPLATE_DEFINITIONS.filter(
			(definition) => definition.category === category
		).map((definition) => definition.id)
	);
	return TEXT_TEMPLATES.filter((template) => templateIds.has(template.id));
}

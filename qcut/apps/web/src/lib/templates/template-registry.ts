import {
	TIMELINE_TEMPLATE_SCHEMA,
	validateTimelineTemplate,
	type TemplateAspectRatio,
	type TimelineTemplate,
	type TimelineTemplateVariant,
} from "@qcut/editor-core/templates";

function createCreatorVariant({
	aspectRatio,
	canvas,
	headline,
	secondary,
}: {
	aspectRatio: TemplateAspectRatio;
	canvas: { width: number; height: number };
	headline: { y: number; width: number; fontSize: number };
	secondary: { y: number; width: number };
}): TimelineTemplateVariant {
	return {
		aspectRatio,
		canvas,
		placements: [
			{
				kind: "media",
				slotId: "hero",
				trackName: "Story footage",
				startTime: 0,
				duration: 5,
				fitMode: "cover",
				animationInType: "fade",
				animationInDuration: 0.25,
			},
			{
				kind: "media",
				slotId: "broll",
				trackName: "Story footage",
				startTime: 5,
				duration: 5,
				fitMode: "cover",
				animationInType: "zoom-in",
				animationInDuration: 0.35,
			},
			{
				kind: "text",
				slotId: "headline",
				trackName: "Story headline",
				startTime: 0.35,
				duration: 3.6,
				stylePresetId: "yellow-pop",
				x: 0,
				y: headline.y,
				width: headline.width,
				height: 240,
				fontFamily: "Inter",
				fontSize: headline.fontSize,
				animationType: "slide-up",
			},
			{
				kind: "text",
				slotId: "secondary",
				trackName: "Story secondary",
				startTime: 5.2,
				duration: 3.2,
				stylePresetId: "dark-bubble",
				x: 0,
				y: secondary.y,
				width: secondary.width,
				height: 180,
				fontFamily: "Inter",
				fontSize: 48,
				animationType: "fade",
			},
		],
	};
}

function createProductVariant({
	aspectRatio,
	canvas,
	headlineY,
	ctaY,
	textWidth,
}: {
	aspectRatio: TemplateAspectRatio;
	canvas: { width: number; height: number };
	headlineY: number;
	ctaY: number;
	textWidth: number;
}): TimelineTemplateVariant {
	return {
		aspectRatio,
		canvas,
		placements: [
			{
				kind: "media",
				slotId: "product",
				trackName: "Product footage",
				startTime: 0,
				duration: 6,
				fitMode: "cover",
				animationInType: "zoom-in",
				animationInDuration: 0.5,
			},
			{
				kind: "media",
				slotId: "detail",
				trackName: "Product footage",
				startTime: 6,
				duration: 4,
				fitMode: "cover",
				animationInType: "fade",
				animationInDuration: 0.3,
			},
			{
				kind: "text",
				slotId: "headline",
				trackName: "Product headline",
				startTime: 0.4,
				duration: 4.8,
				stylePresetId: "editorial",
				x: 0,
				y: headlineY,
				width: textWidth,
				height: 240,
				fontFamily: "Playfair Display",
				fontSize: 72,
				animationType: "fade",
			},
			{
				kind: "text",
				slotId: "cta",
				trackName: "Product CTA",
				startTime: 6.25,
				duration: 3.2,
				stylePresetId: "red-label",
				x: 0,
				y: ctaY,
				width: Math.min(700, textWidth),
				height: 170,
				fontFamily: "Inter",
				fontSize: 48,
				animationType: "slide-up",
			},
		],
	};
}

export const TIMELINE_TEMPLATES: TimelineTemplate[] = [
	{
		schema: TIMELINE_TEMPLATE_SCHEMA,
		schemaVersion: 2,
		id: "creator-story",
		version: "2.0.0",
		name: "Creator Story",
		description: "Two-shot social opener with headline and follow-up label.",
		defaultAspectRatio: "9:16",
		supportedAspectRatios: ["9:16", "16:9", "1:1"],
		fonts: [{ family: "Inter", fallback: "Arial", required: true }],
		slots: [
			{
				id: "hero",
				kind: "media",
				label: "Opening shot",
				required: true,
				acceptedTypes: ["video", "image"],
			},
			{
				id: "broll",
				kind: "media",
				label: "Second shot",
				required: true,
				acceptedTypes: ["video", "image"],
			},
			{
				id: "headline",
				kind: "text",
				label: "Headline",
				required: true,
				defaultValue: "Watch this",
			},
			{
				id: "secondary",
				kind: "text",
				label: "Follow-up",
				required: true,
				defaultValue: "Here is why it matters",
			},
		],
		variants: [
			createCreatorVariant({
				aspectRatio: "9:16",
				canvas: { width: 1080, height: 1920 },
				headline: { y: -24, width: 820, fontSize: 72 },
				secondary: { y: 29, width: 820 },
			}),
			createCreatorVariant({
				aspectRatio: "16:9",
				canvas: { width: 1920, height: 1080 },
				headline: { y: -22, width: 1120, fontSize: 82 },
				secondary: { y: 28, width: 920 },
			}),
			createCreatorVariant({
				aspectRatio: "1:1",
				canvas: { width: 1080, height: 1080 },
				headline: { y: -20, width: 860, fontSize: 72 },
				secondary: { y: 27, width: 780 },
			}),
		],
		migrations: [
			{
				fromVersion: "1.0.0",
				toVersion: "2.0.0",
				slotAliases: { title: "headline", body: "secondary" },
			},
		],
	},
	{
		schema: TIMELINE_TEMPLATE_SCHEMA,
		schemaVersion: 2,
		id: "product-promo",
		version: "1.1.0",
		name: "Product Promo",
		description: "Product reveal, detail shot, editorial headline and CTA.",
		defaultAspectRatio: "16:9",
		supportedAspectRatios: ["16:9", "9:16", "4:5"],
		fonts: [
			{ family: "Inter", fallback: "Arial", required: true },
			{
				family: "Playfair Display",
				fallback: "Georgia",
				required: false,
			},
		],
		slots: [
			{
				id: "product",
				kind: "media",
				label: "Product reveal",
				required: true,
				acceptedTypes: ["video", "image"],
			},
			{
				id: "detail",
				kind: "media",
				label: "Detail shot",
				required: true,
				acceptedTypes: ["video", "image"],
			},
			{
				id: "headline",
				kind: "text",
				label: "Product headline",
				required: true,
				defaultValue: "Designed for the moment",
			},
			{
				id: "cta",
				kind: "text",
				label: "Call to action",
				required: true,
				defaultValue: "Discover more",
			},
		],
		variants: [
			createProductVariant({
				aspectRatio: "16:9",
				canvas: { width: 1920, height: 1080 },
				headlineY: -26,
				ctaY: 31,
				textWidth: 1120,
			}),
			createProductVariant({
				aspectRatio: "9:16",
				canvas: { width: 1080, height: 1920 },
				headlineY: -28,
				ctaY: 33,
				textWidth: 820,
			}),
			createProductVariant({
				aspectRatio: "4:5",
				canvas: { width: 1080, height: 1350 },
				headlineY: -24,
				ctaY: 30,
				textWidth: 880,
			}),
		],
	},
];

for (const template of TIMELINE_TEMPLATES) {
	const validation = validateTimelineTemplate({ template });
	if (!validation.valid) {
		throw new Error(
			`Invalid built-in template ${template.id}: ${validation.issues
				.map((issue) => issue.message)
				.join(", ")}`
		);
	}
}

export function getTimelineTemplate({
	templateId,
}: {
	templateId: string;
}): TimelineTemplate | undefined {
	return TIMELINE_TEMPLATES.find((template) => template.id === templateId);
}

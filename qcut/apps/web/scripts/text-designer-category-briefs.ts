export type TextDesignerCategoryDesignBrief = {
	templateDirection: string;
	thumbnailDirection: string;
	visualGoal: string;
};

export const DEFAULT_TEXT_DESIGNER_CATEGORY_DESIGN_BRIEF = {
	templateDirection:
		"Keep the text editable, centered in the safe area, and reusable across short-video canvases.",
	thumbnailDirection:
		"Export a transparent or dark-compatible WebP preview that clearly shows the final text effect at library-card size.",
	visualGoal:
		"Create a polished designer text asset that is visibly distinct from the generated fallback.",
} as const satisfies TextDesignerCategoryDesignBrief;

export const TEXT_DESIGNER_CATEGORY_DESIGN_BRIEFS: Readonly<
	Record<string, TextDesignerCategoryDesignBrief>
> = {
	"black-white": {
		templateDirection:
			"Use high-contrast strokes, cutout shadows, or editorial poster typography without adding color dependency.",
		thumbnailDirection:
			"Show crisp white/black layering with visible contour, shadow, and edge separation.",
		visualGoal:
			"Classic high-contrast title cards for serious, review, and comparison content.",
	},
	blue: {
		templateDirection:
			"Use cool highlights, tech panels, ice edges, or knowledge-video accents while keeping text legible.",
		thumbnailDirection:
			"Make the blue tone immediately recognizable with glow, bevel, or frosted edges.",
		visualGoal:
			"Tech, tutorial, and knowledge-video text with a cool premium feel.",
	},
	glow: {
		templateDirection:
			"Use layered bloom, neon outlines, and luminous shadows without flattening the editable text.",
		thumbnailDirection:
			"Show a clear neon halo and dark-scene contrast, similar to marketplace glow assets.",
		visualGoal:
			"Night-scene and high-energy glowing text that reads at small card size.",
	},
	gradient: {
		templateDirection:
			"Use multi-stop color fills, shine passes, bevels, or glassy overlays with consistent edge contrast.",
		thumbnailDirection:
			"Make the gradient direction and highlight treatment obvious in the thumbnail.",
		visualGoal:
			"Glossy gradient text for modern creator covers and promotional moments.",
	},
	green: {
		templateDirection:
			"Use fresh, natural, outdoor, or lifestyle accents while avoiding low-contrast green-on-dark text.",
		thumbnailDirection:
			"Show freshness through leaf-like shapes, soft highlights, or clean green outlines.",
		visualGoal: "Fresh lifestyle, travel, food, and shop-visit text assets.",
	},
	guofeng: {
		templateDirection:
			"Use ink, seal, brush, paper, or guochao motifs while keeping the text editable and modern.",
		thumbnailDirection:
			"Make brush texture, seal red, or ink-paper contrast visible without muddy edges.",
		visualGoal:
			"Chinese-style designer text with cultural texture and short-video punch.",
	},
	latest: {
		templateDirection:
			"Use launch, badge, new-arrival, or editorial accents that work for release announcements.",
		thumbnailDirection:
			"Make the asset feel new and sharp through badge shapes, shine, or clean announcement framing.",
		visualGoal: "New-arrival and update text assets for fast browsing.",
	},
	pink: {
		templateDirection:
			"Use sweet, cute, heart, candy, or soft sticker styling without sacrificing stroke readability.",
		thumbnailDirection:
			"Show pink softness with clear white edge separation and playful accent shapes.",
		visualGoal: "Cute lifestyle and sweet creator text assets.",
	},
	popular: {
		templateDirection:
			"Use bold cover-style hierarchy, stickers, burst shapes, or strong outlines for high click-through contexts.",
		thumbnailDirection:
			"Make the thumbnail feel like a finished hot-list asset, not a plain styled word.",
		visualGoal:
			"Hot, recommended, and cover-ready text assets that look marketplace-selected.",
	},
	purple: {
		templateDirection:
			"Use dreamy, premium, or fantasy accents with enough contrast for small previews.",
		thumbnailDirection:
			"Show purple depth through glow, bevel, glass, or gradient layers.",
		visualGoal:
			"Dreamy premium text for beauty, mood, and polished creator videos.",
	},
	red: {
		templateDirection:
			"Use sale, warning, fire, or hot-list treatments with strong edges and energetic emphasis.",
		thumbnailDirection:
			"Make red urgency obvious with burst, flame, sticker, or price-promo accents.",
		visualGoal:
			"Commerce, live-selling, and urgent cover text with strong red impact.",
	},
	summer: {
		templateDirection:
			"Use fresh seasonal colors, water, sun, fruit, or travel accents while keeping text reusable.",
		thumbnailDirection:
			"Show a bright seasonal feeling with clean contrast and light decorative elements.",
		visualGoal: "Summer campaign and travel/lifestyle text assets.",
	},
	texture: {
		templateDirection:
			"Use material surfaces such as grain, paper, chrome, torn edges, or tactile shadows.",
		thumbnailDirection:
			"Make the texture readable at asset-card scale with visible surface detail.",
		visualGoal:
			"Premium material text assets with clear designer-made texture.",
	},
	variety: {
		templateDirection:
			"Use pop-show, reaction, comic, barrage, or exaggerated entertainment styling.",
		thumbnailDirection:
			"Show motion-like energy through bursts, offsets, stickers, or layered comic shapes.",
		visualGoal: "Variety-show and entertainment text with playful high energy.",
	},
	yellow: {
		templateDirection:
			"Use highlight, price, warning, or bright-cover styling with strong dark or white outlines.",
		thumbnailDirection:
			"Make the yellow pop while preserving edge contrast and small-size readability.",
		visualGoal:
			"Eye-catching highlight text for cover, price, and callout moments.",
	},
	"headline-template": {
		templateDirection:
			"Design a complete title group with kicker, headline, subhead, and decorations aligned as one reusable pack.",
		thumbnailDirection:
			"Preview the full title/subtitle/decorative composition, not only the headline word.",
		visualGoal:
			"Editorial headline template packs with clear multi-line hierarchy.",
	},
	"list-template": {
		templateDirection:
			"Design repeatable list rows, numbering, check marks, or bullets with editable line text.",
		thumbnailDirection:
			"Show at least two list rows and the decorative list system in the thumbnail.",
		visualGoal:
			"List and checklist template packs for explainers and recommendations.",
	},
	"quote-template": {
		templateDirection:
			"Design quotation marks, speaker labels, or pull-quote framing around editable quote text.",
		thumbnailDirection:
			"Show the quote frame and text relationship clearly at card size.",
		visualGoal: "Pull-quote and citation template packs with refined framing.",
	},
	"split-template": {
		templateDirection:
			"Design two-column or before/after structures with clear visual separation and editable labels.",
		thumbnailDirection:
			"Show both sides of the comparison with visible divider or panel treatment.",
		visualGoal:
			"Split-screen comparison template packs for contrast and analysis.",
	},
	"timeline-template": {
		templateDirection:
			"Design staged steps, dots, connectors, or timeline labels with editable milestone text.",
		thumbnailDirection:
			"Show the connector structure and at least three timeline points in the card preview.",
		visualGoal:
			"Timeline and process template packs for structured storytelling.",
	},
};

export function getTextDesignerCategoryDesignBrief({
	category,
}: {
	category?: string;
}): TextDesignerCategoryDesignBrief {
	if (!category) return DEFAULT_TEXT_DESIGNER_CATEGORY_DESIGN_BRIEF;
	return (
		TEXT_DESIGNER_CATEGORY_DESIGN_BRIEFS[category] ??
		DEFAULT_TEXT_DESIGNER_CATEGORY_DESIGN_BRIEF
	);
}

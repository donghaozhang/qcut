import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import {
	getThumbnailPreviewContent,
	getTextTemplatePackPreviewBounds,
	getTextTemplatePackPreviewDecorationVisualRect,
	getTextTemplatePackPreviewElementVisualRect,
	getTextTemplatePackPreviewModel,
	getTextTemplateThumbnailLayoutKind,
	getTextTemplateThumbnailRecipe,
	type TextTemplatePackPreviewBounds,
	type TextTemplatePackPreviewDecoration,
	type TextTemplatePackPreviewElement,
} from "../src/components/editor/media-panel/views/text-template-thumbnail-renderer";
import {
	compareTextTemplatesByMarketplaceOrder,
	getTextTemplateMarketplaceMetadata,
	isTextTemplateMarketplaceRecommended,
} from "../src/lib/text/text-marketplace-metadata";
import { getTextTemplateResource } from "../src/lib/text/text-resource-catalog";
import { buildTextTemplatePack } from "../src/lib/text/text-template-packs";
import {
	buildTextTemplate,
	TEXT_TEMPLATE_DEFINITIONS,
	type TextTemplateDefinition,
	usesTransparentTextTemplateBackground,
} from "../src/lib/text/text-template-registry";

type TextAssetFile = {
	url: string;
	mimeType: string;
	byteSize: number;
	checksumSha256: string;
};

type TextAssetManifestEntry = {
	assetId: string;
	packageId: string;
	version: number;
	cacheKey: string;
	provenance: typeof GENERATED_TEXT_ASSET_PROVENANCE;
	thumbnail: TextAssetFile;
	source: TextAssetFile;
	qcutPackage: TextAssetFile;
};

type TextAssetPackageResourceFile = TextAssetFile & {
	path: string;
	role: "source" | "thumbnail";
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SCRIPT_DIR, "../public");
const MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 304;

export const GENERATED_TEXT_ASSET_PROVENANCE = {
	source: "generated" as const,
	pipeline: "qcut-canvas-thumbnail-v1",
};

function escapeXml({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function hashBytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function publicUrl({
	cacheKey,
	filename,
}: {
	cacheKey: string;
	filename: string;
}) {
	return `/${cacheKey}/${filename}`;
}

function filePathForPublicUrl({ url }: { url: string }): string {
	return join(PUBLIC_DIR, url.replace(/^\/+/, ""));
}

function thumbnailPreviewText({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	return getThumbnailPreviewContent({
		definition,
		template: buildTextTemplate({ definition }),
	});
}

function paletteForDefinition({
	definition,
}: {
	definition: TextTemplateDefinition;
}) {
	const colorByCategory: Partial<
		Record<TextTemplateDefinition["category"], readonly string[]>
	> = {
		red: ["#3f0303", "#dc2626", "#f97316", "#fff7ed"],
		yellow: ["#422006", "#eab308", "#facc15", "#111827"],
		blue: ["#172554", "#2563eb", "#38bdf8", "#eff6ff"],
		green: ["#052e16", "#16a34a", "#84cc16", "#f0fdf4"],
		pink: ["#500724", "#db2777", "#f9a8d4", "#fff1f2"],
		purple: ["#2e1065", "#7c3aed", "#c084fc", "#faf5ff"],
		"black-white": ["#050505", "#525252", "#f5f5f5", "#ffffff"],
		gradient: ["#581c87", "#9333ea", "#fb7185", "#fff7ed"],
		glow: ["#083344", "#06b6d4", "#f0abfc", "#ecfeff"],
		texture: ["#1c1917", "#78716c", "#fbbf24", "#fafaf9"],
	};
	return (
		colorByCategory[definition.category] ?? [
			"#111827",
			"#2563eb",
			"#facc15",
			"#ffffff",
		]
	);
}

function recipeColors({
	definition,
}: {
	definition: TextTemplateDefinition;
}): readonly string[] {
	const recipe = getTextTemplateThumbnailRecipe({ definition });
	if (recipe.backgroundKind !== "solid") return recipe.accentColors;
	return paletteForDefinition({ definition });
}

function stableNumber({
	modulo,
	seed,
}: {
	modulo: number;
	seed: string;
}): number {
	const digest = createHash("sha256").update(seed).digest();
	return digest.readUInt32BE(0) % modulo;
}

function stableUnit({ index, seed }: { index: number; seed: string }): number {
	return stableNumber({ modulo: 10_000, seed: `${seed}:${index}` }) / 10_000;
}

function designSignatureSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	const seed = `${definition.id}:${definition.category}:${definition.variantId}`;
	const [, mid, light, accent] = recipeColors({ definition });
	const angle = -26 + stableNumber({ modulo: 52, seed: `${seed}:angle` });
	const stripeOffset = stableNumber({ modulo: 38, seed: `${seed}:stripe` });
	const badgeX = 20 + stableNumber({ modulo: 242, seed: `${seed}:badge-x` });
	const badgeY = 18 + stableNumber({ modulo: 212, seed: `${seed}:badge-y` });
	const shapeCount =
		4 + stableNumber({ modulo: 4, seed: `${seed}:shape-count` });
	const shapes = Array.from({ length: shapeCount }, (_, index) => {
		const x = Math.round(18 + stableUnit({ index, seed }) * 284);
		const y = Math.round(18 + stableUnit({ index: index + 8, seed }) * 250);
		const radius = 7 + stableNumber({ modulo: 16, seed: `${seed}:r:${index}` });
		const opacity = (0.12 + stableUnit({ index: index + 16, seed }) * 0.22)
			.toFixed(2)
			.replace(/^0/, "");
		if (index % 3 === 0) {
			return `<path d="M${x} ${y - radius} L${x + radius} ${y} L${x} ${y + radius} L${x - radius} ${y} Z" fill="${index % 2 === 0 ? light : accent}" opacity="${opacity}"/>`;
		}
		return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${index % 2 === 0 ? accent : mid}" opacity="${opacity}"/>`;
	}).join("");
	const marker = escapeXml({
		value: definition.variantId
			.split("-")
			.map((part) => part[0] ?? "")
			.join("")
			.slice(0, 2)
			.toLocaleUpperCase(),
	});
	return `<g opacity=".9">
<g transform="rotate(${angle} 160 152)">
<path d="M${-70 + stripeOffset} 34 H390" stroke="${light}" stroke-width="3" stroke-opacity=".18" stroke-linecap="round"/>
<path d="M${-108 + stripeOffset} 88 H362" stroke="${accent}" stroke-width="2" stroke-opacity=".16" stroke-linecap="round"/>
<path d="M${-44 + stripeOffset} 236 H382" stroke="${mid}" stroke-width="4" stroke-opacity=".16" stroke-linecap="round"/>
</g>
${shapes}
<g transform="translate(${badgeX} ${badgeY}) rotate(${angle / 4})">
<rect x="0" y="0" width="44" height="21" rx="8" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
<text x="22" y="15" text-anchor="middle" font-size="11" font-weight="900" fill="${light}" opacity=".72">${marker}</text>
</g>
</g>`;
}

function backgroundSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	const recipe = getTextTemplateThumbnailRecipe({ definition });
	const [dark, mid, light, accent] = recipeColors({ definition });
	if (recipe.backgroundKind === "burst" || recipe.backgroundKind === "comic") {
		const rays = Array.from({ length: 28 }, (_, index) => {
			const start = (index * 360) / 28;
			const end = ((index + 0.62) * 360) / 28;
			const largeArc = end - start > 180 ? 1 : 0;
			const startX = 160 + Math.cos((start * Math.PI) / 180) * 260;
			const startY = 152 + Math.sin((start * Math.PI) / 180) * 260;
			const endX = 160 + Math.cos((end * Math.PI) / 180) * 260;
			const endY = 152 + Math.sin((end * Math.PI) / 180) * 260;
			return `<path d="M160 152 L${startX.toFixed(1)} ${startY.toFixed(1)} A260 260 0 ${largeArc} 1 ${endX.toFixed(1)} ${endY.toFixed(1)} Z" fill="${index % 2 === 0 ? dark : mid}"/>`;
		}).join("");
		return `<rect width="320" height="304" rx="22" fill="${dark}"/>${rays}<ellipse cx="160" cy="154" rx="124" ry="86" fill="${light}" opacity=".18"/>`;
	}
	if (recipe.backgroundKind === "pixel") {
		const blocks = Array.from({ length: 54 }, (_, index) => {
			const x = (index * 47) % 320;
			const y = (index * 31) % 304;
			const size = 8 + (index % 4) * 4;
			return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${index % 2 === 0 ? light : accent}" opacity=".18"/>`;
		}).join("");
		return `<rect width="320" height="304" rx="22" fill="${dark}"/><rect width="320" height="304" rx="22" fill="url(#bg)"/>${blocks}`;
	}
	if (
		recipe.backgroundKind === "paper" ||
		recipe.backgroundKind === "texture"
	) {
		const fibers = Array.from({ length: 34 }, (_, index) => {
			const x = 14 + ((index * 41) % 292);
			const y = 20 + ((index * 29) % 252);
			return `<path d="M${x} ${y} q${12 + (index % 7) * 3} ${-8 + (index % 5) * 4} ${34 + (index % 6) * 4} ${2 + (index % 3) * 5}" fill="none" stroke="${index % 2 === 0 ? light : accent}" stroke-width="${1 + (index % 3)}" opacity=".18"/>`;
		}).join("");
		return `<rect width="320" height="304" rx="22" fill="${mid}"/><path d="M0 68 C54 32 94 82 150 48 C204 16 248 54 320 24 V304 H0 Z" fill="${light}" opacity=".12"/>${fibers}`;
	}
	if (recipe.backgroundKind === "glitch") {
		const bands = Array.from({ length: 14 }, (_, index) => {
			const y = 18 + index * 20;
			const width = 72 + ((index * 31) % 160);
			const x = (index * 47) % 240;
			return `<rect x="${x}" y="${y}" width="${width}" height="${4 + (index % 4)}" fill="${index % 2 === 0 ? light : accent}" opacity=".28"/>`;
		}).join("");
		return `<rect width="320" height="304" rx="22" fill="${dark}"/><rect x="0" y="0" width="320" height="304" fill="url(#bg)" opacity=".72"/>${bands}`;
	}
	if (recipe.backgroundKind === "fire" || recipe.backgroundKind === "lava") {
		const flames = Array.from({ length: 12 }, (_, index) => {
			const x = 18 + index * 27;
			const height = 54 + (index % 5) * 18;
			return `<path d="M${x} 268 C${x - 14} ${236 - height / 3} ${x + 8} ${220 - height} ${x + 22} ${190 - height / 2} C${x + 38} ${224 - height / 2} ${x + 46} 240 ${x + 34} 268 Z" fill="${index % 2 === 0 ? accent : light}" opacity=".3"/>`;
		}).join("");
		return `<rect width="320" height="304" rx="22" fill="${dark}"/><rect width="320" height="304" rx="22" fill="url(#bg)"/>${flames}`;
	}
	return `<rect width="320" height="304" rx="22" fill="url(#bg)"/><path d="M30 78 C82 42 126 92 181 55 C229 24 263 63 294 32" fill="none" stroke="${light}" stroke-opacity=".24" stroke-width="18" stroke-linecap="round"/>`;
}

function ornamentSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	const recipe = getTextTemplateThumbnailRecipe({ definition });
	const [, mid, light, accent] = recipeColors({ definition });
	if (recipe.ornamentKind === "fire") {
		return `<path d="M64 92 C52 56 82 48 82 22 C112 54 132 70 118 110" fill="${accent}" opacity=".82"/><path d="M228 98 C216 66 246 52 244 30 C278 66 288 86 270 122" fill="${light}" opacity=".74"/>`;
	}
	if (recipe.ornamentKind === "glitch") {
		return `<text x="160" y="158" text-anchor="middle" dominant-baseline="middle" font-size="94" font-weight="900" fill="${accent}" opacity=".42" transform="translate(-8 0)">花字</text><text x="160" y="158" text-anchor="middle" dominant-baseline="middle" font-size="94" font-weight="900" fill="${light}" opacity=".34" transform="translate(8 3)">花字</text>`;
	}
	if (recipe.ornamentKind === "burst-rays") {
		return `<path d="M160 38 l16 42 44-24-24 44 48 8-48 14 30 40-50-18-16 44-16-44-50 18 30-40-48-14 48-8-24-44 44 24Z" fill="${accent}" opacity=".26"/>`;
	}
	if (recipe.ornamentKind === "torn-paper") {
		return `<path d="M24 108 L72 96 L104 114 L146 92 L188 110 L236 94 L296 112 L292 232 L248 218 L210 238 L166 220 L116 236 L78 216 L26 230 Z" fill="${light}" opacity=".88"/><path d="M24 108 L72 96 L104 114 L146 92 L188 110 L236 94 L296 112" fill="none" stroke="${mid}" stroke-width="4" opacity=".4"/>`;
	}
	if (
		recipe.ornamentKind === "confetti" ||
		recipe.ornamentKind === "sparkles"
	) {
		return Array.from({ length: 24 }, (_, index) => {
			const x = 18 + ((index * 37) % 284);
			const y = 20 + ((index * 53) % 250);
			const radius = 2 + (index % 5);
			if (recipe.ornamentKind === "sparkles" && index % 3 === 0) {
				return `<path d="M${x} ${y - radius * 2} L${x + radius} ${y} L${x} ${y + radius * 2} L${x - radius} ${y} Z" fill="${index % 2 === 0 ? light : accent}" opacity=".6"/>`;
			}
			return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${index % 2 === 0 ? light : accent}" opacity=".34"/>`;
		}).join("");
	}
	if (recipe.ornamentKind === "sticker") {
		return `<path d="M44 202 C24 150 52 84 112 74 C154 42 230 56 256 112 C304 148 286 230 218 238 C164 270 82 254 44 202Z" fill="#fff" opacity=".9"/>`;
	}
	if (recipe.ornamentKind === "grain") {
		return Array.from({ length: 44 }, (_, index) => {
			const x = 10 + ((index * 43) % 300);
			const y = 14 + ((index * 61) % 276);
			return `<circle cx="${x}" cy="${y}" r="${1 + (index % 3)}" fill="${index % 2 === 0 ? light : accent}" opacity=".16"/>`;
		}).join("");
	}
	return "";
}

function thumbnailSceneSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	if (usesTransparentTextTemplateBackground({ groupId: definition.groupId })) {
		return "";
	}
	return `${backgroundSvg({ definition })}
${designSignatureSvg({ definition })}
${ornamentSvg({ definition })}`;
}

function textFillUrl({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	const recipe = getTextTemplateThumbnailRecipe({ definition });
	if (recipe.textFillKind === "chrome") return "url(#chromeText)";
	if (recipe.textFillKind === "gold") return "url(#goldText)";
	if (recipe.textFillKind === "hot") return "url(#hotText)";
	if (recipe.textFillKind === "ice") return "url(#iceText)";
	if (recipe.textFillKind === "neon") return "url(#neonText)";
	if (recipe.textFillKind === "pastel") return "url(#pastelText)";
	if (recipe.textFillKind === "texture") return "url(#textureText)";
	const [, , , accent] = recipeColors({ definition });
	return accent;
}

function thumbnailAccentStrokeColor({
	definition,
	fallback,
	usesTransparentBackground,
}: {
	definition: TextTemplateDefinition;
	fallback: string;
	usesTransparentBackground: boolean;
}): string {
	if (!usesTransparentBackground) return fallback;
	if (definition.variantId === "red-burst") return "#111827";
	if (definition.variantId === "sticker") return "#ffffff";
	return fallback;
}

function packContent({
	definition,
	fallback,
	index,
}: {
	definition: TextTemplateDefinition;
	fallback: string;
	index: number;
}): string {
	const baseTemplate = buildTextTemplate({ definition });
	const pack = buildTextTemplatePack({ baseTemplate, definition });
	return pack?.elements[index]?.content ?? fallback;
}

function compactSvgText({
	definition,
	fallback,
	index,
	maxCharacters = 8,
}: {
	definition: TextTemplateDefinition;
	fallback: string;
	index: number;
	maxCharacters?: number;
}): string {
	const content = packContent({ definition, fallback, index }).trim();
	const characters = Array.from(content || fallback);
	return escapeXml({
		value:
			characters.length > maxCharacters
				? `${characters.slice(0, maxCharacters).join("")}…`
				: characters.join(""),
	});
}

function packBodySvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	if (definition.category === "quote-template") {
		const mark = compactSvgText({
			definition,
			fallback: "“",
			index: 0,
			maxCharacters: 1,
		});
		const quote = compactSvgText({
			definition,
			fallback: "金句",
			index: 1,
			maxCharacters: 5,
		});
		const attribution = compactSvgText({
			definition,
			fallback: "— 观点摘录",
			index: 2,
			maxCharacters: 7,
		});
		return `<text x="76" y="116" font-size="86" font-weight="900" fill="var(--accent)" filter="url(#shadow)">${mark}</text>
<text x="126" y="156" font-size="46" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.68)" stroke-width="4" stroke-linejoin="round">${quote}</text>
<text x="132" y="214" font-size="23" font-weight="800" fill="var(--mid)">${attribution}</text>`;
	}
	if (definition.category === "list-template") {
		const title = compactSvgText({
			definition,
			fallback: "清单",
			index: 0,
			maxCharacters: 5,
		});
		const itemOne = compactSvgText({
			definition,
			fallback: "关键动作",
			index: 1,
			maxCharacters: 7,
		});
		const itemTwo = compactSvgText({
			definition,
			fallback: "避坑提醒",
			index: 2,
			maxCharacters: 7,
		});
		return `<text x="64" y="98" font-size="42" font-weight="900" fill="var(--light)" stroke="#111" stroke-width="8" stroke-linejoin="round">${title}</text>
<circle cx="72" cy="154" r="15" fill="var(--accent)"/><text x="72" y="160" text-anchor="middle" font-size="15" font-weight="900" fill="#020617">01</text><text x="104" y="162" font-size="22" font-weight="850" fill="var(--light)" stroke="rgba(0,0,0,.48)" stroke-width="2" stroke-linejoin="round">${itemOne}</text>
<circle cx="72" cy="204" r="15" fill="var(--accent)"/><text x="72" y="210" text-anchor="middle" font-size="15" font-weight="900" fill="#020617">02</text><text x="104" y="212" font-size="22" font-weight="850" fill="var(--light)" stroke="rgba(0,0,0,.42)" stroke-width="2" stroke-linejoin="round">${itemTwo}</text>`;
	}
	if (definition.category === "split-template") {
		const left = compactSvgText({
			definition,
			fallback: "之前",
			index: 0,
			maxCharacters: 3,
		});
		const right = compactSvgText({
			definition,
			fallback: "之后",
			index: 1,
			maxCharacters: 3,
		});
		const middle = compactSvgText({
			definition,
			fallback: "VS",
			index: 2,
			maxCharacters: 2,
		});
		return `<rect x="48" y="88" width="92" height="132" rx="18" fill="rgba(0,0,0,.36)"/><rect x="180" y="88" width="92" height="132" rx="18" fill="rgba(255,255,255,.22)"/>
<text x="94" y="160" text-anchor="middle" font-size="30" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.66)" stroke-width="3">${left}</text>
<text x="226" y="160" text-anchor="middle" font-size="30" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.66)" stroke-width="3">${right}</text>
<text x="160" y="166" text-anchor="middle" font-size="40" font-weight="900" fill="var(--accent)" stroke="rgba(0,0,0,.68)" stroke-width="4">${middle}</text>`;
	}
	if (definition.category === "timeline-template") {
		const stageOne = compactSvgText({
			definition,
			fallback: "1",
			index: 0,
			maxCharacters: 3,
		});
		const stageTwo = compactSvgText({
			definition,
			fallback: "阶段",
			index: 1,
			maxCharacters: 3,
		});
		const stageThree = compactSvgText({
			definition,
			fallback: "结果",
			index: 2,
			maxCharacters: 3,
		});
		return `<path d="M66 154 H254" stroke="rgba(255,255,255,.72)" stroke-width="6" stroke-linecap="round"/>
<circle cx="66" cy="154" r="18" fill="var(--mid)"/><circle cx="160" cy="154" r="25" fill="var(--accent)"/><circle cx="254" cy="154" r="18" fill="var(--mid)"/>
<text x="66" y="212" text-anchor="middle" font-size="18" font-weight="900" fill="var(--light)">${stageOne}</text>
<text x="160" y="161" text-anchor="middle" font-size="18" font-weight="900" fill="#020617">${stageTwo}</text>
<text x="254" y="212" text-anchor="middle" font-size="18" font-weight="900" fill="var(--light)">${stageThree}</text>`;
	}
	const kicker = compactSvgText({
		definition,
		fallback: "本期重点",
		index: 0,
		maxCharacters: 5,
	});
	const headline = compactSvgText({
		definition,
		fallback: "标题",
		index: 1,
		maxCharacters: 5,
	});
	const subhead = compactSvgText({
		definition,
		fallback: "三句话讲清楚",
		index: 2,
		maxCharacters: 7,
	});
	return `<rect x="60" y="64" width="114" height="38" rx="14" fill="var(--accent)" filter="url(#shadow)"/>
<text x="117" y="89" text-anchor="middle" font-size="21" font-weight="900" fill="#020617">${kicker}</text>
<text x="60" y="168" font-size="42" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.68)" stroke-width="5" stroke-linejoin="round">${headline}</text>
<text x="64" y="220" font-size="24" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.6)" stroke-width="2.5" stroke-linejoin="round">${subhead}</text>`;
}

function mapPackPreviewSvgRect({
	bounds,
	rect,
}: {
	bounds: TextTemplatePackPreviewBounds;
	rect: {
		height: number;
		width: number;
		x: number;
		y: number;
	};
}) {
	const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
	const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
	const target = {
		height: THUMBNAIL_HEIGHT * 0.68,
		width: THUMBNAIL_WIDTH * 0.76,
		x: THUMBNAIL_WIDTH * 0.12,
		y: THUMBNAIL_HEIGHT * 0.16,
	};
	const scale = Math.min(
		target.width / sourceWidth,
		target.height / sourceHeight
	);
	const scaledWidth = sourceWidth * scale;
	const scaledHeight = sourceHeight * scale;
	const offsetX = target.x + (target.width - scaledWidth) / 2;
	const offsetY = target.y + (target.height - scaledHeight) / 2;
	return {
		height: rect.height * scale,
		scale,
		width: rect.width * scale,
		x: offsetX + (rect.x - bounds.minX) * scale,
		y: offsetY + (rect.y - bounds.minY) * scale,
	};
}

function mapPackPreviewElementSvgRect({
	bounds,
	element,
}: {
	bounds: TextTemplatePackPreviewBounds;
	element: TextTemplatePackPreviewElement;
}) {
	return mapPackPreviewSvgRect({
		bounds,
		rect: getTextTemplatePackPreviewElementVisualRect({ element }),
	});
}

function mapPackPreviewDecorationSvgRect({
	bounds,
	decoration,
}: {
	bounds: TextTemplatePackPreviewBounds;
	decoration: TextTemplatePackPreviewDecoration;
}) {
	return mapPackPreviewSvgRect({
		bounds,
		rect: getTextTemplatePackPreviewDecorationVisualRect({ decoration }),
	});
}

function packPreviewTextAnchor({
	align,
}: {
	align: CanvasTextAlign;
}): "end" | "middle" | "start" {
	if (align === "left" || align === "start") return "start";
	if (align === "right" || align === "end") return "end";
	return "middle";
}

function packPreviewTextX({
	align,
	width,
	x,
}: {
	align: CanvasTextAlign;
	width: number;
	x: number;
}): number {
	if (align === "left" || align === "start") return x;
	if (align === "right" || align === "end") return x + width;
	return x + width / 2;
}

function truncateSvgPreviewText({
	maxCharacters,
	text,
}: {
	maxCharacters: number;
	text: string;
}): string {
	const characters = Array.from(text.trim());
	if (characters.length <= maxCharacters) return text.trim();
	return characters.slice(0, maxCharacters).join("");
}

function packPreviewElementSvg({
	element,
	index,
	rect,
}: {
	element: TextTemplatePackPreviewElement;
	index: number;
	rect: {
		height: number;
		scale: number;
		width: number;
		x: number;
		y: number;
	};
}): string {
	const fontSize = Math.max(13, Math.min(58, element.fontSize * rect.scale));
	const text = escapeXml({
		value: truncateSvgPreviewText({
			maxCharacters: Math.max(
				2,
				Math.floor(rect.width / Math.max(1, fontSize * 0.54))
			),
			text: element.content,
		}),
	});
	const textX = packPreviewTextX({
		align: element.textAlign,
		width: rect.width,
		x: rect.x,
	});
	const textY = rect.y + rect.height / 2;
	const anchor = packPreviewTextAnchor({ align: element.textAlign });
	const centerX = rect.x + rect.width / 2;
	const centerY = rect.y + rect.height / 2;
	const backgroundPadding = element.backgroundPadding * rect.scale;
	const background =
		element.backgroundColor &&
		element.backgroundColor !== "transparent" &&
		element.backgroundOpacity > 0
			? `<rect x="${rect.x - backgroundPadding * 0.45}" y="${rect.y - backgroundPadding * 0.22}" width="${rect.width + backgroundPadding * 0.9}" height="${rect.height + backgroundPadding * 0.45}" rx="${Math.max(4, element.backgroundRadius * rect.scale)}" fill="${element.backgroundColor}" opacity="${Math.min(1, element.backgroundOpacity)}"/>`
			: "";
	const accentStroke =
		element.strokeWidth > 0
			? `<text x="${textX}" y="${textY}" text-anchor="${anchor}" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="${element.strokeColor ?? "#ffffff"}" stroke-width="${Math.max(1, Math.min(8, element.strokeWidth * 0.75))}" stroke-linejoin="round" fill="none">${text}</text>`
			: "";
	return `<g data-preview-element="${escapeXml({ value: element.id })}" data-preview-layer="${index}" opacity="${Math.max(0.18, Math.min(1, element.opacity))}" transform="rotate(${element.rotation} ${centerX} ${centerY})">
${background}
<text x="${textX}" y="${textY}" text-anchor="${anchor}" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="rgba(0,0,0,.62)" stroke-width="${Math.max(2.5, fontSize * 0.12)}" stroke-linejoin="round">${text}</text>
${accentStroke}
<text x="${textX}" y="${textY}" text-anchor="${anchor}" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" fill="${element.color || "var(--light)"}">${text}</text>
</g>`;
}

function packPreviewDecorationSvg({
	decoration,
	index,
	rect,
}: {
	decoration: TextTemplatePackPreviewDecoration;
	index: number;
	rect: {
		height: number;
		scale: number;
		width: number;
		x: number;
		y: number;
	};
}): string {
	const opacity = Math.max(0.05, Math.min(1, decoration.opacity));
	const id = escapeXml({ value: decoration.id });
	if (decoration.kind === "line") {
		const strokeWidth = Math.max(2, Math.min(rect.width, rect.height));
		const line =
			decoration.y1 === decoration.y2
				? {
						x1: rect.x,
						x2: rect.x + rect.width,
						y1: rect.y + rect.height / 2,
						y2: rect.y + rect.height / 2,
					}
				: decoration.x1 === decoration.x2
					? {
							x1: rect.x + rect.width / 2,
							x2: rect.x + rect.width / 2,
							y1: rect.y,
							y2: rect.y + rect.height,
						}
					: {
							x1: rect.x,
							x2: rect.x + rect.width,
							y1: rect.y,
							y2: rect.y + rect.height,
						};
		return `<line data-preview-decoration="${id}" data-preview-decoration-index="${index}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${decoration.color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"/>`;
	}
	if (decoration.kind === "circle") {
		return `<circle data-preview-decoration="${id}" data-preview-decoration-index="${index}" cx="${rect.x + rect.width / 2}" cy="${rect.y + rect.height / 2}" r="${Math.min(rect.width, rect.height) / 2}" fill="${decoration.color}" opacity="${opacity}" filter="url(#shadow)"/>`;
	}
	return `<rect data-preview-decoration="${id}" data-preview-decoration-index="${index}" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="${Math.max(4, Math.min(rect.width, rect.height, decoration.radius * rect.scale))}" fill="${decoration.color}" opacity="${opacity}" filter="url(#shadow)"/>`;
}

function packPreviewSceneSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string | null {
	const template = buildTextTemplate({ definition });
	const model = getTextTemplatePackPreviewModel({ definition, template });
	if (!model || model.elements.length === 0) return null;
	const bounds = getTextTemplatePackPreviewBounds({
		decorations: model.decorations,
		elements: model.elements,
	});
	return `<g data-qcut-pack-preview="true" data-pack-kind="${model.kind}" data-layer-count="${model.layerCount}" data-decoration-count="${model.decorations.length}">
<rect x="32" y="42" width="256" height="220" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.24)" stroke-width="2" filter="url(#shadow)"/>
${model.decorations
	.map((decoration, index) => {
		const rect = mapPackPreviewDecorationSvgRect({ bounds, decoration });
		return packPreviewDecorationSvg({ decoration, index, rect });
	})
	.join("\n")}
${model.elements
	.map((element, index) => {
		const rect = mapPackPreviewElementSvgRect({ bounds, element });
		return packPreviewElementSvg({ element, index, rect });
	})
	.join("\n")}
</g>`;
}

function packThumbnailSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}) {
	const [dark, mid, light, accent] = recipeColors({ definition });
	const packPreview = packPreviewSceneSvg({ definition });
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}" style="--mid:${mid};--accent:${accent};--light:${light}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="0.58" stop-color="${mid}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.82)"/><stop offset="1" stop-color="rgba(255,255,255,.16)"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#000" flood-opacity="0.45"/></filter>
</defs>
${thumbnailSceneSvg({ definition })}
${
	packPreview ??
	`<rect x="32" y="42" width="256" height="220" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.24)" stroke-width="2" filter="url(#shadow)"/>
${packBodySvg({ definition })}`
}
</svg>`;
}

export function buildTextAssetThumbnailSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}) {
	if (getTextTemplateThumbnailLayoutKind({ definition }) === "pack") {
		return packThumbnailSvg({ definition });
	}
	const [dark, mid, light, accent] = recipeColors({ definition });
	const recipe = getTextTemplateThumbnailRecipe({ definition });
	const label = escapeXml({ value: thumbnailPreviewText({ definition }) });
	const rotate =
		definition.variantId.includes("italic") || recipe.backgroundKind === "ink"
			? -4
			: recipe.backgroundKind === "comic"
				? 3
				: 0;
	const fontSize = label.length > 2 ? 96 : 112;
	const template = buildTextTemplate({ definition });
	const usesTransparentBackground = usesTransparentTextTemplateBackground({
		groupId: definition.groupId,
	});
	const templateStrokeWidth = Math.max(
		6,
		Math.min(13, (template.strokeWidth ?? 1) * 1.9)
	);
	const outerStrokeWidth = usesTransparentBackground
		? templateStrokeWidth + 7
		: 18;
	const innerStrokeWidth = usesTransparentBackground
		? templateStrokeWidth + 3
		: 10;
	const accentStrokeWidth = usesTransparentBackground ? templateStrokeWidth : 5;
	const accentStrokeColor = thumbnailAccentStrokeColor({
		definition,
		fallback: mid,
		usesTransparentBackground,
	});
	const glowOpacity =
		recipe.textFillKind === "neon" || definition.category === "glow"
			? "0.85"
			: "0.45";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<linearGradient id="text" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="#fff"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<linearGradient id="chromeText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#737373"/><stop offset=".52" stop-color="#f5f5f5"/><stop offset=".76" stop-color="#262626"/><stop offset="1" stop-color="#fafafa"/></linearGradient>
<linearGradient id="goldText" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7ed"/><stop offset=".35" stop-color="#facc15"/><stop offset=".72" stop-color="#b45309"/><stop offset="1" stop-color="#fffbeb"/></linearGradient>
<linearGradient id="hotText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7ed"/><stop offset=".45" stop-color="#facc15"/><stop offset=".7" stop-color="#fb923c"/><stop offset="1" stop-color="#dc2626"/></linearGradient>
<linearGradient id="iceText" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".48" stop-color="#bae6fd"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
<linearGradient id="neonText" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ecfeff"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#f0abfc"/></linearGradient>
<linearGradient id="pastelText" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#f9a8d4"/><stop offset="1" stop-color="#c084fc"/></linearGradient>
<linearGradient id="textureText" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fafaf9"/><stop offset=".45" stop-color="#a8a29e"/><stop offset="1" stop-color="#57534e"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${accent}" flood-opacity="${glowOpacity}"/></filter>
</defs>
${thumbnailSceneSvg({ definition })}
<g transform="translate(160 158) rotate(${rotate})" filter="url(#shadow)">
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="#000" stroke-width="${outerStrokeWidth}" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="#fff" stroke-width="${innerStrokeWidth}" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="${accentStrokeColor}" stroke-width="${accentStrokeWidth}" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" fill="${textFillUrl({ definition })}">${label}</text>
<path d="M-92 -28 C-38 -54 34 -54 92 -28" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".28"/>
</g>
</svg>`;
}

async function svgToWebp({
	page,
	svg,
}: {
	page: Page;
	svg: string;
}): Promise<Buffer> {
	const base64 = await page.evaluate(
		async ({ height, svgSource, width }) => {
			const image = new Image();
			const loaded = new Promise<void>((resolve, reject) => {
				image.addEventListener("load", () => resolve(), { once: true });
				image.addEventListener(
					"error",
					() => reject(new Error("SVG load failed")),
					{
						once: true,
					}
				);
			});
			image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`;
			await loaded;
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d");
			if (!context) throw new Error("Canvas 2D context unavailable");
			context.drawImage(image, 0, 0, width, height);
			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(result) =>
						result ? resolve(result) : reject(new Error("WebP encode failed")),
					"image/webp",
					0.92
				);
			});
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = "";
			for (const byte of bytes) binary += String.fromCharCode(byte);
			return btoa(binary);
		},
		{ height: THUMBNAIL_HEIGHT, svgSource: svg, width: THUMBNAIL_WIDTH }
	);
	return Buffer.from(base64, "base64");
}

export function buildTextAssetSourcePayload({
	definition,
}: {
	definition: TextTemplateDefinition;
}) {
	const resource = getTextTemplateResource({ definition });
	const marketplace = getTextTemplateMarketplaceMetadata({ definition });
	const template = buildTextTemplate({ definition });
	const templatePack = buildTextTemplatePack({
		baseTemplate: template,
		definition,
	});
	return {
		schemaVersion: 1,
		assetId: resource.assetId,
		packageId: resource.packageId,
		version: resource.version,
		marketplace,
		definition: {
			id: definition.id,
			name: definition.name,
			category: definition.category,
			groupId: definition.groupId,
			variantId: definition.variantId,
			content: definition.content,
			stylePresetId: definition.stylePresetId,
			keywords: definition.keywords,
			premium: definition.premium,
			downloaded: definition.downloaded,
			resource,
			catalogVisible: definition.catalogVisible,
			overrides: definition.overrides,
		},
		template,
		templatePack: templatePack ?? undefined,
	};
}

export function buildTextAssetPackagePayload({
	definition,
	resources = [],
	source,
}: {
	definition: TextTemplateDefinition;
	resources?: readonly TextAssetPackageResourceFile[];
	source: ReturnType<typeof buildTextAssetSourcePayload>;
}) {
	const resource = getTextTemplateResource({ definition });
	return {
		schemaVersion: 1,
		kind: "qcut-text-template-package",
		assetId: resource.assetId,
		packageId: resource.packageId,
		version: resource.version,
		cacheKey: resource.cacheKey,
		files: {
			thumbnail: "thumbnail.webp",
			source: "template.json",
		},
		resources,
		source,
	};
}

export function buildTextMarketplaceConfigPayload({
	definitions,
}: {
	definitions: readonly TextTemplateDefinition[];
}) {
	const assets = definitions.map((definition) => {
		const resource = getTextTemplateResource({ definition });
		const marketplace = getTextTemplateMarketplaceMetadata({ definition });
		return {
			templateId: definition.id,
			assetId: resource.assetId,
			editorialRank: marketplace.editorialRank,
			heatScore: marketplace.heatScore,
			remoteTags: marketplace.remoteTags,
			searchAliases: marketplace.searchAliases,
		};
	});
	return {
		schemaVersion: 1,
		assets,
		sections: buildTextMarketplaceSections({ definitions }),
	};
}

const TEXT_MARKETPLACE_SECTION_LIMIT = 30;
const TEXT_MARKETPLACE_SECTION_SPECS = [
	{ id: "recommended", title: "推荐" },
	{ id: "commerce", title: "带货促销" },
	{ id: "cover", title: "封面标题" },
	{ id: "premium-look", title: "高级质感" },
] as const;

function buildTextMarketplaceSections({
	definitions,
}: {
	definitions: readonly TextTemplateDefinition[];
}) {
	const rankedDefinitions = [...definitions].sort((left, right) =>
		compareTextTemplatesByMarketplaceOrder({ left, right })
	);
	return TEXT_MARKETPLACE_SECTION_SPECS.map((section) => ({
		id: section.id,
		title: section.title,
		templateIds: rankedDefinitions
			.filter((definition) =>
				matchesMarketplaceSection({ definition, sectionId: section.id })
			)
			.slice(0, TEXT_MARKETPLACE_SECTION_LIMIT)
			.map((definition) => definition.id),
	})).filter((section) => section.templateIds.length > 0);
}

function matchesMarketplaceSection({
	definition,
	sectionId,
}: {
	definition: TextTemplateDefinition;
	sectionId: (typeof TEXT_MARKETPLACE_SECTION_SPECS)[number]["id"];
}): boolean {
	if (sectionId === "recommended") {
		return isTextTemplateMarketplaceRecommended({ definition });
	}
	const metadata = getTextTemplateMarketplaceMetadata({ definition });
	const tags = new Set(metadata.remoteTags);
	const aliases = new Set(metadata.searchAliases);
	if (sectionId === "commerce") {
		return (
			tags.has("scene:commerce") ||
			aliases.has("直播") ||
			aliases.has("秒杀") ||
			aliases.has("促销") ||
			aliases.has("价格")
		);
	}
	if (sectionId === "cover") {
		return tags.has("market:hero") || aliases.has("封面");
	}
	return (
		tags.has("market:premium-look") ||
		tags.has("tone:premium") ||
		tags.has("material:chrome") ||
		tags.has("material:gold")
	);
}

async function writeAsset({
	definition,
	page,
}: {
	definition: TextTemplateDefinition;
	page: Page;
}): Promise<TextAssetManifestEntry> {
	const resource = getTextTemplateResource({ definition });
	const thumbnailUrl = publicUrl({
		cacheKey: resource.cacheKey,
		filename: "thumbnail.webp",
	});
	const sourceUrl = publicUrl({
		cacheKey: resource.cacheKey,
		filename: "template.json",
	});
	const packageUrl = publicUrl({
		cacheKey: resource.cacheKey,
		filename: "template.qctext",
	});
	const thumbnailBytes = await svgToWebp({
		page,
		svg: buildTextAssetThumbnailSvg({ definition }),
	});
	const source = buildTextAssetSourcePayload({ definition });
	const sourceBytes = Buffer.from(
		`${JSON.stringify(source, null, "\t")}\n`,
		"utf8"
	);
	const packageBytes = Buffer.from(
		`${JSON.stringify(
			buildTextAssetPackagePayload({
				definition,
				resources: [
					{
						byteSize: thumbnailBytes.byteLength,
						checksumSha256: hashBytes({ bytes: thumbnailBytes }),
						mimeType: "image/webp",
						path: "thumbnail.webp",
						role: "thumbnail",
						url: thumbnailUrl,
					},
					{
						byteSize: sourceBytes.byteLength,
						checksumSha256: hashBytes({ bytes: sourceBytes }),
						mimeType: "application/json",
						path: "template.json",
						role: "source",
						url: sourceUrl,
					},
				],
				source,
			}),
			null,
			"\t"
		)}\n`,
		"utf8"
	);
	for (const url of [thumbnailUrl, sourceUrl, packageUrl]) {
		await mkdir(dirname(filePathForPublicUrl({ url })), { recursive: true });
	}
	await writeFile(filePathForPublicUrl({ url: thumbnailUrl }), thumbnailBytes);
	await writeFile(filePathForPublicUrl({ url: sourceUrl }), sourceBytes);
	await writeFile(filePathForPublicUrl({ url: packageUrl }), packageBytes);
	return {
		assetId: resource.assetId,
		packageId: resource.packageId,
		version: resource.version,
		cacheKey: resource.cacheKey,
		provenance: GENERATED_TEXT_ASSET_PROVENANCE,
		thumbnail: {
			url: thumbnailUrl,
			mimeType: "image/webp",
			byteSize: thumbnailBytes.byteLength,
			checksumSha256: hashBytes({ bytes: thumbnailBytes }),
		},
		source: {
			url: sourceUrl,
			mimeType: "application/json",
			byteSize: sourceBytes.byteLength,
			checksumSha256: hashBytes({ bytes: sourceBytes }),
		},
		qcutPackage: {
			url: packageUrl,
			mimeType: "application/vnd.qcut.text-template+json",
			byteSize: packageBytes.byteLength,
			checksumSha256: hashBytes({ bytes: packageBytes }),
		},
	};
}

async function writeMarketplaceConfig({
	definitions,
}: {
	definitions: readonly TextTemplateDefinition[];
}): Promise<void> {
	const marketplaceUrl = "/text-assets/marketplace.json";
	const marketplaceBytes = Buffer.from(
		`${JSON.stringify(buildTextMarketplaceConfigPayload({ definitions }), null, "\t")}\n`,
		"utf8"
	);
	await mkdir(dirname(filePathForPublicUrl({ url: marketplaceUrl })), {
		recursive: true,
	});
	await writeFile(
		filePathForPublicUrl({ url: marketplaceUrl }),
		marketplaceBytes
	);
}

async function main() {
	const definitions = TEXT_TEMPLATE_DEFINITIONS;
	await rm(join(PUBLIC_DIR, "text-assets"), { force: true, recursive: true });
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({
		deviceScaleFactor: 1,
		viewport: { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT },
	});
	const manifestEntries: Record<string, TextAssetManifestEntry> = {};
	try {
		for (const definition of definitions) {
			const entry = await writeAsset({ definition, page });
			manifestEntries[entry.assetId] = entry;
		}
	} finally {
		await browser.close();
	}
	await writeFile(
		MANIFEST_PATH,
		`${JSON.stringify(manifestEntries, null, "\t")}\n`,
		"utf8"
	);
	await writeMarketplaceConfig({ definitions });
	console.log(
		`Generated ${definitions.length} text assets at ${join(PUBLIC_DIR, "text-assets")}`
	);
}

if (
	process.env.VITEST !== "true" &&
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}

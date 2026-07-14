import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import {
	getThumbnailPreviewContent,
	getTextTemplateThumbnailLayoutKind,
	getTextTemplateThumbnailRecipe,
} from "../src/components/editor/media-panel/views/text-template-thumbnail-renderer";
import { getTextTemplateMarketplaceMetadata } from "../src/lib/text/text-marketplace-metadata";
import { getTextTemplateResource } from "../src/lib/text/text-resource-catalog";
import { buildTextTemplatePack } from "../src/lib/text/text-template-packs";
import {
	buildTextTemplate,
	TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
	type TextTemplateDefinition,
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
	thumbnail: TextAssetFile;
	source: TextAssetFile;
	qcutPackage: TextAssetFile;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SCRIPT_DIR, "../public");
const MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 304;

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

function packBodySvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}): string {
	if (definition.category === "quote-template") {
		return `<text x="76" y="116" font-size="86" font-weight="900" fill="var(--accent)" filter="url(#shadow)">“</text>
<text x="126" y="156" font-size="50" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.68)" stroke-width="4" stroke-linejoin="round">金句</text>
<text x="132" y="214" font-size="24" font-weight="800" fill="var(--mid)">— 观点摘录</text>`;
	}
	if (definition.category === "list-template") {
		return `<text x="64" y="98" font-size="46" font-weight="900" fill="var(--light)" stroke="#111" stroke-width="8" stroke-linejoin="round">清单</text>
<circle cx="72" cy="154" r="15" fill="var(--accent)"/><text x="72" y="160" text-anchor="middle" font-size="15" font-weight="900" fill="#020617">01</text><rect x="104" y="140" width="136" height="20" rx="8" fill="rgba(255,255,255,.25)"/>
<circle cx="72" cy="204" r="15" fill="var(--accent)"/><text x="72" y="210" text-anchor="middle" font-size="15" font-weight="900" fill="#020617">02</text><rect x="104" y="190" width="112" height="20" rx="8" fill="rgba(255,255,255,.2)"/>`;
	}
	if (definition.category === "split-template") {
		return `<rect x="48" y="88" width="92" height="132" rx="18" fill="rgba(0,0,0,.36)"/><rect x="180" y="88" width="92" height="132" rx="18" fill="rgba(255,255,255,.22)"/>
<text x="94" y="160" text-anchor="middle" font-size="30" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.66)" stroke-width="3">之前</text>
<text x="226" y="160" text-anchor="middle" font-size="30" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.66)" stroke-width="3">之后</text>
<text x="160" y="166" text-anchor="middle" font-size="40" font-weight="900" fill="var(--accent)" stroke="rgba(0,0,0,.68)" stroke-width="4">VS</text>`;
	}
	if (definition.category === "timeline-template") {
		return `<path d="M66 154 H254" stroke="rgba(255,255,255,.72)" stroke-width="6" stroke-linecap="round"/>
<circle cx="66" cy="154" r="18" fill="var(--mid)"/><circle cx="160" cy="154" r="25" fill="var(--accent)"/><circle cx="254" cy="154" r="18" fill="var(--mid)"/>
<text x="66" y="212" text-anchor="middle" font-size="20" font-weight="900" fill="var(--light)">1</text>
<text x="160" y="161" text-anchor="middle" font-size="20" font-weight="900" fill="#020617">阶段</text>
<text x="254" y="212" text-anchor="middle" font-size="20" font-weight="900" fill="var(--light)">结果</text>`;
	}
	return `<rect x="60" y="64" width="114" height="38" rx="14" fill="var(--accent)" filter="url(#shadow)"/>
<text x="117" y="89" text-anchor="middle" font-size="21" font-weight="900" fill="#020617">本期重点</text>
<text x="60" y="168" font-size="58" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.68)" stroke-width="5" stroke-linejoin="round">标题</text>
<text x="64" y="220" font-size="28" font-weight="900" fill="var(--light)" stroke="rgba(0,0,0,.6)" stroke-width="2.5" stroke-linejoin="round">三句话讲清楚</text>`;
}

function packThumbnailSvg({
	definition,
}: {
	definition: TextTemplateDefinition;
}) {
	const [dark, mid, light, accent] = recipeColors({ definition });
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}" style="--mid:${mid};--accent:${accent};--light:${light}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="0.58" stop-color="${mid}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.82)"/><stop offset="1" stop-color="rgba(255,255,255,.16)"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#000" flood-opacity="0.45"/></filter>
</defs>
${backgroundSvg({ definition })}
${ornamentSvg({ definition })}
<rect x="32" y="42" width="256" height="220" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.24)" stroke-width="2" filter="url(#shadow)"/>
${packBodySvg({ definition })}
</svg>`;
}

function thumbnailSvg({ definition }: { definition: TextTemplateDefinition }) {
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
${backgroundSvg({ definition })}
${ornamentSvg({ definition })}
<g transform="translate(160 158) rotate(${rotate})" filter="url(#shadow)">
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="#000" stroke-width="18" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="#fff" stroke-width="10" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="${mid}" stroke-width="5" stroke-linejoin="round">${label}</text>
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

function qcutPackagePayload({
	definition,
	source,
}: {
	definition: TextTemplateDefinition;
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
		source,
	};
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
		svg: thumbnailSvg({ definition }),
	});
	const source = buildTextAssetSourcePayload({ definition });
	const sourceBytes = Buffer.from(
		`${JSON.stringify(source, null, "\t")}\n`,
		"utf8"
	);
	const packageBytes = Buffer.from(
		`${JSON.stringify(qcutPackagePayload({ definition, source }), null, "\t")}\n`,
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

async function main() {
	const definitions = TEXT_TEMPLATE_LIBRARY_DEFINITIONS;
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

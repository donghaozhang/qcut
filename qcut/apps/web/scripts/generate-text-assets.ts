import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chromium, type Page } from "playwright";
import { getTextTemplateThumbnailLayoutKind } from "../src/components/editor/media-panel/views/text-template-thumbnail-renderer";
import { getTextTemplateResource } from "../src/lib/text/text-resource-catalog";
import {
	buildTextTemplate,
	TEXT_TEMPLATE_DEFINITIONS,
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

const PUBLIC_DIR = join(import.meta.dir, "../public");
const MANIFEST_PATH = join(
	import.meta.dir,
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

function previewText({ definition }: { definition: TextTemplateDefinition }) {
	if (definition.groupId === "fancy") return "花字";
	if (definition.category === "basic") return "文字";
	if (definition.content.length <= 4) return definition.content;
	return Array.from(definition.content).slice(0, 4).join("");
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
	const [dark, mid, accent, light] = paletteForDefinition({ definition });
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}" style="--mid:${mid};--accent:${accent};--light:${light}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="0.58" stop-color="${mid}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<linearGradient id="card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.82)"/><stop offset="1" stop-color="rgba(255,255,255,.16)"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#000" flood-opacity="0.45"/></filter>
</defs>
<rect width="320" height="304" rx="22" fill="url(#bg)"/>
<path d="M30 78 C82 42 126 92 181 55 C229 24 263 63 294 32" fill="none" stroke="${light}" stroke-opacity=".22" stroke-width="18" stroke-linecap="round"/>
<rect x="32" y="42" width="256" height="220" rx="20" fill="url(#card)" stroke="rgba(255,255,255,.24)" stroke-width="2" filter="url(#shadow)"/>
${packBodySvg({ definition })}
</svg>`;
}

function thumbnailSvg({ definition }: { definition: TextTemplateDefinition }) {
	if (getTextTemplateThumbnailLayoutKind({ definition }) === "pack") {
		return packThumbnailSvg({ definition });
	}
	const [dark, mid, accent, light] = paletteForDefinition({ definition });
	const label = escapeXml({ value: previewText({ definition }) });
	const rotate = definition.variantId.includes("italic") ? -4 : 0;
	const fontSize = label.length > 2 ? 96 : 112;
	const glowOpacity =
		definition.variantId.includes("glow") || definition.category === "glow"
			? "0.85"
			: "0.45";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<linearGradient id="text" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="#fff"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="${accent}" flood-opacity="${glowOpacity}"/></filter>
</defs>
<rect width="320" height="304" rx="22" fill="url(#bg)"/>
<path d="M30 78 C82 42 126 92 181 55 C229 24 263 63 294 32" fill="none" stroke="${light}" stroke-opacity=".24" stroke-width="18" stroke-linecap="round"/>
<g opacity=".22">${Array.from({ length: 18 }, (_, index) => {
		const x = 18 + ((index * 37) % 284);
		const y = 20 + ((index * 53) % 250);
		const radius = 2 + (index % 5);
		return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${index % 2 === 0 ? light : accent}"/>`;
	}).join("")}</g>
<g transform="translate(160 158) rotate(${rotate})" filter="url(#shadow)">
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="#000" stroke-width="18" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="#fff" stroke-width="10" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" stroke="${mid}" stroke-width="5" stroke-linejoin="round">${label}</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="900" fill="url(#text)">${label}</text>
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

function sourcePayload({ definition }: { definition: TextTemplateDefinition }) {
	const resource = getTextTemplateResource({ definition });
	return {
		schemaVersion: 1,
		assetId: resource.assetId,
		packageId: resource.packageId,
		version: resource.version,
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
		template: buildTextTemplate({ definition }),
	};
}

function qcutPackagePayload({
	definition,
	source,
}: {
	definition: TextTemplateDefinition;
	source: ReturnType<typeof sourcePayload>;
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
	const source = sourcePayload({ definition });
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
	const definitions = TEXT_TEMPLATE_DEFINITIONS.filter(
		(definition) => definition.downloaded
	);
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

await main();

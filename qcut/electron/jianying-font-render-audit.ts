import { app, BrowserWindow, protocol } from "electron";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildJianyingFontCatalog,
	readVerifiedJianyingFontBytes,
	type JianyingFontCatalogEntry,
} from "./jianying-font-lab-catalog.js";

const AUDIT_SCHEME = "qcut-font-audit";
const AUDIT_ORIGIN = `${AUDIT_SCHEME}://app`;
const FONT_PATH_PREFIX = "/font/";
const AUDIT_USER_DATA_PATH = join(
	tmpdir(),
	`qcut-font-render-audit-${process.pid}`
);

mkdirSync(AUDIT_USER_DATA_PATH, { recursive: true });
app.setPath("userData", AUDIT_USER_DATA_PATH);
app.on("will-quit", () => {
	rmSync(AUDIT_USER_DATA_PATH, { force: true, recursive: true });
});

interface BrowserFontAuditResult {
	fontId: string;
	cssFamily: string;
	loaded: boolean;
	available: boolean;
	measuredWidth: number;
	inkPixelCount: number;
	error?: string;
}

protocol.registerSchemesAsPrivileged([
	{
		scheme: AUDIT_SCHEME,
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
		},
	},
]);

function createAuditDocumentResponse() {
	return new Response(
		'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
		{ headers: { "content-type": "text/html; charset=utf-8" } }
	);
}

function findFontEntry({
	entriesById,
	requestUrl,
}: {
	entriesById: Map<string, JianyingFontCatalogEntry>;
	requestUrl: URL;
}) {
	if (!requestUrl.pathname.startsWith(FONT_PATH_PREFIX)) return null;
	const fontId = decodeURIComponent(
		requestUrl.pathname.slice(FONT_PATH_PREFIX.length)
	);
	return entriesById.get(fontId) ?? null;
}

async function createFontResponse({
	entry,
}: {
	entry: JianyingFontCatalogEntry;
}) {
	const bytes = await readVerifiedJianyingFontBytes({ entry });
	const contentType = entry.format === "otf" ? "font/otf" : "font/ttf";
	return new Response(new Uint8Array(bytes), {
		headers: {
			"cache-control": "no-store",
			"content-type": contentType,
		},
	});
}

function createRendererAuditSource({
	fonts,
}: {
	fonts: Array<{ fontId: string; cssFamily: string; fullName: string }>;
}) {
	return `
		(async () => {
			const fonts = ${JSON.stringify(fonts)};
			const mapWithConcurrency = async ({ items, limit, mapper }) => {
				const results = new Array(items.length);
				let nextIndex = 0;
				const runNext = async () => {
					const index = nextIndex;
					nextIndex += 1;
					if (index >= items.length) return;
					results[index] = await mapper(items[index]);
					await runNext();
				};
				await Promise.all(
					Array.from({ length: Math.min(limit, items.length) }, () => runNext())
				);
				return results;
			};
			return mapWithConcurrency({
				items: fonts,
				limit: 4,
				mapper: async (font) => {
					let face;
					try {
						const source = \`url("${AUDIT_ORIGIN}${FONT_PATH_PREFIX}\${encodeURIComponent(font.fontId)}")\u0060;
						face = new FontFace(font.cssFamily, source);
						document.fonts.add(face);
						await face.load();
						const canvas = document.createElement("canvas");
						canvas.width = 1024;
						canvas.height = 160;
						const context = canvas.getContext("2d", { willReadFrequently: true });
						if (!context) throw new Error("Canvas 2D context is unavailable");
						context.clearRect(0, 0, canvas.width, canvas.height);
						context.fillStyle = "#fff";
						context.font = \`64px "\${font.cssFamily}"\u0060;
						context.textBaseline = "top";
						const probe = \`\${font.fullName} QCut 2026 剪映\u0060;
						const measuredWidth = context.measureText(probe).width;
						context.fillText(probe, 4, 4);
						const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
						let inkPixelCount = 0;
						for (let index = 3; index < pixels.length; index += 4) {
							if (pixels[index] > 0) inkPixelCount += 1;
						}
						return {
							fontId: font.fontId,
							cssFamily: font.cssFamily,
							loaded: face.status === "loaded",
							available: document.fonts.check(\u006064px "\${font.cssFamily}"\u0060),
							measuredWidth,
							inkPixelCount,
						};
					} catch (error) {
						return {
							fontId: font.fontId,
							cssFamily: font.cssFamily,
							loaded: false,
							available: false,
							measuredWidth: 0,
							inkPixelCount: 0,
							error: error instanceof Error ? error.message : String(error),
						};
					} finally {
						if (face) document.fonts.delete(face);
					}
				},
			});
		})()
	`;
}

async function runAudit() {
	const catalog = await buildJianyingFontCatalog();
	const entriesById = new Map(
		catalog.entries.map((entry) => [entry.fontId, entry])
	);
	protocol.handle(AUDIT_SCHEME, async (request) => {
		const requestUrl = new URL(request.url);
		if (requestUrl.hostname !== "app") {
			return new Response("Not found", { status: 404 });
		}
		if (requestUrl.pathname === "/index.html") {
			return createAuditDocumentResponse();
		}
		const entry = findFontEntry({ entriesById, requestUrl });
		if (!entry) return new Response("Not found", { status: 404 });
		return createFontResponse({ entry });
	});

	const auditWindow = new BrowserWindow({
		show: false,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	await auditWindow.loadURL(`${AUDIT_ORIGIN}/index.html`);
	const browserResults = (await auditWindow.webContents.executeJavaScript(
		createRendererAuditSource({
			fonts: catalog.entries.map(({ fontId, cssFamily, fullName }) => ({
				fontId,
				cssFamily,
				fullName,
			})),
		}),
		true
	)) as BrowserFontAuditResult[];
	auditWindow.destroy();
	protocol.unhandle(AUDIT_SCHEME);

	const failures = browserResults.filter(
		({ available, inkPixelCount, loaded, measuredWidth }) =>
			!loaded || !available || measuredWidth <= 0 || inkPixelCount <= 0
	);
	const result = {
		passed: failures.length === 0,
		uniqueFontCount: catalog.entries.length,
		cacheFileCount: catalog.fileCount,
		duplicateFileCount: catalog.duplicateFileCount,
		invalidFileCount: catalog.invalidFileCount,
		oversizedFileCount: catalog.oversizedFileCount,
		browserLoadedCount: browserResults.length - failures.length,
		failures,
	};
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	app.exit(result.passed ? 0 : 1);
}

app
	.whenReady()
	.then(runAudit)
	.catch((error: unknown) => {
		process.stderr.write(
			`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
		);
		app.exit(1);
	});

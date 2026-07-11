import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
	TEXT_VISUAL_AUDIT_CASES,
	TEXT_VISUAL_AUDIT_ROOT,
} from "../apps/web/src/test/e2e/text-visual-audit-cases";

const reportDir = path.join(TEXT_VISUAL_AUDIT_ROOT, "report");
const sheetDir = path.join(TEXT_VISUAL_AUDIT_ROOT, "sheets");
const groups = [
	"templates",
	"blend-modes",
	"curves",
	"alignment",
	"animations",
	"keyframes",
	"advanced",
] as const;

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function pageHtml({
	title,
	content,
}: {
	title: string;
	content: string;
}): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px; background: #101214; color: #f4f4f5; font: 14px/1.45 Arial, sans-serif; }
    h1 { margin: 0 0 8px; font-size: 26px; letter-spacing: 0; }
    .sub { margin: 0 0 24px; color: #a1a1aa; }
    .cases { display: grid; gap: 20px; }
    .case { border: 1px solid #34383d; border-radius: 8px; overflow: hidden; background: #191c20; }
    .case h2 { margin: 0; padding: 12px 16px; border-bottom: 1px solid #34383d; font-size: 16px; letter-spacing: 0; }
    .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #34383d; }
    figure { margin: 0; padding: 12px; background: #191c20; min-width: 0; }
    figcaption { margin-bottom: 8px; color: #d4d4d8; font-weight: 700; }
    img { display: block; width: 100%; height: auto; background: #000; border: 1px solid #3f444a; }
    nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0; }
    nav a { color: #111827; background: #facc15; padding: 7px 10px; border-radius: 4px; text-decoration: none; font-weight: 700; }
    .single { max-width: 920px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">Left: Electron editor preview. Right: bundled FFmpeg export.</p>
  ${content}
</body>
</html>`;
}

function assertFile(filePath: string): void {
	if (!fs.existsSync(filePath))
		throw new Error(`Missing audit artifact: ${filePath}`);
}

fs.rmSync(reportDir, { recursive: true, force: true });
fs.rmSync(sheetDir, { recursive: true, force: true });
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(sheetDir, { recursive: true });

for (const group of groups) {
	const cases = TEXT_VISUAL_AUDIT_CASES.filter(
		(auditCase) => auditCase.group === group
	);
	const content = `<div class="cases">${cases
		.map((auditCase) => {
			const editorPath = path.join(
				TEXT_VISUAL_AUDIT_ROOT,
				"editor",
				auditCase.group,
				`${auditCase.id}.png`
			);
			const exportPath = path.join(
				TEXT_VISUAL_AUDIT_ROOT,
				"export",
				auditCase.group,
				`${auditCase.id}.png`
			);
			assertFile(editorPath);
			assertFile(exportPath);
			return `<section class="case">
  <h2>${escapeHtml(auditCase.label)} <small>t=${auditCase.captureTime}s</small></h2>
  <div class="pair">
    <figure><figcaption>Editor preview</figcaption><img src="${pathToFileURL(editorPath).href}" alt="Editor ${escapeHtml(auditCase.label)}"></figure>
    <figure><figcaption>FFmpeg export</figcaption><img src="${pathToFileURL(exportPath).href}" alt="Export ${escapeHtml(auditCase.label)}"></figure>
  </div>
</section>`;
		})
		.join("\n")}</div>`;
	fs.writeFileSync(
		path.join(reportDir, `${group}.html`),
		pageHtml({ title: `Text visual audit - ${group}`, content }),
		"utf8"
	);
}

const beforePath = path.join(
	TEXT_VISUAL_AUDIT_ROOT,
	"comparison",
	"screen-before.png"
);
const afterPath = path.join(
	TEXT_VISUAL_AUDIT_ROOT,
	"comparison",
	"screen-after.png"
);
assertFile(beforePath);
assertFile(afterPath);
fs.writeFileSync(
	path.join(reportDir, "screen-comparison.html"),
	pageHtml({
		title: "Screen blend regression - before / after",
		content: `<section class="case"><h2>Screen blend mode</h2><div class="pair">
  <figure><figcaption>Before: maskedmerge color corruption</figcaption><img src="${pathToFileURL(beforePath).href}"></figure>
  <figure><figcaption>After: alpha-aware overlay</figcaption><img src="${pathToFileURL(afterPath).href}"></figure>
</div></section>`,
	}),
	"utf8"
);

const statePropertiesPath = path.join(
	TEXT_VISUAL_AUDIT_ROOT,
	"editor",
	"state",
	"yellow-pop-animation-keyframes-properties.png"
);
const statePreviewPath = path.join(
	TEXT_VISUAL_AUDIT_ROOT,
	"editor",
	"state",
	"yellow-pop-animation-keyframes-preview.png"
);
assertFile(statePropertiesPath);
assertFile(statePreviewPath);
fs.writeFileSync(
	path.join(reportDir, "yellow-pop-state.html"),
	pageHtml({
		title: "Yellow Pop - animation and keyframe editor state",
		content: `<section class="case"><h2>Configured editor state</h2><div class="pair">
  <figure><figcaption>Properties panel</figcaption><img src="${pathToFileURL(statePropertiesPath).href}"></figure>
  <figure><figcaption>Preview panel</figcaption><img src="${pathToFileURL(statePreviewPath).href}"></figure>
</div></section>`,
	}),
	"utf8"
);

const reportPages = [
	...groups.map((group) => `${group}.html`),
	"screen-comparison.html",
	"yellow-pop-state.html",
];
const navigation = `<nav>${reportPages
	.map((page) => `<a href="${page}">${page.replace(".html", "")}</a>`)
	.join("")}</nav>`;
fs.writeFileSync(
	path.join(reportDir, "index.html"),
	pageHtml({
		title: "QCut text visual audit",
		content: `${navigation}<p>${TEXT_VISUAL_AUDIT_CASES.length} editor/export comparisons, plus Yellow Pop editor state and screen blend regression evidence.</p>`,
	}),
	"utf8"
);

const browser = await chromium.launch({
	headless: true,
	executablePath:
		process.env.CHROME_PATH ??
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
	});
	for (const reportPage of reportPages) {
		await page.goto(pathToFileURL(path.join(reportDir, reportPage)).href);
		await page.screenshot({
			path: path.join(sheetDir, reportPage.replace(".html", ".png")),
			fullPage: true,
		});
	}
} finally {
	await browser.close();
}

fs.writeFileSync(
	path.join(TEXT_VISUAL_AUDIT_ROOT, "manifest.json"),
	JSON.stringify(
		{
			createdAt: new Date().toISOString(),
			caseCount: TEXT_VISUAL_AUDIT_CASES.length,
			editorScreenshotCount: TEXT_VISUAL_AUDIT_CASES.length + 2,
			exportScreenshotCount: TEXT_VISUAL_AUDIT_CASES.length,
			comparisonScreenshotCount: 2,
			report: path.join(reportDir, "index.html"),
		},
		null,
		2
	),
	"utf8"
);

console.log(path.join(reportDir, "index.html"));

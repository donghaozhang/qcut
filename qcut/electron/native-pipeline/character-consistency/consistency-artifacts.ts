import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConsistencyFinding, ConsistencyResult } from "./types.js";

export interface ConsistencyArtifactResult {
	jsonPath: string;
	csvPath: string;
	htmlPath: string;
	reportPath: string;
}

function escapeHtml({ value }: { value: string }): string {
	return value.replace(/[&<>"']/g, (char) => {
		const escapes: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};
		return escapes[char] ?? char;
	});
}

function escapeCsv({ value }: { value: string }): string {
	if (!/[",\n\r]/.test(value)) return value;
	return `"${value.replace(/"/g, '""')}"`;
}

function writeJson({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}): void {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeCsv({
	filePath,
	findings,
}: {
	filePath: string;
	findings: ConsistencyFinding[];
}): void {
	const headers = [
		"startFrame",
		"endFrame",
		"startTime",
		"endTime",
		"category",
		"severity",
		"comment",
		"fix",
	];
	const rows = [headers.join(",")];
	for (const finding of findings) {
		rows.push(
			[
				String(finding.startFrame),
				String(finding.endFrame),
				finding.startTime,
				finding.endTime,
				finding.category,
				finding.severity,
				finding.comment,
				finding.fix,
			]
				.map((value) => escapeCsv({ value }))
				.join(",")
		);
	}
	writeFileSync(filePath, `${rows.join("\n")}\n`, "utf-8");
}

function renderFindingRows({
	findings,
}: {
	findings: ConsistencyFinding[];
}): string {
	return findings
		.map(
			(finding, index) => `<tr>
<td>${index + 1}</td>
<td>${finding.startFrame}-${finding.endFrame}</td>
<td><code>${escapeHtml({ value: finding.startTime })} - ${escapeHtml({ value: finding.endTime })}</code></td>
<td>${escapeHtml({ value: finding.category })}</td>
<td><span class="severity ${finding.severity}">${finding.severity}</span></td>
<td>${escapeHtml({ value: finding.comment })}</td>
<td>${escapeHtml({ value: finding.fix })}</td>
</tr>`
		)
		.join("\n");
}

function renderHtml({ result }: { result: ConsistencyResult }): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Character Consistency Findings</title>
<style>
:root{color-scheme:dark;--bg:#101218;--panel:#171b24;--line:#2b3344;--text:#eef2f7;--muted:#9aa4b5;--accent:#66d9c8;--high:#ff6b6b;--medium:#ffd166;--low:#8bd68b}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:20px;margin:0 0 6px}.meta{color:var(--muted)}
main{padding:24px;overflow:auto}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line)}
th,td{border-bottom:1px solid var(--line);padding:10px;vertical-align:top;text-align:left}
th{color:var(--muted);font-size:12px;text-transform:uppercase}
code{color:var(--accent)}
.severity{border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}
.severity.high{background:rgba(255,107,107,.15);color:var(--high)}
.severity.medium{background:rgba(255,209,102,.15);color:var(--medium)}
.severity.low{background:rgba(139,214,139,.15);color:var(--low)}
</style>
</head>
<body>
<header>
<h1>Character Consistency Findings</h1>
<div class="meta">${escapeHtml({ value: result.video })} · ${result.findings.length} findings · ${escapeHtml({ value: result.model })}</div>
</header>
<main>
<table>
<thead><tr><th>#</th><th>Frames</th><th>Time</th><th>Category</th><th>Severity</th><th>Comment</th><th>Fix</th></tr></thead>
<tbody>
${renderFindingRows({ findings: result.findings })}
</tbody>
</table>
</main>
</body>
</html>
`;
}

function renderMarkdown({ result }: { result: ConsistencyResult }): string {
	const rows = result.findings
		.map(
			(finding) =>
				`| ${finding.startFrame}-${finding.endFrame} | ${finding.startTime}-${finding.endTime} | ${finding.category} | ${finding.severity} | ${finding.comment} | ${finding.fix} |`
		)
		.join("\n");

	return `# Character Consistency Report

- Video: ${result.video}
- Model: ${result.model}
- Video FPS: ${result.videoFps}
- Total frames: ${result.totalFrames}
- Reference images: ${result.referenceImages.join(", ")}
- Sampling FPS: ${result.samplingFps}
- Minimum severity: ${result.minSeverity}
- Findings: ${result.findings.length}

| Frames | Time | Category | Severity | Comment | Fix |
|---|---|---|---|---|---|
${rows || "| - | - | - | - | No obvious character consistency issues. | - |"}
`;
}

export function writeConsistencyArtifacts({
	outputDir,
	result,
}: {
	outputDir: string;
	result: ConsistencyResult;
}): ConsistencyArtifactResult {
	mkdirSync(outputDir, { recursive: true });
	const jsonPath = join(outputDir, "consistency-findings.json");
	const csvPath = join(outputDir, "consistency-findings.csv");
	const htmlPath = join(outputDir, "consistency-report.html");
	const reportPath = join(outputDir, "consistency-report.md");

	writeJson({ filePath: jsonPath, value: result });
	writeCsv({ filePath: csvPath, findings: result.findings });
	writeFileSync(htmlPath, renderHtml({ result }), "utf-8");
	writeFileSync(reportPath, renderMarkdown({ result }), "utf-8");

	return { jsonPath, csvPath, htmlPath, reportPath };
}

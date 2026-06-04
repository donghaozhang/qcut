import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ReviewPromptSet } from "./review-prompts.js";
import type { ReviewComment } from "./review-normalize.js";

export interface ReviewArtifactResult {
	outputDir: string;
	jsonPath: string;
	csvPath: string;
	browserHtmlPath: string;
	summaryHtmlPath: string;
	reportPath: string;
	promptsDir: string;
	rawAnalysisPath: string;
	commentCount: number;
}

interface WriteReviewArtifactsOptions {
	outputDir: string;
	video: string;
	model: string;
	duration: number;
	promptSet: ReviewPromptSet;
	comments: ReviewComment[];
	rawAnalysis: unknown;
	reportNotes?: string[];
}

/** Escape the five HTML-significant characters so review text renders safely. */
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

/**
 * Quote a CSV field when it contains commas, quotes, or newlines, doubling any
 * embedded quotes per RFC 4180. Values without special characters pass through.
 */
function escapeCsv({ value }: { value: string }): string {
	if (!/[",\n\r]/.test(value)) return value;
	return `"${value.replace(/"/g, '""')}"`;
}

/** Write a value to `filePath` as pretty-printed JSON with a trailing newline. */
function writeJson({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}): void {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/**
 * Write review comments to a CSV file with a fixed header row
 * (timestamp, category, severity, comment, fix), escaping each field.
 */
function writeReviewCsv({
	filePath,
	comments,
}: {
	filePath: string;
	comments: ReviewComment[];
}): void {
	const headers = ["timestamp", "category", "severity", "comment", "fix"];
	const rows = [headers.join(",")];

	for (const comment of comments) {
		rows.push(
			[
				comment.timestamp,
				comment.category,
				comment.severity,
				comment.comment,
				comment.fix,
			]
				.map((value) => escapeCsv({ value }))
				.join(",")
		);
	}

	writeFileSync(filePath, `${rows.join("\n")}\n`, "utf-8");
}

/** Tally how many comments fall into each category, keyed by category name. */
function groupedCounts({
	comments,
}: {
	comments: ReviewComment[];
}): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const comment of comments) {
		counts[comment.category] = (counts[comment.category] ?? 0) + 1;
	}
	return counts;
}

/** Render review comments as escaped `<tr>` table rows for the browser report. */
function renderCommentRows({
	comments,
}: {
	comments: ReviewComment[];
}): string {
	return comments
		.map(
			(comment, index) => `<tr>
<td>${index + 1}</td>
<td><code>${escapeHtml({ value: comment.timestamp })}</code></td>
<td>${escapeHtml({ value: comment.category })}</td>
<td><span class="severity ${comment.severity}">${comment.severity}</span></td>
<td>${escapeHtml({ value: comment.comment })}</td>
<td>${escapeHtml({ value: comment.fix })}</td>
</tr>`
		)
		.join("\n");
}

/**
 * Build a standalone dark-themed HTML page that lists every review comment in a
 * sortable-looking table, used for browsing the full feedback set.
 */
function renderBrowserHtml({
	video,
	comments,
}: {
	video: string;
	comments: ReviewComment[];
}): string {
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video Review Comments</title>
<style>
:root{color-scheme:dark;--bg:#101218;--panel:#171b24;--line:#2b3344;--text:#eef2f7;--muted:#9aa4b5;--accent:#66d9c8;--high:#ff6b6b;--medium:#ffd166;--low:#8bd68b}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:20px;margin:0 0 6px}
.meta{color:var(--muted)}
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
<h1>Video Review Comments</h1>
<div class="meta">${escapeHtml({ value: video })} · ${comments.length} comments</div>
</header>
<main>
<table>
<thead><tr><th>#</th><th>Time</th><th>Category</th><th>Severity</th><th>Comment</th><th>Fix</th></tr></thead>
<tbody>
${renderCommentRows({ comments })}
</tbody>
</table>
</main>
</body>
</html>
`;
}

/**
 * Build a standalone HTML summary page that groups comments by category
 * (most-frequent first), giving a quick overview rather than the full table.
 */
function renderSummaryHtml({
	video,
	comments,
}: {
	video: string;
	comments: ReviewComment[];
}): string {
	const counts = groupedCounts({ comments });
	const sections = Object.entries(counts)
		.sort(([, left], [, right]) => right - left)
		.map(([category, count]) => {
			const categoryComments = comments.filter(
				(comment) => comment.category === category
			);
			const items = categoryComments
				.map(
					(comment) =>
						`<li><code>${escapeHtml({ value: comment.timestamp })}</code> ${escapeHtml({ value: comment.comment })}</li>`
				)
				.join("\n");
			return `<section><h2>${escapeHtml({ value: category })} <span>${count}</span></h2><ul>${items}</ul></section>`;
		})
		.join("\n");

	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video Review Summary</title>
<style>
:root{color-scheme:dark;--bg:#101218;--panel:#171b24;--line:#2b3344;--text:#eef2f7;--muted:#9aa4b5;--accent:#66d9c8}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
main{padding:24px;display:grid;gap:16px}
h1{font-size:20px;margin:0 0 6px}.meta{color:var(--muted)}
section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px}
h2{font-size:16px;margin:0 0 10px}h2 span{color:var(--accent)}
li{margin:8px 0}code{color:var(--accent)}
</style>
</head>
<body>
<header><h1>Video Review Summary</h1><div class="meta">${escapeHtml({ value: video })} · ${comments.length} comments</div></header>
<main>${sections || "<section><h2>No review comments</h2></section>"}</main>
</body>
</html>
`;
}

/**
 * Build the Markdown review report covering run metadata (video, model,
 * language, runtime), per-category counts, and the list of emitted artifacts.
 */
function renderReportMarkdown({
	video,
	model,
	duration,
	promptSet,
	comments,
	reportNotes,
}: {
	video: string;
	model: string;
	duration: number;
	promptSet: ReviewPromptSet;
	comments: ReviewComment[];
	reportNotes?: string[];
}): string {
	const counts = groupedCounts({ comments });
	const countLines = Object.entries(counts)
		.sort(([, left], [, right]) => right - left)
		.map(([category, count]) => `- ${category}: ${count}`)
		.join("\n");
	const noteLines = reportNotes?.length
		? `\n## Notes\n\n${reportNotes.map((note) => `- ${note}`).join("\n")}\n`
		: "";

	return `# Video Review Agent Report

- Video: ${video}
- Model: ${model}
- Prompt language: ${promptSet.language}
- Review comments: ${comments.length}
- Runtime: ${duration.toFixed(2)}s

## Category Counts

${countLines || "- No review comments"}
${noteLines}

## Artifacts

- review-comments.json
- review-comments.csv
- review-feedback-browser.html
- review-feedback-summary.html
- review-agent-prompts/
- raw-analysis.json
`;
}

/**
 * Write a copy of every prompt document used for the run into a
 * `review-agent-prompts/` subfolder and return that directory's path, so each
 * review run records the exact prompts it was given.
 */
function writePromptSnapshot({
	outputDir,
	promptSet,
}: {
	outputDir: string;
	promptSet: ReviewPromptSet;
}): string {
	const promptsDir = path.join(outputDir, "review-agent-prompts");
	mkdirSync(promptsDir, { recursive: true });

	for (const document of promptSet.documents) {
		writeFileSync(
			path.join(promptsDir, document.filename),
			document.content.endsWith("\n")
				? document.content
				: `${document.content}\n`,
			"utf-8"
		);
	}

	return promptsDir;
}

/**
 * Write the full set of video-review artifacts to `outputDir`: the comments
 * JSON and CSV, the browser and summary HTML pages, the Markdown report, a
 * snapshot of the prompts, and the raw model analysis. Returns the resolved
 * paths and the comment count.
 */
export function writeReviewArtifacts({
	outputDir,
	video,
	model,
	duration,
	promptSet,
	comments,
	rawAnalysis,
	reportNotes,
}: WriteReviewArtifactsOptions): ReviewArtifactResult {
	mkdirSync(outputDir, { recursive: true });

	const jsonPath = path.join(outputDir, "review-comments.json");
	const csvPath = path.join(outputDir, "review-comments.csv");
	const browserHtmlPath = path.join(outputDir, "review-feedback-browser.html");
	const summaryHtmlPath = path.join(outputDir, "review-feedback-summary.html");
	const reportPath = path.join(outputDir, "review-agent-report.md");
	const rawAnalysisPath = path.join(outputDir, "raw-analysis.json");
	const promptsDir = writePromptSnapshot({ outputDir, promptSet });

	writeJson({
		filePath: jsonPath,
		value: {
			version: 1,
			video,
			model,
			promptLanguage: promptSet.language,
			comments,
		},
	});
	writeReviewCsv({ filePath: csvPath, comments });
	writeFileSync(
		browserHtmlPath,
		renderBrowserHtml({ video, comments }),
		"utf-8"
	);
	writeFileSync(
		summaryHtmlPath,
		renderSummaryHtml({ video, comments }),
		"utf-8"
	);
	writeFileSync(
		reportPath,
		renderReportMarkdown({
			video,
			model,
			duration,
			promptSet,
			comments,
			reportNotes,
		}),
		"utf-8"
	);
	writeJson({ filePath: rawAnalysisPath, value: rawAnalysis });

	return {
		outputDir,
		jsonPath,
		csvPath,
		browserHtmlPath,
		summaryHtmlPath,
		reportPath,
		promptsDir,
		rawAnalysisPath,
		commentCount: comments.length,
	};
}

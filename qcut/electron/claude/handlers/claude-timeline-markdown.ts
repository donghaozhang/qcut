/**
 * Claude Timeline Markdown
 *
 * Markdown serialization/deserialization for timeline data and
 * timeline structure validation.
 */

import {
	formatTimeFromSeconds,
	parseTime,
	generateId,
} from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";
import type { ClaudeTimeline, ClaudeElement } from "../../types/claude-api";

const HANDLER_NAME = "Timeline";

/** Escape pipe and newline characters so they don't break markdown table cells. */
function escapeMarkdownCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Convert Timeline to Markdown format
 */
export function timelineToMarkdown(timeline: ClaudeTimeline): string {
	let md = `# Timeline: ${timeline.name}\n\n`;

	md += "## Project Info\n\n";
	md += "| Property | Value |\n";
	md += "|----------|-------|\n";
	md += `| Duration | ${formatTimeFromSeconds(timeline.duration)} |\n`;
	md += `| Resolution | ${timeline.width}x${timeline.height} |\n`;
	md += `| FPS | ${timeline.fps} |\n`;
	md += `| Tracks | ${timeline.tracks.length} |\n\n`;

	for (const track of timeline.tracks) {
		const trackLabel = track.name
			? `${track.name} (${track.type})`
			: track.type;
		md += `## Track ${track.index + 1}: ${trackLabel}\n\n`;

		if (track.elements.length === 0) {
			md += "*No elements in this track*\n\n";
			continue;
		}

		md += "| ID | Start | End | Duration | Type | Source | Content |\n";
		md += "|----|-------|-----|----------|------|--------|--------|\n";

		for (const element of track.elements) {
			const content = escapeMarkdownCell(
				(element.content || element.sourceName || "-").substring(0, 25)
			);
			const source = escapeMarkdownCell(element.sourceName || "-");
			md += `| \`${element.id.substring(0, 8)}\` | ${formatTimeFromSeconds(element.startTime)} | ${formatTimeFromSeconds(element.endTime)} | ${formatTimeFromSeconds(element.duration)} | ${element.type} | ${source} | ${content} |\n`;
		}
		md += "\n";
	}

	md += "---\n\n";
	md += `*Exported at: ${new Date().toISOString()}*\n`;

	return md;
}

/**
 * Parse Markdown to Timeline
 */
function parseMarkdownSeconds(value: string): number {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error("Missing time value");
	}

	if (trimmed.endsWith("s")) {
		const seconds = Number.parseFloat(trimmed.slice(0, -1));
		if (!Number.isFinite(seconds) || seconds < 0) {
			throw new Error(`Invalid seconds value: ${value}`);
		}
		return seconds;
	}

	if (/^\d+:\d{2}(?::\d{2})?$/.test(trimmed)) {
		return parseTime(trimmed);
	}

	const numeric = Number.parseFloat(trimmed);
	if (Number.isFinite(numeric) && numeric >= 0) {
		return numeric;
	}

	throw new Error(`Invalid time value: ${value}`);
}

function parseMarkdownRow(line: string): string[] {
	const normalized = line.trim();
	if (!normalized.startsWith("|")) {
		throw new Error(`Invalid markdown row: ${line}`);
	}

	const withoutLeadingPipe = normalized.slice(1);
	const withoutTrailingPipe = withoutLeadingPipe.endsWith("|")
		? withoutLeadingPipe.slice(0, -1)
		: withoutLeadingPipe;

	// Split on unescaped pipes only, then unescape \| in each cell
	const cells: string[] = [];
	let current = "";
	for (let i = 0; i < withoutTrailingPipe.length; i++) {
		if (withoutTrailingPipe[i] === "\\" && withoutTrailingPipe[i + 1] === "|") {
			current += "|";
			i++; // skip the escaped pipe
		} else if (withoutTrailingPipe[i] === "|") {
			cells.push(current.trim());
			current = "";
		} else {
			current += withoutTrailingPipe[i];
		}
	}
	cells.push(current.trim());
	return cells;
}

function isMarkdownSeparatorRow(cells: string[]): boolean {
	return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeElementType(typeValue: string): ClaudeElement["type"] {
	if (typeValue === "caption") {
		return "captions";
	}
	if (
		typeValue === "video" ||
		typeValue === "audio" ||
		typeValue === "image" ||
		typeValue === "text" ||
		typeValue === "sticker" ||
		typeValue === "captions" ||
		typeValue === "remotion" ||
		typeValue === "media"
	) {
		return typeValue;
	}
	return "media";
}

function parseTimelineMetadataFromLine({
	line,
	timeline,
}: {
	line: string;
	timeline: ClaudeTimeline;
}): void {
	const trimmed = line.trim();
	const durationTableMatch = trimmed.match(/^\|\s*Duration\s*\|\s*(.+)\s*\|$/i);
	if (durationTableMatch) {
		timeline.duration = parseMarkdownSeconds(durationTableMatch[1]);
		return;
	}

	const durationBulletMatch = trimmed.match(/^-+\s*Duration:\s*(.+)$/i);
	if (durationBulletMatch) {
		timeline.duration = parseMarkdownSeconds(durationBulletMatch[1]);
		return;
	}

	const resolutionTableMatch = trimmed.match(
		/^\|\s*Resolution\s*\|\s*(\d+)\s*[x×]\s*(\d+)\s*\|$/i
	);
	if (resolutionTableMatch) {
		timeline.width = Number.parseInt(resolutionTableMatch[1], 10);
		timeline.height = Number.parseInt(resolutionTableMatch[2], 10);
		return;
	}

	const resolutionBulletMatch = trimmed.match(
		/^-+\s*Resolution:\s*(\d+)\s*[x×]\s*(\d+)$/i
	);
	if (resolutionBulletMatch) {
		timeline.width = Number.parseInt(resolutionBulletMatch[1], 10);
		timeline.height = Number.parseInt(resolutionBulletMatch[2], 10);
		return;
	}

	const fpsTableMatch = trimmed.match(
		/^\|\s*FPS\s*\|\s*(\d+(?:\.\d+)?)\s*\|$/i
	);
	if (fpsTableMatch) {
		timeline.fps = Number.parseFloat(fpsTableMatch[1]);
		return;
	}

	const fpsBulletMatch = trimmed.match(/^-+\s*FPS:\s*(\d+(?:\.\d+)?)$/i);
	if (fpsBulletMatch) {
		timeline.fps = Number.parseFloat(fpsBulletMatch[1]);
	}
}

export function markdownToTimeline(md: string): ClaudeTimeline {
	try {
		const timeline: ClaudeTimeline = {
			name: "Imported Timeline",
			duration: 0,
			width: 1920,
			height: 1080,
			fps: 30,
			tracks: [],
		};

		const lines = md.split(/\r?\n/);
		let currentLine = 0;

		const timelineNameMatch = md.match(/^#\s*Timeline:\s*(.+)$/im);
		const projectNameMatch = md.match(/^#\s*Project:\s*(.+)$/im);
		const resolvedName = timelineNameMatch || projectNameMatch;
		if (resolvedName) {
			timeline.name = resolvedName[1].trim();
		}

		for (const line of lines) {
			parseTimelineMetadataFromLine({ line, timeline });
		}

		while (currentLine < lines.length) {
			const headerLine = lines[currentLine].trim();
			const trackHeaderMatch = headerLine.match(
				/^##\s*Track\s+(\d+):\s*(.+)$/i
			);
			if (!trackHeaderMatch) {
				currentLine++;
				continue;
			}

			const trackIndex = Number.parseInt(trackHeaderMatch[1], 10) - 1;
			const rawTrackLabel = trackHeaderMatch[2].trim();
			const trackLabelMatch = rawTrackLabel.match(/^(.*)\(([^)]+)\)\s*$/);
			const trackName = trackLabelMatch
				? trackLabelMatch[1].trim()
				: rawTrackLabel;
			let trackType = trackLabelMatch ? trackLabelMatch[2].trim() : "media";
			const parsedElements: ClaudeElement[] = [];
			let tableHeaders: string[] | null = null;

			currentLine++;

			while (currentLine < lines.length) {
				const line = lines[currentLine].trim();
				if (line.startsWith("## Track")) {
					break;
				}
				if (!line || line === "*No elements in this track*") {
					currentLine++;
					continue;
				}
				if (!line.startsWith("|")) {
					currentLine++;
					continue;
				}

				const rowCells = parseMarkdownRow(line);
				if (!tableHeaders) {
					tableHeaders = rowCells.map((header) => header.toLowerCase());
					currentLine++;
					continue;
				}
				if (isMarkdownSeparatorRow(rowCells)) {
					currentLine++;
					continue;
				}

				const rowValueByHeader = new Map<string, string>();
				for (const [headerIndex, header] of tableHeaders.entries()) {
					rowValueByHeader.set(header, rowCells[headerIndex] || "");
				}

				const rawType = rowValueByHeader.get("type");
				const rawStart = rowValueByHeader.get("start");
				const rawEnd = rowValueByHeader.get("end");
				const rawDuration = rowValueByHeader.get("duration");
				const rawSource = rowValueByHeader.get("source");
				const rawContent = rowValueByHeader.get("content");
				const rawElementId = rowValueByHeader.get("id");

				if (!rawType || !rawStart) {
					throw new Error(`Malformed track row on line ${currentLine + 1}`);
				}

				const startTime = parseMarkdownSeconds(rawStart);
				const duration =
					rawDuration && rawDuration !== "-"
						? parseMarkdownSeconds(rawDuration)
						: rawEnd && rawEnd !== "-"
							? Math.max(0, parseMarkdownSeconds(rawEnd) - startTime)
							: 0;
				const normalizedDuration = Math.max(0, duration);
				const elementType = normalizeElementType(rawType.trim().toLowerCase());
				const sourceName =
					rawSource && rawSource !== "-" ? rawSource.trim() : undefined;
				const content =
					rawContent && rawContent !== "-" ? rawContent.trim() : undefined;
				const generatedElementId = generateId("element");
				const elementId = rawElementId
					? rawElementId.replace(/`/g, "").trim() || generatedElementId
					: generatedElementId;

				parsedElements.push({
					id: elementId,
					trackIndex: trackIndex < 0 ? 0 : trackIndex,
					startTime,
					endTime: startTime + normalizedDuration,
					duration: normalizedDuration,
					type: elementType,
					sourceName,
					content,
				});

				currentLine++;
			}

			if (!trackLabelMatch && parsedElements.length > 0) {
				const firstType = parsedElements[0].type;
				if (
					firstType === "text" ||
					firstType === "captions" ||
					firstType === "sticker" ||
					firstType === "remotion" ||
					firstType === "audio"
				) {
					trackType = firstType;
				} else {
					trackType = "media";
				}
			}

			const resolvedTrackIndex = timeline.tracks.length;
			timeline.tracks.push({
				id: generateId("track"),
				index: resolvedTrackIndex,
				name:
					trackName && trackName.length > 0
						? trackName
						: `Track ${resolvedTrackIndex + 1}`,
				type: trackType || "media",
				elements: parsedElements.map((element) => ({
					...element,
					trackIndex: resolvedTrackIndex,
				})),
			});
		}

		if (timeline.tracks.length === 0) {
			throw new Error("No tracks found — expected '## Track N: Name' headers");
		}

		const totalElements = timeline.tracks.reduce(
			(sum, t) => sum + t.elements.length,
			0
		);
		if (totalElements === 0) {
			throw new Error(
				"No elements found — expected table rows with element data"
			);
		}

		validateTimeline(timeline);
		return timeline;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown markdown parse error";
		throw new Error(`Invalid timeline markdown: ${message}`);
	}
}

/**
 * Validate timeline structure
 */
export function validateTimeline(timeline: ClaudeTimeline): void {
	if (!timeline.name) {
		throw new Error("Timeline must have a name");
	}
	if (!timeline.tracks || !Array.isArray(timeline.tracks)) {
		throw new Error("Timeline must have tracks array");
	}
	if (timeline.width <= 0 || timeline.height <= 0) {
		throw new Error("Timeline must have valid dimensions");
	}
	if (timeline.fps <= 0) {
		throw new Error("Timeline must have valid FPS");
	}

	for (let i = 0; i < timeline.tracks.length; i++) {
		const track = timeline.tracks[i];
		if (typeof track.index !== "number") {
			claudeLog.warn(
				HANDLER_NAME,
				`Auto-assigning index ${i} for track ${track.id ?? `at position ${i}`}`
			);
			track.index = i;
		}
		if (!Array.isArray(track.elements)) {
			throw new Error("Track must have elements array");
		}

		for (const element of track.elements) {
			if (element.startTime < 0 || element.endTime < element.startTime) {
				throw new Error(`Invalid element timing: ${element.id}`);
			}
		}
	}
}

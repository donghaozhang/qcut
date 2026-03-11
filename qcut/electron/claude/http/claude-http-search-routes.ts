/**
 * Claude HTTP Search Routes
 *
 * Registers search-related API endpoints:
 * - GET  /api/claude/search/:projectId         — search transcriptions
 * - GET  /api/claude/search/:projectId/status   — transcription status per media
 * - POST /api/claude/search/:projectId/index    — trigger batch transcription
 *
 * @module electron/claude/http/claude-http-search-routes
 */

import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";
import { claudeLog } from "../utils/logger.js";
// ── Inline types (mirrors @qcut/editor-core) ─────────────────────────
// Electron's tsconfig (moduleResolution: "node") can't resolve workspace
// subpath exports, so we define minimal interfaces inline.

interface TranscriptionWord {
	type: "word" | "punctuation";
	text: string;
	start: number;
	end: number;
}

interface TranscriptionSegment {
	text: string;
	start: number;
	end: number;
}

interface PersistedTranscription {
	version: number;
	mediaId: string;
	mediaName: string;
	language?: string;
	segments: TranscriptionSegment[];
	words: TranscriptionWord[];
}

interface SearchOptions {
	query: string;
	caseSensitive?: boolean;
	wholeWord?: boolean;
	maxResults?: number;
	mediaId?: string;
}

interface SearchResult {
	mediaId: string;
	mediaName: string;
	segmentText: string;
	matchStart: number;
	matchEnd: number;
	timestamp: number;
	timestampEnd: number;
	wordTimestamp?: number;
}

// ── Inline search (mirrors @qcut/editor-core/search) ─────────────────

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchTranscriptions(
	transcriptions: PersistedTranscription[],
	options: SearchOptions
): SearchResult[] {
	if (!options.query?.trim()) return [];
	const escaped = escapeRegex(options.query);
	const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
	const flags = options.caseSensitive ? "g" : "gi";
	const regex = new RegExp(pattern, flags);
	const results: SearchResult[] = [];
	const maxResults = options.maxResults ?? Infinity;

	for (const t of transcriptions) {
		if (options.mediaId && t.mediaId !== options.mediaId) continue;
		for (const seg of t.segments) {
			if (!seg.text) continue;
			regex.lastIndex = 0;
			let match = regex.exec(seg.text);
			while (match !== null) {
				results.push({
					mediaId: t.mediaId,
					mediaName: t.mediaName,
					segmentText: seg.text,
					matchStart: match.index,
					matchEnd: match.index + match[0].length,
					timestamp: seg.start,
					timestampEnd: seg.end,
				});
				if (results.length >= maxResults) return results;
				match = regex.exec(seg.text);
			}
		}
	}
	return results;
}
import {
	existsSync,
	readdirSync,
	readFileSync,
	mkdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getProjectPath } from "../utils/helpers.js";

const HANDLER_NAME = "SearchRoutes";

// ── Transcription persistence helpers ────────────────────────────────

/** Get the project directory using the shared helper (safe in utility process). */
function getProjectDir(projectId: string): string {
	return getProjectPath(projectId);
}

/** Get the transcriptions directory for a project. */
function getTranscriptionsDir(projectId: string): string {
	const projectDir = getProjectDir(projectId);
	return join(projectDir, "transcriptions");
}

/** Sanitize a mediaId to prevent path traversal. */
function sanitizeMediaId(mediaId: string): string {
	const sanitized = mediaId.replace(/[/\\]/g, "").replace(/\.\./g, "");
	if (!sanitized) throw new HttpError(400, "Invalid mediaId");
	return sanitized;
}

/** Load all persisted transcriptions for a project from disk. */
function loadProjectTranscriptions(
	projectId: string
): PersistedTranscription[] {
	const dir = getTranscriptionsDir(projectId);
	if (!existsSync(dir)) return [];

	const transcriptions: PersistedTranscription[] = [];
	try {
		const files = readdirSync(dir).filter((f) =>
			f.endsWith(".transcription.json")
		);
		for (const file of files) {
			try {
				const raw = readFileSync(join(dir, file), "utf-8");
				const data = JSON.parse(raw) as PersistedTranscription;
				if (data.version && data.mediaId && Array.isArray(data.segments)) {
					transcriptions.push(data);
				}
			} catch (err) {
				claudeLog.warn(
					HANDLER_NAME,
					`Failed to read transcription file ${file}: ${err}`
				);
			}
		}
	} catch (err) {
		claudeLog.warn(HANDLER_NAME, `Failed to read transcriptions dir: ${err}`);
	}
	return transcriptions;
}

/** Load a single transcription by mediaId. */
function loadTranscription(
	projectId: string,
	mediaId: string
): PersistedTranscription | null {
	const safe = sanitizeMediaId(mediaId);
	const filePath = join(
		getTranscriptionsDir(projectId),
		`${safe}.transcription.json`
	);
	if (!existsSync(filePath)) return null;
	try {
		const raw = readFileSync(filePath, "utf-8");
		return JSON.parse(raw) as PersistedTranscription;
	} catch {
		return null;
	}
}

/** Save a transcription to disk. */
export function saveTranscription(
	projectId: string,
	transcription: PersistedTranscription
): void {
	const dir = getTranscriptionsDir(projectId);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const safe = sanitizeMediaId(transcription.mediaId);
	const filePath = join(dir, `${safe}.transcription.json`);
	writeFileSync(filePath, JSON.stringify(transcription, null, 2), "utf-8");
	claudeLog.info(
		HANDLER_NAME,
		`Saved transcription for media ${transcription.mediaId}`
	);
}

// ── Route registration ───────────────────────────────────────────────

export function registerSearchRoutes(router: Router): void {
	/**
	 * GET /api/claude/search/:projectId?q=<query>&caseSensitive=&wholeWord=&maxResults=&mediaId=
	 * Search transcriptions for a project.
	 */
	router.get("/api/claude/search/:projectId", async (req) => {
		const projectId = req.params.projectId;
		const query = req.query?.q;
		if (!query) {
			throw new HttpError(400, "Missing query parameter 'q'");
		}

		const caseSensitive = req.query?.caseSensitive === "true";
		const wholeWord = req.query?.wholeWord === "true";
		const maxResults = req.query?.maxResults
			? parseInt(req.query.maxResults, 10)
			: undefined;
		if (
			maxResults !== undefined &&
			(!Number.isFinite(maxResults) || maxResults < 1)
		) {
			throw new HttpError(400, "maxResults must be a positive integer");
		}
		const mediaId = req.query?.mediaId;

		const transcriptions = loadProjectTranscriptions(projectId);

		const results = searchTranscriptions(transcriptions, {
			query,
			caseSensitive,
			wholeWord,
			maxResults,
			mediaId,
		});

		return {
			query,
			totalTranscriptions: transcriptions.length,
			totalResults: results.length,
			results,
		};
	});

	/**
	 * GET /api/claude/search/:projectId/status
	 * Get transcription availability status per media item.
	 */
	router.get("/api/claude/search/:projectId/status", async (req) => {
		const projectId = req.params.projectId;
		const transcriptions = loadProjectTranscriptions(projectId);

		const status: Record<
			string,
			{ mediaId: string; mediaName: string; status: string; language?: string }
		> = {};

		for (const t of transcriptions) {
			status[t.mediaId] = {
				mediaId: t.mediaId,
				mediaName: t.mediaName,
				status: "ready",
				language: t.language,
			};
		}

		return {
			projectId,
			totalTranscribed: transcriptions.length,
			media: status,
		};
	});

	/**
	 * POST /api/claude/search/:projectId/index
	 * Trigger transcription for untranscribed media.
	 * Note: This is a placeholder — actual transcription is handled
	 * by the existing transcription pipeline. This endpoint returns
	 * info about what needs transcription.
	 */
	router.post("/api/claude/search/:projectId/index", async (req) => {
		const projectId = req.params.projectId;
		const body = req.body ?? {};
		const scopeMediaId = body.mediaId as string | undefined;

		const transcriptions = loadProjectTranscriptions(projectId);
		const transcribedIds = new Set(transcriptions.map((t) => t.mediaId));

		return {
			projectId,
			alreadyTranscribed: transcribedIds.size,
			scopeMediaId,
			message:
				"Use editor:transcribe:run to transcribe media, then re-index. " +
				"Transcriptions are auto-saved for search.",
		};
	});

	claudeLog.info(HANDLER_NAME, "Search routes registered");
}

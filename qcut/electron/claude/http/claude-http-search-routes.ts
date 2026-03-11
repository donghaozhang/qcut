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
import { searchTranscriptions } from "@qcut/editor-core/search";
import type { PersistedTranscription } from "@qcut/editor-core";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";

const HANDLER_NAME = "SearchRoutes";

// ── Transcription persistence helpers ────────────────────────────────

/** Get the project directory: ~/Documents/QCut/Projects/<projectId> */
function getProjectDir(projectId: string): string {
	const sanitized = projectId.replace(/[/\\]/g, "").replace(/\.\./g, "");
	return join(app.getPath("documents"), "QCut", "Projects", sanitized);
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
function loadProjectTranscriptions(projectId: string): PersistedTranscription[] {
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
		claudeLog.warn(
			HANDLER_NAME,
			`Failed to read transcriptions dir: ${err}`
		);
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
		if (maxResults !== undefined && (!Number.isFinite(maxResults) || maxResults < 1)) {
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

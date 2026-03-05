/**
 * Codex session-file discovery and contextual matching.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	parseTimestampMs,
	readJsonlFirstLine,
	toRecord,
} from "./claude-jsonl-core";

const CODEX_SESSION_SCAN_LIMIT = 160;
const CODEX_SESSION_META_MAX_SCAN_BYTES = 1_048_576;
const CODEX_SESSION_LOOKUP_CACHE_TTL_MS = 15_000;

const codexSessionLookupCache = new Map<
	string,
	{ path: string; expiresAt: number }
>();

interface CodexSessionFile {
	path: string;
	mtime: number;
}

interface CodexSessionMeta {
	id: string | null;
	cwd: string | null;
	timestampMs: number | null;
}

interface CodexSessionCandidate extends CodexSessionFile {
	meta: CodexSessionMeta | null;
}

/**
 * Find the most recent Codex session file.
 * Codex stores at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */
export async function findLatestCodexSessionFile(): Promise<string | null> {
	try {
		const files = await listRecentCodexSessionFiles({ maxFiles: 1 });
		return files[0]?.path ?? null;
	} catch {
		return null;
	}
}

/** Find Codex session file using cwd + process start context. */
export async function findCodexSessionFileForContext({
	cwd,
	processStartedAt,
}: {
	cwd?: string | null;
	processStartedAt?: string | null;
}): Promise<string | null> {
	try {
		const cacheKey = buildCodexLookupCacheKey({
			cwd: cwd ?? null,
			processStartedAt: processStartedAt ?? null,
		});
		const now = Date.now();
		const cached = codexSessionLookupCache.get(cacheKey);
		if (cached && cached.expiresAt > now) {
			const exists = await pathExists({ path: cached.path });
			if (exists) return cached.path;
			codexSessionLookupCache.delete(cacheKey);
		}

		const files = await listRecentCodexSessionFiles({
			maxFiles: CODEX_SESSION_SCAN_LIMIT,
		});
		if (files.length === 0) return null;

		const candidates = await Promise.all(
			files.map(async (file) => {
				const meta = await readCodexSessionMeta({ filePath: file.path });
				return { ...file, meta };
			}),
		);

		const selected = selectBestCodexCandidate({
			candidates,
			cwd: cwd ?? null,
			processStartedAt: processStartedAt ?? null,
		});
		const selectedPath = selected?.path ?? files[0]?.path ?? null;
		if (!selectedPath) return null;

		codexSessionLookupCache.set(cacheKey, {
			path: selectedPath,
			expiresAt: now + CODEX_SESSION_LOOKUP_CACHE_TTL_MS,
		});
		return selectedPath;
	} catch {
		return null;
	}
}

/** List recent codex session files. */
async function listRecentCodexSessionFiles({
	maxFiles,
}: {
	maxFiles: number;
}): Promise<CodexSessionFile[]> {
	const sessionsDir = join(homedir(), ".codex", "sessions");
	try {
		const collected: CodexSessionFile[] = [];
		const years = await readdir(sessionsDir);
		years.sort().reverse();

		for (const year of years) {
			const monthsDir = join(sessionsDir, year);
			let months: string[];
			try {
				months = await readdir(monthsDir);
			} catch {
				continue;
			}
			months.sort().reverse();

			for (const month of months) {
				const daysDir = join(sessionsDir, year, month);
				let days: string[];
				try {
					days = await readdir(daysDir);
				} catch {
					continue;
				}
				days.sort().reverse();

				for (const day of days) {
					const dayDir = join(sessionsDir, year, month, day);
					let files: string[];
					try {
						files = await readdir(dayDir);
					} catch {
						continue;
					}
					const jsonlFiles = files.filter((file) => file.endsWith(".jsonl"));
					if (jsonlFiles.length === 0) continue;

					const withStats = await Promise.all(
						jsonlFiles.map(async (file) => {
							const path = join(dayDir, file);
							try {
								const fileStats = await stat(path);
								return { path, mtime: fileStats.mtimeMs };
							} catch {
								return null;
							}
						}),
					);
					for (const file of withStats) {
						if (!file) continue;
						collected.push(file);
					}
					if (collected.length >= maxFiles * 2) {
						return collected
							.sort((fileA, fileB) => fileB.mtime - fileA.mtime)
							.slice(0, maxFiles);
					}
				}
			}
		}

		return collected
			.sort((fileA, fileB) => fileB.mtime - fileA.mtime)
			.slice(0, maxFiles);
	} catch {
		return [];
	}
}

/** Read codex session metadata from first JSONL line. */
async function readCodexSessionMeta({
	filePath,
}: {
	filePath: string;
}): Promise<CodexSessionMeta | null> {
	try {
		const firstLine = await readJsonlFirstLine({
			filePath,
			maxBytes: CODEX_SESSION_META_MAX_SCAN_BYTES,
		});
		if (!firstLine) return null;

		const parsed = JSON.parse(firstLine) as unknown;
		const record = toRecord({ value: parsed });
		if (!record) return null;
		if (record.type !== "session_meta") return null;

		const payload = toRecord({ value: record.payload });
		if (!payload) return null;
		return {
			id: typeof payload.id === "string" ? payload.id : null,
			cwd: typeof payload.cwd === "string" ? payload.cwd : null,
			timestampMs: parseTimestampMs({ value: payload.timestamp }),
		};
	} catch {
		return null;
	}
}

/** Select best codex candidate by path and timestamp proximity. */
function selectBestCodexCandidate({
	candidates,
	cwd,
	processStartedAt,
}: {
	candidates: CodexSessionCandidate[];
	cwd: string | null;
	processStartedAt: string | null;
}): CodexSessionCandidate | null {
	try {
		if (candidates.length === 0) return null;
		const processStartedAtMs = parseTimestampMs({ value: processStartedAt });
		let best: { score: number; candidate: CodexSessionCandidate } | null = null;
		for (const candidate of candidates) {
			const score = scoreCodexCandidate({
				candidate,
				cwd,
				processStartedAtMs,
			});
			if (!best || score > best.score) {
				best = { score, candidate };
			}
		}
		return best?.candidate ?? null;
	} catch {
		return null;
	}
}

/** Score codex candidate. */
function scoreCodexCandidate({
	candidate,
	cwd,
	processStartedAtMs,
}: {
	candidate: CodexSessionCandidate;
	cwd: string | null;
	processStartedAtMs: number | null;
}): number {
	try {
		let score = 0;
		const normalizedCwd = normalizePathForMatch({ path: cwd });
		const normalizedMetaCwd = normalizePathForMatch({
			path: candidate.meta?.cwd ?? null,
		});
		if (normalizedCwd && normalizedMetaCwd) {
			if (normalizedCwd === normalizedMetaCwd) score += 10_000;
			else if (
				normalizedMetaCwd.startsWith(normalizedCwd) ||
				normalizedCwd.startsWith(normalizedMetaCwd)
			) {
				score += 6_000;
			} else {
				score -= 2_000;
			}
		}

		const metaTimestampMs = candidate.meta?.timestampMs ?? null;
		if (processStartedAtMs !== null && metaTimestampMs !== null) {
			const diffMs = Math.abs(metaTimestampMs - processStartedAtMs);
			if (diffMs <= 60_000) score += 5_000;
			else if (diffMs <= 5 * 60_000) score += 3_500;
			else if (diffMs <= 30 * 60_000) score += 2_000;
			else if (diffMs <= 2 * 60 * 60_000) score += 1_000;
			else if (diffMs <= 24 * 60 * 60_000) score += 250;
			else score -= 500;
		}

		const ageMinutes = Math.max(
			0,
			Math.floor((Date.now() - candidate.mtime) / 60_000),
		);
		score += Math.max(0, 500 - ageMinutes);
		if (candidate.meta?.id) score += 20;
		return score;
	} catch {
		return Number.NEGATIVE_INFINITY;
	}
}

/** Build codex lookup cache key. */
function buildCodexLookupCacheKey({
	cwd,
	processStartedAt,
}: {
	cwd: string | null;
	processStartedAt: string | null;
}): string {
	try {
		const normalizedCwd = normalizePathForMatch({ path: cwd }) ?? "";
		const startedAt = processStartedAt ?? "";
		return `${normalizedCwd}|${startedAt}`;
	} catch {
		return "";
	}
}

/** Normalize path for match. */
function normalizePathForMatch({ path }: { path: string | null }): string | null {
	try {
		if (!path) return null;
		return path.replace(/\\/g, "/").replace(/\/+$/g, "");
	} catch {
		return null;
	}
}

/** Check if path exists. */
async function pathExists({ path }: { path: string }): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

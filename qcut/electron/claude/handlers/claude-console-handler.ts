import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { BrowserWindow, WebContents } from "electron";

export type ClaudeConsoleLevel =
	| "log"
	| "info"
	| "warn"
	| "error"
	| "debug";

export interface ClaudeConsoleEntry {
	id: string;
	level: ClaudeConsoleLevel;
	message: string;
	source?: string;
	line?: number;
	timestamp: number;
}

export interface ClaudeConsoleFilter {
	level?: string;
	since?: string;
	limit?: number;
	after?: string;
}

const MAX_CONSOLE_ENTRIES = 500;
const DEFAULT_CONSOLE_LIMIT = 50;
const consoleEntries: ClaudeConsoleEntry[] = [];
const consoleEmitter = new EventEmitter();
const attachedContents = new WeakSet<WebContents>();

const REDACTED_VALUE = "[redacted]";
const REDACTED_EMAIL = "[redacted-email]";
const REDACTED_PATH = "[redacted-path]";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	try {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	} catch {
		return false;
	}
}

function createConsoleEntryId(): string {
	try {
		return `con_${Date.now()}_${randomUUID()}`;
	} catch {
		return `con_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
	}
}

function redactConsoleText({ value }: { value?: string }): string | undefined {
	try {
		if (typeof value !== "string" || value.length === 0) {
			return value;
		}

		return value
			.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, `Bearer ${REDACTED_VALUE}`)
			.replace(
				/\b(authorization|api[-_ ]?key|token|secret|password)\b(\s*[:=]\s*["']?)([^"'\s,}]+)/gi,
				(_match, key, separator) => `${key}${separator}${REDACTED_VALUE}`
			)
			.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED_EMAIL)
			.replace(
				/(^|[\s([{"'=])(?:\/(?:Users|home|var|tmp)\/[^\s)"'\]}]+|[A-Za-z]:\\[^\s)"'\]}]+)/g,
				(match, prefix: string) => `${prefix}${REDACTED_PATH}`
			);
	} catch {
		return value;
	}
}

function isConsoleCaptureEnabled(): boolean {
	const flag = process.env.QCUT_ENABLE_CONSOLE_CAPTURE?.trim().toLowerCase();
	return flag !== "0" && flag !== "false";
}

function normalizeLevel({
	level,
}: {
	level?: string;
}): ClaudeConsoleLevel | undefined {
	try {
		if (!level) {
			return undefined;
		}
		switch (level.trim().toLowerCase()) {
			case "log":
			case "info":
			case "warn":
			case "error":
			case "debug":
				return level.trim().toLowerCase() as ClaudeConsoleLevel;
			default:
				return undefined;
		}
	} catch {
		return undefined;
	}
}

function mapConsoleMessageLevel({
	level,
}: {
	level: number;
}): ClaudeConsoleLevel {
	switch (level) {
		case 1:
			return "info";
		case 2:
			return "warn";
		case 3:
			return "error";
		default:
			return "log";
	}
}

function normalizeLimit({ limit }: { limit?: number }): number {
	try {
		if (!Number.isFinite(limit) || typeof limit !== "number") {
			return DEFAULT_CONSOLE_LIMIT;
		}
		const parsed = Math.trunc(limit);
		if (parsed <= 0) {
			return DEFAULT_CONSOLE_LIMIT;
		}
		return Math.min(parsed, MAX_CONSOLE_ENTRIES);
	} catch {
		return DEFAULT_CONSOLE_LIMIT;
	}
}

function parseSinceToTimestamp({ since }: { since?: string }): number | undefined {
	try {
		if (!since) {
			return undefined;
		}
		const trimmed = since.trim();
		if (!trimmed) {
			return undefined;
		}

		if (/^\d+$/.test(trimmed)) {
			const numeric = Number.parseInt(trimmed, 10);
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return undefined;
			}
			if (numeric > 1_000_000_000_000) {
				return numeric;
			}
			return Date.now() - numeric;
		}

		const durationMatch = trimmed.match(/^(\d+)(ms|s|m|h)$/i);
		if (durationMatch) {
			const amount = Number.parseInt(durationMatch[1], 10);
			if (!Number.isFinite(amount) || amount <= 0) {
				return undefined;
			}
			const unit = durationMatch[2].toLowerCase();
			const multiplier =
				unit === "ms"
					? 1
					: unit === "s"
						? 1_000
						: unit === "m"
							? 60_000
							: 3_600_000;
			return Date.now() - amount * multiplier;
		}

		const parsedDate = Date.parse(trimmed);
		if (Number.isNaN(parsedDate)) {
			return undefined;
		}
		return parsedDate;
	} catch {
		return undefined;
	}
}

function pruneConsoleEntries(): void {
	try {
		if (consoleEntries.length <= MAX_CONSOLE_ENTRIES) {
			return;
		}
		consoleEntries.splice(0, consoleEntries.length - MAX_CONSOLE_ENTRIES);
	} catch {
		// no-op
	}
}

function injectRendererErrorCapture({
	webContents,
}: {
	webContents: WebContents;
}): void {
	void webContents
		.executeJavaScript(`(() => {
			if (window.__qcutConsoleCaptureInstalled) {
				return true;
			}
			window.__qcutConsoleCaptureInstalled = true;
			window.addEventListener("error", (event) => {
				const source = event.filename || "window.onerror";
				const line = typeof event.lineno === "number" ? event.lineno : 0;
				const message = event.message || "Unhandled renderer error";
				console.error("[renderer-error]", source, line, message);
			});
			window.addEventListener("unhandledrejection", (event) => {
				const reason = event.reason;
				let message = "Unhandled promise rejection";
				if (typeof reason === "string") {
					message = reason;
				} else if (reason instanceof Error) {
					message = reason.stack || reason.message;
				} else {
					try {
						message = JSON.stringify(reason);
					} catch {
						message = String(reason);
					}
				}
				console.error("[renderer-unhandledrejection]", message);
			});
			return true;
		})()`)
		.catch(() => {
			// Window may be navigating or destroyed. Ignore.
		});
}

export function recordConsoleEntry({
	level,
	message,
	source,
	line,
	timestamp,
}: {
	level: ClaudeConsoleLevel;
	message: string;
	source?: string;
	line?: number;
	timestamp?: number;
}): ClaudeConsoleEntry {
	const nextEntry: ClaudeConsoleEntry = {
		id: createConsoleEntryId(),
		level,
		message: redactConsoleText({ value: message }) ?? "",
		source: redactConsoleText({ value: source }),
		line,
		timestamp:
			typeof timestamp === "number" && Number.isFinite(timestamp)
				? timestamp
				: Date.now(),
	};

	consoleEntries.push(nextEntry);
	pruneConsoleEntries();
	consoleEmitter.emit("entry", nextEntry);
	return nextEntry;
}

export function attachConsoleCapture({
	window,
}: {
	window: BrowserWindow;
}): void {
	if (!isConsoleCaptureEnabled()) {
		return;
	}

	const { webContents } = window;
	if (attachedContents.has(webContents)) {
		return;
	}
	attachedContents.add(webContents);

	webContents.on(
		"console-message",
		(_event, level, message, line, sourceId: string) => {
			recordConsoleEntry({
				level: mapConsoleMessageLevel({ level }),
				message,
				line,
				source: sourceId,
			});
		}
	);

	webContents.on("render-process-gone", (_event, details) => {
		const extra = isObjectRecord(details)
			? JSON.stringify({
					reason: details.reason,
					exitCode: details.exitCode,
				})
			: "Renderer process exited unexpectedly";
		recordConsoleEntry({
			level: "error",
			message: `[render-process-gone] ${extra}`,
			source: "electron",
		});
	});

	webContents.on("did-finish-load", () => {
		injectRendererErrorCapture({ webContents });
	});
}

export function getConsoleEntries({
	level,
	since,
	limit,
	after,
}: ClaudeConsoleFilter = {}): ClaudeConsoleEntry[] {
	const normalizedLevel = normalizeLevel({ level });
	const sinceTimestamp = parseSinceToTimestamp({ since });
	const normalizedLimit = normalizeLimit({ limit });

	let filtered = [...consoleEntries];

	if (after && after.trim()) {
		const index = filtered.findIndex((entry) => entry.id === after.trim());
		if (index >= 0) {
			filtered = filtered.slice(index + 1);
		}
	}

	if (normalizedLevel) {
		filtered = filtered.filter((entry) => entry.level === normalizedLevel);
	}

	if (typeof sinceTimestamp === "number") {
		filtered = filtered.filter((entry) => entry.timestamp >= sinceTimestamp);
	}

	if (filtered.length <= normalizedLimit) {
		return filtered;
	}
	return filtered.slice(filtered.length - normalizedLimit);
}

export function clearConsoleEntries(): { clearedCount: number } {
	const clearedCount = consoleEntries.length;
	consoleEntries.splice(0, consoleEntries.length);
	return { clearedCount };
}

export function subscribeToConsoleEntries({
	listener,
}: {
	listener: (entry: ClaudeConsoleEntry) => void;
}): () => void {
	consoleEmitter.on("entry", listener);
	return () => {
		consoleEmitter.off("entry", listener);
	};
}

export function resetConsoleCaptureForTests(): void {
	consoleEntries.splice(0, consoleEntries.length);
	consoleEmitter.removeAllListeners("entry");
}

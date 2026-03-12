import type { IncomingMessage, ServerResponse } from "node:http";
import { parse } from "node:url";
import type { Router } from "../utils/http-router.js";
import { RESPONSE_HANDLED } from "../utils/http-router.js";
import type {
	ClaudeConsoleEntry,
	ClaudeConsoleFilter,
} from "../handlers/claude-console-handler.js";

const DEFAULT_STREAM_POLL_MS = 250;
const STREAM_HEARTBEAT_MS = 15_000;

type ListConsoleEntriesFn = (
	filter: ClaudeConsoleFilter
) => Promise<ClaudeConsoleEntry[]> | ClaudeConsoleEntry[];

type ClearConsoleEntriesFn = () =>
	| Promise<{ clearedCount: number }>
	| { clearedCount: number };

type SubscribeConsoleEntriesFn = (args: {
	listener: (entry: ClaudeConsoleEntry) => void;
}) => () => void;

interface ClaudeConsoleRouteOptions {
	listConsoleEntries: ListConsoleEntriesFn;
	clearConsoleEntries: ClearConsoleEntriesFn;
}

interface ClaudeConsoleStreamOptions extends ClaudeConsoleRouteOptions {
	req: IncomingMessage;
	res: ServerResponse;
	subscribeToConsoleEntries?: SubscribeConsoleEntriesFn;
	pollIntervalMs?: number;
}

function parseLimit({ value }: { value?: string }): number | undefined {
	try {
		if (!value) {
			return undefined;
		}
		const parsed = Number.parseInt(value, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

function parseConsoleFilter({
	query,
	forceLevel,
	fallbackAfter,
}: {
	query: Record<string, string>;
	forceLevel?: string;
	fallbackAfter?: string;
}): ClaudeConsoleFilter {
	return {
		level: forceLevel ?? query.level,
		since: query.since,
		limit: parseLimit({ value: query.limit }),
		after: query.after ?? fallbackAfter,
	};
}

function isConsoleStreamPath({ req }: { req: IncomingMessage }): boolean {
	try {
		if ((req.method || "GET").toUpperCase() !== "GET") {
			return false;
		}
		const parsed = parse(req.url || "/", true);
		return parsed.pathname === "/api/claude/console/stream";
	} catch {
		return false;
	}
}

function writeConsoleSseEvent({
	res,
	entry,
}: {
	res: ServerResponse;
	entry: ClaudeConsoleEntry;
}): boolean {
	try {
		res.write(`id: ${entry.id}\n`);
		res.write(`event: ${entry.level}\n`);
		res.write(`data: ${JSON.stringify(entry)}\n\n`);
		return true;
	} catch {
		return false;
	}
}

function setSseHeaders({ res }: { res: ServerResponse }): void {
	try {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		});
		if (typeof res.flushHeaders === "function") {
			res.flushHeaders();
		}
		res.write("retry: 1000\n");
		res.write(
			`event: ready\ndata: ${JSON.stringify({ ok: true, timestamp: Date.now() })}\n\n`
		);
	} catch {
		// no-op
	}
}

async function writeInitialEntries({
	res,
	listConsoleEntries,
	filter,
	updateLastEntryId,
}: {
	res: ServerResponse;
	listConsoleEntries: ListConsoleEntriesFn;
	filter: ClaudeConsoleFilter;
	updateLastEntryId: (entryId: string) => void;
}): Promise<void> {
	try {
		const entries = await listConsoleEntries(filter);
		for (const entry of entries) {
			if (!writeConsoleSseEvent({ res, entry })) {
				break;
			}
			updateLastEntryId(entry.id);
		}
	} catch {
		// no-op
	}
}

export function registerClaudeConsoleRoutes(
	router: Router,
	{ listConsoleEntries, clearConsoleEntries }: ClaudeConsoleRouteOptions
): void {
	router.get("/api/claude/console", async (req) => {
		const messages = await listConsoleEntries(
			parseConsoleFilter({ query: req.query })
		);
		return {
			messages,
			count: messages.length,
		};
	});

	router.delete("/api/claude/console", async () => {
		return await clearConsoleEntries();
	});

	router.get("/api/claude/errors", async (req) => {
		const messages = await listConsoleEntries(
			parseConsoleFilter({
				query: req.query,
				forceLevel: "error",
			})
		);
		return {
			messages,
			count: messages.length,
		};
	});
}

export function handleClaudeConsoleStreamRequest({
	req,
	res,
	listConsoleEntries,
	subscribeToConsoleEntries,
	pollIntervalMs = DEFAULT_STREAM_POLL_MS,
}: ClaudeConsoleStreamOptions): boolean {
	try {
		if (!isConsoleStreamPath({ req })) {
			return false;
		}

		const parsed = parse(req.url || "/", true);
		const query: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed.query)) {
			if (typeof value === "string") {
				query[key] = value;
			}
		}

		const headerLastEventId =
			typeof req.headers["last-event-id"] === "string"
				? req.headers["last-event-id"]
				: undefined;
		const baseFilter = parseConsoleFilter({
			query,
			fallbackAfter: headerLastEventId,
		});
		let closed = false;
		let lastEntryId = baseFilter.after;
		let pollTimer: NodeJS.Timeout | null = null;
		let heartbeatTimer: NodeJS.Timeout | null = null;
		let unsubscribe: (() => void) | null = null;
		let pollInFlight = false;

		const cleanup = () => {
			if (closed) {
				return;
			}
			closed = true;
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
			if (!res.writableEnded) {
				res.end();
			}
		};

		const updateLastEntryId = (entryId: string) => {
			lastEntryId = entryId;
		};

		const entryMatchesLevel = (entry: ClaudeConsoleEntry): boolean => {
			if (!baseFilter.level?.trim()) {
				return true;
			}
			return entry.level === baseFilter.level.trim().toLowerCase();
		};

		setSseHeaders({ res });

		void writeInitialEntries({
			res,
			listConsoleEntries,
			filter: baseFilter,
			updateLastEntryId,
		});

		const pollForEntries = async () => {
			if (closed || pollInFlight) {
				return;
			}
			pollInFlight = true;
			try {
				const entries = await listConsoleEntries({
					...baseFilter,
					after: lastEntryId,
				});
				for (const entry of entries) {
					if (!writeConsoleSseEvent({ res, entry })) {
						cleanup();
						return;
					}
					updateLastEntryId(entry.id);
				}
			} catch {
				cleanup();
			} finally {
				pollInFlight = false;
			}
		};

		if (subscribeToConsoleEntries) {
			unsubscribe = subscribeToConsoleEntries({
				listener: (entry) => {
					if (closed || !entryMatchesLevel(entry)) {
						return;
					}
					if (!writeConsoleSseEvent({ res, entry })) {
						cleanup();
						return;
					}
					updateLastEntryId(entry.id);
				},
			});
		} else {
			pollTimer = setInterval(() => {
				void pollForEntries();
			}, pollIntervalMs);
		}

		heartbeatTimer = setInterval(() => {
			try {
				res.write(`: heartbeat ${Date.now()}\n\n`);
			} catch {
				cleanup();
			}
		}, STREAM_HEARTBEAT_MS);

		req.on("close", cleanup);
		req.on("error", cleanup);
		res.on("close", cleanup);
		res.on("error", cleanup);

		return true;
	} catch {
		try {
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					success: false,
					error: "Failed to open console stream",
					timestamp: Date.now(),
				})
			);
		} catch {
			// no-op
		}
		return true;
	}
}

export { RESPONSE_HANDLED };

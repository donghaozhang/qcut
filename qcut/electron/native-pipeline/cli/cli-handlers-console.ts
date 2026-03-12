import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import { EditorApiError } from "../editor/editor-api-client.js";

function buildConsoleQuery({
	options,
	forceLevel,
}: {
	options: CLIRunOptions;
	forceLevel?: string;
}): Record<string, string> | undefined {
	const query: Record<string, string> = {};

	if (forceLevel) {
		query.level = forceLevel;
	} else if (options.level?.trim()) {
		query.level = options.level.trim();
	}

	if (options.since?.trim()) {
		query.since = options.since.trim();
	}

	if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
		query.limit = String(options.limit);
	}

	return Object.keys(query).length > 0 ? query : undefined;
}

export async function handleConsoleCommand({
	client,
	options,
	signal,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	signal?: AbortSignal;
}): Promise<CLIResult> {
	if (options.clear) {
		const data = await client.delete("/api/claude/console");
		return { success: true, data };
	}

	if (options.stream) {
		return await streamConsoleEntries({
			client,
			options,
			signal,
		});
	}

	const data = await client.get(
		"/api/claude/console",
		buildConsoleQuery({ options })
	);
	return { success: true, data };
}

export async function handleErrorsCommand({
	client,
	options,
	signal,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	signal?: AbortSignal;
}): Promise<CLIResult> {
	if (options.clear) {
		const data = await client.delete("/api/claude/console");
		return { success: true, data };
	}

	if (options.stream) {
		return await streamConsoleEntries({
			client,
			options,
			signal,
			forceLevel: "error",
		});
	}

	const data = await client.get(
		"/api/claude/errors",
		buildConsoleQuery({
			options,
			forceLevel: "error",
		})
	);
	return { success: true, data };
}

function formatConsoleEntry({
	entry,
	json,
}: {
	entry: Record<string, unknown>;
	json: boolean;
}): string {
	if (json) {
		return JSON.stringify(entry);
	}

	const level =
		typeof entry.level === "string" ? entry.level.toUpperCase() : "LOG";
	const source =
		typeof entry.source === "string" && entry.source.trim()
			? entry.source.trim()
			: "unknown";
	const line =
		typeof entry.line === "number" && Number.isFinite(entry.line)
			? `:${entry.line}`
			: "";
	const message =
		typeof entry.message === "string" ? entry.message : JSON.stringify(entry);
	return `[${level}] ${source}${line} ${message}`;
}

async function streamConsoleEntries({
	client,
	options,
	signal,
	forceLevel,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	signal?: AbortSignal;
	forceLevel?: string;
}): Promise<CLIResult> {
	try {
		await client.streamSse({
			path: "/api/claude/console/stream",
			query: buildConsoleQuery({
				options,
				forceLevel,
			}),
			signal,
			onEvent: (event) => {
				if (!event.data) {
					return;
				}
				try {
					const parsed = JSON.parse(event.data) as Record<string, unknown>;
					if (
						typeof parsed.ok === "boolean" &&
						typeof parsed.timestamp === "number"
					) {
						return;
					}
					console.log(
						formatConsoleEntry({
							entry: parsed,
							json: options.json,
						})
					);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new EditorApiError(`Failed to parse console event: ${message}`);
				}
			},
		});
		return { success: true };
	} catch (error) {
		if (signal?.aborted) {
			return { success: true };
		}
		throw error;
	}
}

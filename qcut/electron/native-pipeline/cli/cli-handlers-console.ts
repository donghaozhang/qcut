import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

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
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (options.clear) {
		const data = await client.delete("/api/claude/console");
		return { success: true, data };
	}

	if (options.stream) {
		return {
			success: false,
			error:
				"editor:console --stream is not implemented in the CLI yet. Use the HTTP SSE endpoint /api/claude/console/stream directly for now.",
		};
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
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (options.clear) {
		const data = await client.delete("/api/claude/console");
		return { success: true, data };
	}

	if (options.stream) {
		return {
			success: false,
			error:
				"editor:errors --stream is not implemented in the CLI yet. Use the HTTP SSE endpoint /api/claude/console/stream?level=error directly for now.",
		};
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

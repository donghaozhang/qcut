import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

function buildSnapshotQuery({
	options,
}: {
	options: CLIRunOptions;
}): Record<string, string> | undefined {
	const query: Record<string, string> = {};

	if (options.interactive) {
		query.interactive = "true";
	}

	if (typeof options.depth === "number" && Number.isFinite(options.depth)) {
		query.depth = String(options.depth);
	}

	return Object.keys(query).length > 0 ? query : undefined;
}

export async function handleSnapshotCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2];

	if (action === "click") {
		return await handleSnapshotClickCommand({ client, options });
	}

	if (action === "fill") {
		return await handleSnapshotFillCommand({ client, options });
	}

	if (action === "select") {
		return await handleSnapshotSelectCommand({ client, options });
	}

	if (action === "check") {
		return await handleSnapshotCheckCommand({ client, options });
	}

	if (action) {
		return {
			success: false,
			error: `Unknown snapshot action: ${action}. Available: click, fill, select, check`,
		};
	}

	const data = await client.get(
		"/api/claude/snapshot",
		buildSnapshotQuery({ options })
	);
	return { success: true, data };
}

async function handleSnapshotClickCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (!options.ref) {
		return {
			success: false,
			error: "Snapshot click requires --ref <@eN>",
		};
	}

	const data = await client.post("/api/claude/snapshot/click", {
		ref: options.ref,
	});
	return { success: true, data };
}

async function handleSnapshotFillCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (!options.ref) {
		return {
			success: false,
			error: "Snapshot fill requires --ref <@eN>",
		};
	}

	if (typeof options.text !== "string") {
		return {
			success: false,
			error: "Snapshot fill requires --text <value>",
		};
	}

	const data = await client.post("/api/claude/snapshot/fill", {
		ref: options.ref,
		value: options.text,
	});
	return { success: true, data };
}

async function handleSnapshotSelectCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (!options.ref) {
		return {
			success: false,
			error: "Snapshot select requires --ref <@eN>",
		};
	}

	if (typeof options.selectValue !== "string") {
		return {
			success: false,
			error: "Snapshot select requires --value <option>",
		};
	}

	const data = await client.post("/api/claude/snapshot/select", {
		ref: options.ref,
		value: options.selectValue,
	});
	return { success: true, data };
}

async function handleSnapshotCheckCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (!options.ref) {
		return {
			success: false,
			error: "Snapshot check requires --ref <@eN>",
		};
	}

	if (typeof options.checked !== "boolean") {
		return {
			success: false,
			error: "Snapshot check requires --checked <true|false>",
		};
	}

	const data = await client.post("/api/claude/snapshot/check", {
		ref: options.ref,
		checked: options.checked,
	});
	return { success: true, data };
}

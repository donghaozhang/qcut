/**
 * Handler for `pipeline:status` — query pipeline job progress.
 *
 * Proxies to the QCut editor HTTP API at /api/claude/pipeline/jobs/:jobId.
 *
 * @module electron/native-pipeline/cli/cli-runner/handler-pipeline-status
 */

import type { CLIRunOptions, CLIResult } from "./types.js";
import { createEditorClient } from "../../editor/editor-api-client.js";

export async function handlePipelineStatus(
	options: CLIRunOptions
): Promise<CLIResult> {
	if (!options.jobId) {
		return { success: false, error: "Missing --job-id" };
	}

	const client = createEditorClient(options);

	const healthy = await client.checkHealth();
	if (!healthy) {
		const host = options.host ?? process.env.QCUT_API_HOST ?? "127.0.0.1";
		const port = options.port ?? process.env.QCUT_API_PORT ?? "8765";
		return {
			success: false,
			error: `QCut editor not running at http://${host}:${port}\nStart QCut with: bun run electron:dev`,
		};
	}

	const data = await client.get(
		`/api/claude/pipeline/jobs/${options.jobId}`
	);
	return { success: true, data };
}

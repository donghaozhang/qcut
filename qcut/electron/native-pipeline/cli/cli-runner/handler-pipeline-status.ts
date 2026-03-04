/**
 * Handler for `pipeline:status` — query pipeline job progress.
 *
 * Proxies to the QCut editor HTTP API at /api/claude/pipeline/jobs/:jobId.
 *
 * @module electron/native-pipeline/cli/cli-runner/handler-pipeline-status
 */

import type { CLIRunOptions, CLIResult } from "./types.js";
import { createEditorClient } from "../../editor/editor-api-client.js";

/** Query pipeline job progress via the editor HTTP API. */
export async function handlePipelineStatus(
	options: CLIRunOptions
): Promise<CLIResult> {
	if (!options.jobId) {
		return { success: false, error: "Missing --job-id" };
	}

	const client = createEditorClient(options);

	try {
		const healthy = await client.checkHealth();
		if (!healthy) {
			return {
				success: false,
				error: `QCut editor not reachable\nStart QCut with: bun run electron:dev`,
			};
		}

		const data = await client.get(
			`/api/claude/pipeline/jobs/${encodeURIComponent(options.jobId)}`
		);
		return { success: true, data };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

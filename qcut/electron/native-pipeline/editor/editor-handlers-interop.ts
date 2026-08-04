import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";
import { parseQCutPersistedImportEvidenceSnapshot } from "../../types/qcut-import-evidence-validation.js";
import type { EditorApiClient } from "./editor-api-client.js";

const CAPTURE_TIMEOUT_MS = 30 * 60 * 1000;

function requireBundleDigest({ value }: { value: string | undefined }): string {
	if (value === undefined || !/^[a-f0-9]{64}$/.test(value)) {
		throw new Error("--bundle-digest must be a lowercase SHA-256 digest");
	}
	return value;
}

export async function handleInteropCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	if (action !== "import-snapshot") {
		return {
			success: false,
			error: `Unknown interop action: ${action ?? ""}. Available: import-snapshot`,
		};
	}
	if (options.projectId === undefined || options.projectId.length === 0) {
		return { success: false, error: "Missing --project-id" };
	}
	let bundleDigest: string;
	try {
		bundleDigest = requireBundleDigest({ value: options.bundleDigest });
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
	const snapshot = parseQCutPersistedImportEvidenceSnapshot({
		value: await client.post(
			"/api/claude/interop/import-snapshot",
			{
				expectedBundleDigest: bundleDigest,
				projectId: options.projectId,
			},
			{ timeout: CAPTURE_TIMEOUT_MS }
		),
	});
	if (
		snapshot.project.id !== options.projectId ||
		snapshot.binding.bundleDigest !== bundleDigest
	) {
		return {
			success: false,
			error: "Captured evidence does not match the requested project binding.",
		};
	}
	if (options.output === undefined) {
		return { success: true, data: snapshot };
	}
	const outputPath = resolve(options.output);
	await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
		mode: 0o600,
	});
	return {
		success: true,
		data: {
			binding: snapshot.binding,
			capture: snapshot.capture,
			mediaCount: snapshot.media.length,
			outputPath,
			project: snapshot.project,
			schema: snapshot.schema,
			trackCount: snapshot.tracks.length,
		},
		outputPath,
	};
}

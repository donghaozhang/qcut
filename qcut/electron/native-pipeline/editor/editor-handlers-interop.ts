import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";
import { parseQCutPersistedImportEvidenceSnapshot } from "../../types/qcut-import-evidence-validation.js";
import type { QCutSameProfileWritebackResult } from "../../types/qcut-same-profile-writeback-api.js";
import { parseQCutSameProfileWritebackResult } from "../../types/qcut-same-profile-writeback-validation.js";
import type { QCutJianyingProjectExportResult } from "../../types/qcut-jianying-project-export-api.js";
import { parseQCutJianyingProjectExportResult } from "../../types/qcut-jianying-project-export-validation.js";
import type { EditorApiClient } from "./editor-api-client.js";

const CAPTURE_TIMEOUT_MS = 30 * 60 * 1000;

class InteropArgumentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InteropArgumentError";
	}
}

function requireBundleDigest({ value }: { value: string | undefined }): string {
	if (value === undefined || !/^[a-f0-9]{64}$/.test(value)) {
		throw new InteropArgumentError(
			"--bundle-digest must be a lowercase SHA-256 digest"
		);
	}
	return value;
}

function requireProjectId({ value }: { value: string | undefined }): string {
	if (value === undefined || value.length === 0) {
		throw new InteropArgumentError("Missing --project-id");
	}
	return value;
}

function requireJianyingFormat({
	value,
}: {
	value: string | undefined;
}): "jianying" {
	if (value === undefined || value.trim().toLowerCase() === "jianying") {
		return "jianying";
	}
	throw new InteropArgumentError(
		"--format must be 'jianying' for persisted draft export"
	);
}

function requireRecoveryToken({
	value,
}: {
	value: string | undefined;
}): string {
	if (
		value === undefined ||
		value.length === 0 ||
		value.length > 128 ||
		value.includes("\0")
	) {
		throw new InteropArgumentError(
			"--recovery-token must be a bounded non-empty token"
		);
	}
	return value;
}

function toCLIWritebackResult({
	result,
}: {
	result: QCutSameProfileWritebackResult;
}): CLIResult {
	if (result.outcome === "blocked" || result.outcome === "failed") {
		return { data: result, error: result.message, success: false };
	}
	return { data: result, success: true };
}

function toCLIProjectExportResult({
	result,
}: {
	result: QCutJianyingProjectExportResult;
}): CLIResult {
	if (result.outcome === "blocked" || result.outcome === "failed") {
		return { data: result, error: result.message, success: false };
	}
	return { data: result, success: true };
}

async function handleJianyingProjectExport({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	requireJianyingFormat({ value: options.format });
	const projectId = requireProjectId({ value: options.projectId });
	const result = parseQCutJianyingProjectExportResult({
		value: await client.post(
			"/api/claude/interop/jianying-project-export",
			{ projectId },
			{ timeout: CAPTURE_TIMEOUT_MS }
		),
	});
	if (result.projectId !== projectId) {
		return {
			error: "Jianying export result does not match the requested project.",
			success: false,
		};
	}
	return toCLIProjectExportResult({ result });
}

async function handleWriteback({
	client,
	projectId,
}: {
	client: EditorApiClient;
	projectId: string;
}): Promise<CLIResult> {
	const result = parseQCutSameProfileWritebackResult({
		value: await client.post(
			"/api/claude/interop/writeback",
			{ action: "writeback", projectId },
			{ timeout: CAPTURE_TIMEOUT_MS }
		),
	});
	if (result.operation !== "writeback" || result.projectId !== projectId) {
		return {
			error: "Writeback result does not match the requested project.",
			success: false,
		};
	}
	return toCLIWritebackResult({ result });
}

async function handleWritebackRecovery({
	client,
	recoveryToken,
}: {
	client: EditorApiClient;
	recoveryToken: string;
}): Promise<CLIResult> {
	const result = parseQCutSameProfileWritebackResult({
		value: await client.post(
			"/api/claude/interop/writeback",
			{ action: "recover", recoveryToken },
			{ timeout: CAPTURE_TIMEOUT_MS }
		),
	});
	if (result.operation !== "recover") {
		return {
			error: "Recovery result does not match the requested operation.",
			success: false,
		};
	}
	return toCLIWritebackResult({ result });
}

async function handleImportSnapshot({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const projectId = requireProjectId({ value: options.projectId });
	const bundleDigest = requireBundleDigest({ value: options.bundleDigest });
	const snapshot = parseQCutPersistedImportEvidenceSnapshot({
		value: await client.post(
			"/api/claude/interop/import-snapshot",
			{
				expectedBundleDigest: bundleDigest,
				projectId,
			},
			{ timeout: CAPTURE_TIMEOUT_MS }
		),
	});
	if (
		snapshot.project.id !== projectId ||
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

export async function handleInteropCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	try {
		switch (action) {
			case "import-snapshot":
				return await handleImportSnapshot({ client, options });
			case "jianying-export":
				return await handleJianyingProjectExport({ client, options });
			case "writeback":
				return await handleWriteback({
					client,
					projectId: requireProjectId({ value: options.projectId }),
				});
			case "writeback-recover":
				return await handleWritebackRecovery({
					client,
					recoveryToken: requireRecoveryToken({
						value: options.recoveryToken,
					}),
				});
			default:
				return {
					error: `Unknown interop action: ${action ?? ""}. Available: import-snapshot, jianying-export, writeback, writeback-recover`,
					success: false,
				};
		}
	} catch (error) {
		if (error instanceof InteropArgumentError) {
			return { error: error.message, success: false };
		}
		throw error;
	}
}

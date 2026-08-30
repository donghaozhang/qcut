import { execFile } from "node:child_process";

export interface QCutCliJsonEnvelope extends Record<string, unknown> {
	data?: Record<string, unknown>;
	jobId?: string;
	status?: string;
}

export interface QCutPipelineCliEvidence {
	apiPort: number;
	envelopes: QCutCliJsonEnvelope[];
	stderr: string;
}

function parseCliJsonEnvelopes({
	stdout,
}: {
	stdout: string;
}): QCutCliJsonEnvelope[] {
	const documents = stdout
		.trim()
		.split(/(?=^\{)/m)
		.map((document) => document.trim())
		.filter(Boolean);
	if (documents.length === 0) {
		throw new Error(`QCut CLI produced no JSON envelopes: ${stdout}`);
	}
	return documents.map((document) => {
		const parsed: unknown = JSON.parse(document);
		if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
			throw new Error(`QCut CLI emitted a non-object JSON value: ${document}`);
		}
		return parsed as QCutCliJsonEnvelope;
	});
}

export function runQCutPipelineCli({
	apiPort,
	args,
	timeoutMs = 240_000,
}: {
	apiPort: number;
	args: string[];
	timeoutMs?: number;
}): Promise<QCutPipelineCliEvidence> {
	return new Promise((resolve, reject) => {
		execFile(
			"bun",
			[
				"--silent",
				"run",
				"pipeline",
				"--",
				...args,
				"--port",
				String(apiPort),
				"--json",
			],
			{
				cwd: process.cwd(),
				env: { ...process.env, QCUT_API_PORT: String(apiPort) },
				maxBuffer: 4 * 1024 * 1024,
				timeout: timeoutMs,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(
						new Error(`QCut CLI failed: ${stderr || stdout || error.message}`)
					);
					return;
				}
				resolve({
					apiPort,
					envelopes: parseCliJsonEnvelopes({ stdout }),
					stderr,
				});
			}
		);
	});
}

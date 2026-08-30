import type { QCutPipelineCliEvidence } from "./qcut-pipeline-cli";
import { runQCutPipelineCli } from "./qcut-pipeline-cli";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";

export interface StickerLabCliGeometry {
	height: number;
	width: number;
	x: number;
	y: number;
}

export interface StickerLabCliAddResult {
	elementId: string;
	evidence: QCutPipelineCliEvidence;
}

const PROJECT_READINESS_ERROR =
	"No active editor project could be confirmed. Try again after QCut finishes loading.";

function waitForRetry({ delayMs }: { delayMs: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function runStickerCliWithReadinessRetry({
	apiPort,
	args,
	attempt = 0,
}: {
	apiPort: number;
	args: string[];
	attempt?: number;
}): Promise<QCutPipelineCliEvidence> {
	try {
		return await runQCutPipelineCli({ apiPort, args });
	} catch (error) {
		const isTransient =
			error instanceof Error && error.message.includes(PROJECT_READINESS_ERROR);
		if (!(isTransient && attempt < 3)) throw error;
		await waitForRetry({ delayMs: 250 * (attempt + 1) });
		return runStickerCliWithReadinessRetry({
			apiPort,
			args,
			attempt: attempt + 1,
		});
	}
}

function completedData({
	command,
	evidence,
}: {
	command: string;
	evidence: QCutPipelineCliEvidence;
}): Record<string, unknown> {
	const completed = evidence.envelopes.at(-1);
	if (completed?.status !== "ok") {
		throw new Error(
			`${command} did not complete: ${JSON.stringify(completed ?? evidence.envelopes)}`
		);
	}
	const outerData = completed.data;
	if (!outerData || outerData.command !== command) {
		throw new Error(`${command} returned an unexpected CLI envelope`);
	}
	const data = outerData.data;
	if (!(data && typeof data === "object" && !Array.isArray(data))) {
		throw new Error(`${command} returned no result data`);
	}
	return data as Record<string, unknown>;
}

function requiredString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Missing ${label} in Sticker Lab CLI result`);
	}
	return value;
}

function assertLocalReferenceProvenance({
	data,
	rootPath,
	sample,
}: {
	data: Record<string, unknown>;
	rootPath: string;
	sample: StratifiedStickerSample;
}): void {
	const provenance = data.provenance;
	if (!(provenance && typeof provenance === "object")) {
		throw new Error(`Sticker ${sample.itemId} has no CLI provenance`);
	}
	const actual = provenance as Record<string, unknown>;
	const expected: Record<string, unknown> = {
		batchId: sample.batchId,
		byteSize: sample.byteSize,
		checksumSha256: sample.checksumSha256,
		kind: "local-reference",
		rootPath,
		stickerId: sample.itemId,
	};
	for (const [key, value] of Object.entries(expected)) {
		if (actual[key] !== value) {
			throw new Error(
				`Sticker ${sample.itemId} provenance mismatch for ${key}`
			);
		}
	}
	if (
		data.redistribution !== "prohibited" ||
		data.referenceOnly !== true ||
		data.usage !== "internal-reference-only"
	) {
		throw new Error(`Sticker ${sample.itemId} lost private-use restrictions`);
	}
}

export async function addStickerLabReferenceWithCli({
	apiPort,
	endTime,
	geometry,
	opacity = 1,
	projectId,
	rootPath,
	sample,
	startTime,
}: {
	apiPort: number;
	endTime: number;
	geometry: StickerLabCliGeometry;
	opacity?: number;
	projectId: string;
	rootPath: string;
	sample: StratifiedStickerSample;
	startTime: number;
}): Promise<StickerLabCliAddResult> {
	const evidence = await runStickerCliWithReadinessRetry({
		apiPort,
		args: [
			"editor:sticker:add",
			"--project-id",
			projectId,
			"--provider",
			"sticker-lab",
			"--root",
			rootPath,
			"--batch-id",
			sample.batchId,
			"--sticker-id",
			sample.itemId,
			"--x",
			String(geometry.x),
			"--y",
			String(geometry.y),
			"--width",
			String(geometry.width),
			"--height",
			String(geometry.height),
			"--start-time",
			String(startTime),
			"--end-time",
			String(endTime),
			"--opacity",
			String(opacity),
		],
	});
	const data = completedData({ command: "editor:sticker:add", evidence });
	assertLocalReferenceProvenance({ data, rootPath, sample });
	const timeline = data.timeline;
	if (!(timeline && typeof timeline === "object")) {
		throw new Error(`Sticker ${sample.itemId} has no CLI timeline result`);
	}
	return {
		elementId: requiredString({
			label: "timeline.elementId",
			value: (timeline as Record<string, unknown>).elementId,
		}),
		evidence,
	};
}

export async function updateStickerWithCli({
	apiPort,
	elementId,
	endTime,
	geometry,
	opacity = 1,
	projectId,
	startTime,
}: {
	apiPort: number;
	elementId: string;
	endTime: number;
	geometry: StickerLabCliGeometry;
	opacity?: number;
	projectId: string;
	startTime: number;
}): Promise<QCutPipelineCliEvidence> {
	const evidence = await runStickerCliWithReadinessRetry({
		apiPort,
		args: [
			"editor:sticker:update",
			"--project-id",
			projectId,
			"--element-id",
			elementId,
			"--x",
			String(geometry.x),
			"--y",
			String(geometry.y),
			"--width",
			String(geometry.width),
			"--height",
			String(geometry.height),
			"--start-time",
			String(startTime),
			"--end-time",
			String(endTime),
			"--opacity",
			String(opacity),
		],
	});
	completedData({ command: "editor:sticker:update", evidence });
	return evidence;
}

export async function removeStickerWithCli({
	apiPort,
	elementId,
	projectId,
}: {
	apiPort: number;
	elementId: string;
	projectId: string;
}): Promise<QCutPipelineCliEvidence> {
	const evidence = await runStickerCliWithReadinessRetry({
		apiPort,
		args: [
			"editor:sticker:remove",
			"--project-id",
			projectId,
			"--element-id",
			elementId,
		],
	});
	completedData({ command: "editor:sticker:remove", evidence });
	return evidence;
}

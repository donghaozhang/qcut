import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	open,
	readFile,
	rename,
	rm,
	stat,
	unlink,
} from "node:fs/promises";
import { join } from "node:path";
import type {
	PlanarTrackingResultStore,
	StoredPlanarTrackingResult,
} from "../editor-core-tracking-runtime.js";
import {
	createPlanarTrackingResultUri,
	parsePlanarTrackingResultUri,
	parsePlanarTrackingSidecar,
	serializePlanarTrackingSidecar,
} from "../editor-core-tracking-runtime.js";

const MAX_PLANAR_TRACKING_RESULT_BYTES = 256 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f\d]{64}$/i;

function sha256({ serialized }: { serialized: string }): string {
	return createHash("sha256").update(serialized, "utf8").digest("hex");
}

function isMissingFileError({ cause }: { cause: unknown }): boolean {
	return (
		typeof cause === "object" &&
		cause !== null &&
		Reflect.get(cause, "code") === "ENOENT"
	);
}

export class ProjectFilePlanarTrackingResultStore
	implements PlanarTrackingResultStore
{
	private readonly resolveProjectRoot: ({
		projectId,
	}: {
		projectId: string;
	}) => Promise<string>;

	constructor({
		resolveProjectRoot,
	}: {
		resolveProjectRoot: ({
			projectId,
		}: {
			projectId: string;
		}) => Promise<string>;
	}) {
		this.resolveProjectRoot = resolveProjectRoot;
	}

	private async resolveResultPath({
		projectId,
		trackingId,
	}: {
		projectId: string;
		trackingId: string;
	}): Promise<{ directory: string; filePath: string }> {
		const projectRoot = await this.resolveProjectRoot({ projectId });
		const directory = join(projectRoot, "tracking", "planar");
		return { directory, filePath: join(directory, `${trackingId}.json`) };
	}

	async write({
		projectId,
		trackingId,
		sidecar,
	}: Parameters<
		PlanarTrackingResultStore["write"]
	>[0]): Promise<StoredPlanarTrackingResult> {
		const resultUri = createPlanarTrackingResultUri({ trackingId });
		const serialized = serializePlanarTrackingSidecar({ sidecar });
		const resultSha256 = sha256({ serialized });
		const { directory, filePath } = await this.resolveResultPath({
			projectId,
			trackingId,
		});
		await mkdir(directory, { recursive: true });
		const temporaryPath = join(
			directory,
			`.${trackingId}.${randomUUID()}.pending`
		);
		const handle = await open(temporaryPath, "wx", 0o600);
		try {
			await handle.writeFile(serialized, "utf8");
			await handle.sync();
		} finally {
			await handle.close();
		}
		try {
			await rename(temporaryPath, filePath);
		} catch (cause) {
			await rm(temporaryPath, { force: true });
			throw cause;
		}
		return {
			resultSha256,
			resultUri,
			sidecar: parsePlanarTrackingSidecar({ serialized }),
		};
	}

	async read({
		expectedSha256,
		projectId,
		resultUri,
	}: Parameters<
		PlanarTrackingResultStore["read"]
	>[0]): Promise<StoredPlanarTrackingResult> {
		if (!SHA256_PATTERN.test(expectedSha256)) {
			throw new Error("Expected planar tracking SHA-256 is invalid.");
		}
		const trackingId = parsePlanarTrackingResultUri({ resultUri });
		const { filePath } = await this.resolveResultPath({
			projectId,
			trackingId,
		});
		const fileStats = await stat(filePath);
		if (
			!fileStats.isFile() ||
			fileStats.size > MAX_PLANAR_TRACKING_RESULT_BYTES
		) {
			throw new Error("Planar tracking result file is invalid or too large.");
		}
		const serialized = await readFile(filePath, "utf8");
		const resultSha256 = sha256({ serialized });
		if (resultSha256 !== expectedSha256.toLowerCase()) {
			throw new Error("Planar tracking result SHA-256 mismatch.");
		}
		return {
			resultSha256,
			resultUri,
			sidecar: parsePlanarTrackingSidecar({ serialized }),
		};
	}

	async remove({
		projectId,
		resultUri,
	}: Parameters<PlanarTrackingResultStore["remove"]>[0]): Promise<void> {
		const trackingId = parsePlanarTrackingResultUri({ resultUri });
		const { filePath } = await this.resolveResultPath({
			projectId,
			trackingId,
		});
		try {
			await unlink(filePath);
		} catch (cause) {
			if (!isMissingFileError({ cause })) throw cause;
		}
	}
}

import type {
	PlanarTrackingResultStore,
	StoredPlanarTrackingResult,
} from "@qcut/editor-core";
import {
	createPlanarTrackingResultUri,
	parsePlanarTrackingResultUri,
	parsePlanarTrackingSidecar,
	serializePlanarTrackingSidecar,
} from "@qcut/editor-core";
import {
	IndexedDbPlanarTrackingResultEntryStorage,
	type PlanarTrackingResultEntryStorage,
} from "./indexeddb-planar-result-entry-storage";

const SHA256_PATTERN = /^[a-f\d]{64}$/i;

function resultKey({
	projectId,
	trackingId,
}: {
	projectId: string;
	trackingId: string;
}): string {
	if (projectId.trim().length === 0) {
		throw new Error("Planar tracking project id must be non-empty.");
	}
	return JSON.stringify([projectId, trackingId]);
}

function bytesToHex({ bytes }: { bytes: ArrayBuffer }): string {
	return Array.from(new Uint8Array(bytes), (value) =>
		value.toString(16).padStart(2, "0")
	).join("");
}

async function sha256({ serialized }: { serialized: string }): Promise<string> {
	if (!globalThis.crypto?.subtle) {
		throw new Error("SHA-256 verification is unavailable.");
	}
	return bytesToHex({
		bytes: await globalThis.crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(serialized)
		),
	});
}

export class BrowserPlanarTrackingResultStore
	implements PlanarTrackingResultStore
{
	private readonly storage: PlanarTrackingResultEntryStorage;

	constructor({
		storage = new IndexedDbPlanarTrackingResultEntryStorage(),
	}: {
		storage?: PlanarTrackingResultEntryStorage;
	} = {}) {
		this.storage = storage;
	}

	async write({
		projectId,
		trackingId,
		sidecar,
	}: Parameters<
		PlanarTrackingResultStore["write"]
	>[0]): Promise<StoredPlanarTrackingResult> {
		const resultUri = createPlanarTrackingResultUri({ trackingId });
		const key = resultKey({ projectId, trackingId });
		const serialized = serializePlanarTrackingSidecar({ sidecar });
		const resultSha256 = await sha256({ serialized });
		await this.storage.put({
			entry: {
				key,
				projectId,
				resultSha256,
				resultUri,
				serialized,
				trackingId,
				updatedAt: Date.now(),
			},
		});
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
		const entry = await this.storage.get({
			key: resultKey({ projectId, trackingId }),
		});
		if (!entry || entry.resultUri !== resultUri) {
			throw new Error("Planar tracking result was not found.");
		}
		const resultSha256 = await sha256({ serialized: entry.serialized });
		if (
			entry.resultSha256 !== resultSha256 ||
			resultSha256 !== expectedSha256.toLowerCase()
		) {
			throw new Error("Planar tracking result SHA-256 mismatch.");
		}
		return {
			resultSha256,
			resultUri,
			sidecar: parsePlanarTrackingSidecar({ serialized: entry.serialized }),
		};
	}

	async remove({
		projectId,
		resultUri,
	}: Parameters<PlanarTrackingResultStore["remove"]>[0]): Promise<void> {
		const trackingId = parsePlanarTrackingResultUri({ resultUri });
		await this.storage.remove({ key: resultKey({ projectId, trackingId }) });
	}
}

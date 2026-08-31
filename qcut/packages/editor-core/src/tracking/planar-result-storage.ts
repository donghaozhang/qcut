import type { PlanarTrackingSidecarV1 } from "./planar-types.js";

const PLANAR_TRACKING_RESULT_URI_PREFIX = "project-tracking:";
const PLANAR_TRACKING_STORAGE_ID_PATTERN = /^[a-z\d][a-z\d._-]{0,127}$/i;

export interface StoredPlanarTrackingResult {
	resultSha256: string;
	resultUri: string;
	sidecar: PlanarTrackingSidecarV1;
}

export interface PlanarTrackingResultStore {
	write: ({
		projectId,
		trackingId,
		sidecar,
	}: {
		projectId: string;
		trackingId: string;
		sidecar: PlanarTrackingSidecarV1;
	}) => Promise<StoredPlanarTrackingResult>;
	read: ({
		expectedSha256,
		projectId,
		resultUri,
	}: {
		expectedSha256: string;
		projectId: string;
		resultUri: string;
	}) => Promise<StoredPlanarTrackingResult>;
	remove: ({
		projectId,
		resultUri,
	}: {
		projectId: string;
		resultUri: string;
	}) => Promise<void>;
}

export function isPlanarTrackingStorageId({
	trackingId,
}: {
	trackingId: string;
}): boolean {
	return PLANAR_TRACKING_STORAGE_ID_PATTERN.test(trackingId);
}

export function createPlanarTrackingResultUri({
	trackingId,
}: {
	trackingId: string;
}): string {
	if (!isPlanarTrackingStorageId({ trackingId })) {
		throw new Error("Invalid planar tracking storage id.");
	}
	return `${PLANAR_TRACKING_RESULT_URI_PREFIX}${trackingId}`;
}

export function parsePlanarTrackingResultUri({
	resultUri,
}: {
	resultUri: string;
}): string {
	if (!resultUri.startsWith(PLANAR_TRACKING_RESULT_URI_PREFIX)) {
		throw new Error("Invalid planar tracking result URI.");
	}
	const trackingId = resultUri.slice(PLANAR_TRACKING_RESULT_URI_PREFIX.length);
	if (!isPlanarTrackingStorageId({ trackingId })) {
		throw new Error("Invalid planar tracking result URI.");
	}
	return trackingId;
}

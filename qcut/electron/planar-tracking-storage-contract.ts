import type {
	PlanarTrackingResultStore,
	PlanarTrackingSidecarV1,
	StoredPlanarTrackingResult,
} from "@qcut/editor-core";

export const PLANAR_TRACKING_STORAGE_WRITE_CHANNEL =
	"planar-tracking-storage:write";
export const PLANAR_TRACKING_STORAGE_READ_CHANNEL =
	"planar-tracking-storage:read";
export const PLANAR_TRACKING_STORAGE_REMOVE_CHANNEL =
	"planar-tracking-storage:remove";

export interface PlanarTrackingStorageWriteRequest {
	projectId: string;
	trackingId: string;
	sidecar: PlanarTrackingSidecarV1;
}

export interface PlanarTrackingStorageReadRequest {
	expectedSha256: string;
	projectId: string;
	resultUri: string;
}

export interface PlanarTrackingStorageRemoveRequest {
	projectId: string;
	resultUri: string;
}

export interface PlanarTrackingStorageAPI extends PlanarTrackingResultStore {
	write: (
		request: PlanarTrackingStorageWriteRequest
	) => Promise<StoredPlanarTrackingResult>;
	read: (
		request: PlanarTrackingStorageReadRequest
	) => Promise<StoredPlanarTrackingResult>;
	remove: (request: PlanarTrackingStorageRemoveRequest) => Promise<void>;
}

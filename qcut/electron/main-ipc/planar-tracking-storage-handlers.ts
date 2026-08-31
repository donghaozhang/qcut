import type { PlanarTrackingSidecarV1 } from "@qcut/editor-core";
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
	PLANAR_TRACKING_STORAGE_READ_CHANNEL,
	PLANAR_TRACKING_STORAGE_REMOVE_CHANNEL,
	PLANAR_TRACKING_STORAGE_WRITE_CHANNEL,
	type PlanarTrackingStorageReadRequest,
	type PlanarTrackingStorageRemoveRequest,
	type PlanarTrackingStorageWriteRequest,
} from "../planar-tracking-storage-contract.js";
import { ProjectFilePlanarTrackingResultStore } from "../planar-tracking-storage/result-store.js";
import {
	ensureProjectStructure,
	getProjectRoot,
} from "../lib/project-structure.js";

function requireRecord({ value }: { value: unknown }): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Planar tracking storage request must be an object.");
	}
	return value as Record<string, unknown>;
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function parseWriteRequest({
	value,
}: {
	value: unknown;
}): PlanarTrackingStorageWriteRequest {
	const request = requireRecord({ value });
	return {
		projectId: requireString({ label: "projectId", value: request.projectId }),
		trackingId: requireString({
			label: "trackingId",
			value: request.trackingId,
		}),
		sidecar: request.sidecar as PlanarTrackingSidecarV1,
	};
}

function parseReadRequest({
	value,
}: {
	value: unknown;
}): PlanarTrackingStorageReadRequest {
	const request = requireRecord({ value });
	return {
		expectedSha256: requireString({
			label: "expectedSha256",
			value: request.expectedSha256,
		}),
		projectId: requireString({ label: "projectId", value: request.projectId }),
		resultUri: requireString({ label: "resultUri", value: request.resultUri }),
	};
}

function parseRemoveRequest({
	value,
}: {
	value: unknown;
}): PlanarTrackingStorageRemoveRequest {
	const request = requireRecord({ value });
	return {
		projectId: requireString({ label: "projectId", value: request.projectId }),
		resultUri: requireString({ label: "resultUri", value: request.resultUri }),
	};
}

const resultStore = new ProjectFilePlanarTrackingResultStore({
	resolveProjectRoot: async ({ projectId }) => getProjectRoot(projectId),
});

export function registerPlanarTrackingStorageHandlers(): void {
	ipcMain.handle(
		PLANAR_TRACKING_STORAGE_WRITE_CHANNEL,
		async (_event: IpcMainInvokeEvent, value: unknown) => {
			const request = parseWriteRequest({ value });
			await ensureProjectStructure(request.projectId);
			return resultStore.write(request);
		}
	);
	ipcMain.handle(
		PLANAR_TRACKING_STORAGE_READ_CHANNEL,
		(_event: IpcMainInvokeEvent, value: unknown) =>
			resultStore.read(parseReadRequest({ value }))
	);
	ipcMain.handle(
		PLANAR_TRACKING_STORAGE_REMOVE_CHANNEL,
		(_event: IpcMainInvokeEvent, value: unknown) =>
			resultStore.remove(parseRemoveRequest({ value }))
	);
}

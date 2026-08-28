import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import {
	discoverLocalReferences,
	readLocalReference,
} from "../native-pipeline/stickers/local-reference-catalog/index.js";

function parseDiscoveryOptions({ value }: { value: unknown }): {
	rootPath?: string;
} {
	if (value === undefined) return {};
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Sticker Lab discovery options must be an object");
	}
	const rootPath = Reflect.get(value, "rootPath");
	if (rootPath === undefined) return {};
	if (typeof rootPath !== "string" || !rootPath.trim()) {
		throw new Error("Sticker Lab rootPath must be a non-empty string");
	}
	return { rootPath };
}

function parseReadOptions({ value }: { value: unknown }): {
	rootPath: string;
	batchId: string;
	stickerId: string;
	resourceName?: string;
} {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Sticker Lab read options must be an object");
	}
	const rootPath = Reflect.get(value, "rootPath");
	const batchId = Reflect.get(value, "batchId");
	const stickerId = Reflect.get(value, "stickerId");
	const resourceName = Reflect.get(value, "resourceName");
	if (typeof rootPath !== "string" || !rootPath.trim()) {
		throw new Error("Sticker Lab rootPath must be a non-empty string");
	}
	if (typeof batchId !== "string" || !batchId.trim()) {
		throw new Error("Sticker Lab batchId must be a non-empty string");
	}
	if (typeof stickerId !== "string" || !stickerId.trim()) {
		throw new Error("Sticker Lab stickerId must be a non-empty string");
	}
	if (
		resourceName !== undefined &&
		(typeof resourceName !== "string" || !resourceName.trim())
	) {
		throw new Error("Sticker Lab resourceName must be a non-empty string");
	}
	return {
		rootPath,
		batchId,
		stickerId,
		...(resourceName === undefined ? {} : { resourceName }),
	};
}

export function registerStickerLabHandlers(): void {
	ipcMain.handle(
		"sticker-lab:discover-local-references",
		async (_event: IpcMainInvokeEvent, value: unknown) => {
			const options = parseDiscoveryOptions({ value });
			return discoverLocalReferences({
				...options,
				...(options.rootPath ? {} : { videosDirectory: app.getPath("videos") }),
			});
		}
	);
	ipcMain.handle(
		"sticker-lab:read-local-reference",
		async (_event: IpcMainInvokeEvent, value: unknown) =>
			readLocalReference(parseReadOptions({ value }))
	);
}

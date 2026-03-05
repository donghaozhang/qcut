import type { BrowserWindow } from "electron";
import { HttpError } from "./http-router.js";

type WindowLike = {
	isDestroyed?: () => boolean;
	webContents?: {
		send?: (...args: unknown[]) => unknown;
		isDestroyed?: () => boolean;
	};
};

type IpcMainLike = {
	on?: (...args: unknown[]) => unknown;
	once?: (...args: unknown[]) => unknown;
	removeListener?: (...args: unknown[]) => unknown;
};

export function assertRendererWindowReady({
	win,
	action,
}: {
	win?: BrowserWindow;
	action: string;
}): void {
	try {
		if (!win) {
			throw new HttpError(503, `Editor window not available for ${action}`);
		}

		const candidateWindow = win as unknown as WindowLike;
		if (
			typeof candidateWindow.isDestroyed === "function" &&
			candidateWindow.isDestroyed()
		) {
			throw new HttpError(503, `Editor window closed during ${action}`);
		}

		const candidateWebContents = candidateWindow.webContents;
		if (
			!candidateWebContents ||
			typeof candidateWebContents.send !== "function"
		) {
			throw new HttpError(503, `Editor renderer not available for ${action}`);
		}

		if (
			typeof candidateWebContents.isDestroyed === "function" &&
			candidateWebContents.isDestroyed()
		) {
			throw new HttpError(503, `Editor renderer closed during ${action}`);
		}
	} catch (error) {
		if (error instanceof HttpError) {
			throw error;
		}
		throw new HttpError(503, `Editor window not ready for ${action}`);
	}
}

export function assertIpcMainReady({
	ipcMainInstance,
	action,
	requiresOnce,
}: {
	ipcMainInstance: unknown;
	action: string;
	requiresOnce: boolean;
}): void {
	try {
		const ipcMainCandidate = ipcMainInstance as IpcMainLike;
		const hasOn = typeof ipcMainCandidate.on === "function";
		const hasRemoveListener =
			typeof ipcMainCandidate.removeListener === "function";
		const hasOnce =
			!requiresOnce || typeof ipcMainCandidate.once === "function";

		if (!hasOn || !hasRemoveListener || !hasOnce) {
			throw new HttpError(503, `IPC bridge unavailable for ${action}`);
		}
	} catch (error) {
		if (error instanceof HttpError) {
			throw error;
		}
		throw new HttpError(503, `IPC bridge unavailable for ${action}`);
	}
}

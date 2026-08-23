import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import { generateId } from "../utils/helpers.js";

interface RendererMutationResponse {
	error?: string;
	requestId: string;
}

function isRendererMutationResponse(
	candidate: unknown
): candidate is RendererMutationResponse {
	if (typeof candidate !== "object" || candidate === null) return false;
	const response = candidate as Record<string, unknown>;
	return (
		typeof response.requestId === "string" &&
		(response.error === undefined || typeof response.error === "string")
	);
}

export async function requestRendererMutation<TPayload extends object>({
	channel,
	payload,
	requestIdPrefix,
	responseChannel,
	timeoutMessage,
	timeoutMs,
	win,
}: {
	channel: string;
	payload: TPayload;
	requestIdPrefix: string;
	responseChannel: string;
	timeoutMessage: string;
	timeoutMs: number;
	win: BrowserWindow;
}): Promise<void> {
	if (win.isDestroyed() || win.webContents.isDestroyed()) {
		throw new Error("QCut main window is unavailable.");
	}

	await new Promise<void>((resolve, reject) => {
		const requestId = generateId(requestIdPrefix);
		let settled = false;
		let timeout: NodeJS.Timeout | undefined;
		const cleanup = (): void => {
			ipcMain.removeListener(responseChannel, handler);
			if (timeout) clearTimeout(timeout);
		};
		const fail = ({ error }: { error: Error }): void => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const handler = (event: IpcMainEvent, response: unknown): void => {
			if (
				settled ||
				!isRendererMutationResponse(response) ||
				response.requestId !== requestId ||
				event.sender !== win.webContents ||
				event.senderFrame !== win.webContents.mainFrame
			) {
				return;
			}
			if (response.error) {
				fail({ error: new Error(response.error) });
				return;
			}
			settled = true;
			cleanup();
			resolve();
		};

		timeout = setTimeout(() => {
			fail({ error: new Error(timeoutMessage) });
		}, timeoutMs);
		ipcMain.on(responseChannel, handler);
		try {
			win.webContents.send(channel, { ...payload, requestId });
		} catch (error) {
			fail({
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	});
}

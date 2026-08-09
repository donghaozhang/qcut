import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import type {
	QCutPersistedImportEvidenceRendererResponse,
	QCutPersistedImportEvidenceRequest,
	QCutPersistedImportEvidenceSnapshot,
} from "../../types/qcut-import-evidence-api.js";
import { parseQCutPersistedImportEvidenceSnapshot } from "../../types/qcut-import-evidence-validation.js";
import { generateId } from "../utils/helpers.js";

const IMPORT_EVIDENCE_REQUEST_CHANNEL =
	"qcut:interop:import-evidence:request" as const;
const IMPORT_EVIDENCE_RESPONSE_CHANNEL =
	"qcut:interop:import-evidence:response" as const;
const IMPORT_EVIDENCE_TIMEOUT_MS = 30 * 60 * 1000;

export async function requestQCutImportEvidenceFromRenderer({
	appVersion,
	request,
	timeoutMs = IMPORT_EVIDENCE_TIMEOUT_MS,
	win,
}: {
	appVersion: string;
	request: QCutPersistedImportEvidenceRequest;
	timeoutMs?: number;
	win: BrowserWindow;
}): Promise<QCutPersistedImportEvidenceSnapshot> {
	if (win.isDestroyed() || win.webContents.isDestroyed()) {
		throw new Error("QCut main window is unavailable.");
	}
	return new Promise((resolve, reject) => {
		const requestId = generateId("import_evidence");
		let settled = false;
		const cleanup = (): void => {
			ipcMain.removeListener(IMPORT_EVIDENCE_RESPONSE_CHANNEL, handler);
			clearTimeout(timeout);
		};
		const fail = ({ error }: { error: Error }): void => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const handler = (
			event: IpcMainEvent,
			response: QCutPersistedImportEvidenceRendererResponse
		): void => {
			if (
				settled ||
				response.requestId !== requestId ||
				event.sender !== win.webContents ||
				event.senderFrame !== win.webContents.mainFrame
			) {
				return;
			}
			if (response.error !== undefined) {
				fail({ error: new Error(response.error) });
				return;
			}
			try {
				const result = parseQCutPersistedImportEvidenceSnapshot({
					value: response.result,
				});
				if (
					result.project.id !== request.projectId ||
					result.binding.bundleDigest !== request.expectedBundleDigest
				) {
					throw new Error(
						"Renderer import evidence does not match the requested project binding."
					);
				}
				settled = true;
				cleanup();
				resolve(result);
			} catch (error) {
				fail({
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		};
		const timeout = setTimeout(() => {
			fail({
				error: new Error("Timeout waiting for persisted import evidence."),
			});
		}, timeoutMs);
		ipcMain.on(IMPORT_EVIDENCE_RESPONSE_CHANNEL, handler);
		try {
			win.webContents.send(IMPORT_EVIDENCE_REQUEST_CHANNEL, {
				appVersion,
				request,
				requestId,
			});
		} catch (error) {
			fail({
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	});
}

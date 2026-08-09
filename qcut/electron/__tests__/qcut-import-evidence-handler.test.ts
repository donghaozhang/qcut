import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
	type QCutPersistedImportEvidenceSnapshot,
} from "../types/qcut-import-evidence-api";

const { ipcListeners } = vi.hoisted(() => ({
	ipcListeners: new Map<string, Set<(...args: unknown[]) => void>>(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		on: (channel: string, listener: (...args: unknown[]) => void) => {
			const listeners = ipcListeners.get(channel) ?? new Set();
			listeners.add(listener);
			ipcListeners.set(channel, listeners);
		},
		removeListener: (
			channel: string,
			listener: (...args: unknown[]) => void
		) => {
			ipcListeners.get(channel)?.delete(listener);
		},
	},
}));

import { requestQCutImportEvidenceFromRenderer } from "../claude/handlers/qcut-import-evidence-handler";

const BUNDLE_DIGEST = "b".repeat(64);

function createSnapshot(): QCutPersistedImportEvidenceSnapshot {
	return {
		binding: {
			bundleDigest: BUNDLE_DIGEST,
			importId: "plan-token",
			profileId: "capcut-desktop-8.1-plaintext",
		},
		capture: {
			appVersion: "test",
			capturedAtIso: "2026-08-05T01:02:03.000Z",
			readPasses: 2,
			source: "qcut-renderer-persisted-storage",
		},
		media: [],
		project: {
			fps: 30,
			height: 1080,
			id: "project-1",
			name: "Imported Project",
			sceneId: "scene-1",
			width: 1920,
		},
		schema: QCUT_PERSISTED_IMPORT_EVIDENCE_SCHEMA,
		schemaVersion: 1,
		tracks: [],
	};
}

function createWindow() {
	const mainFrame = {};
	const webContents = {
		isDestroyed: () => false,
		mainFrame,
		send: vi.fn(),
	};
	return {
		mainFrame,
		webContents,
		win: {
			isDestroyed: () => false,
			webContents,
		} as unknown as Electron.BrowserWindow,
	};
}

function sentRequest({
	webContents,
}: {
	webContents: ReturnType<typeof createWindow>["webContents"];
}) {
	const call = webContents.send.mock.calls[0];
	if (call === undefined) throw new Error("Renderer request was not sent.");
	return call[1] as { requestId: string };
}

function emitIpc({
	channel,
	args,
}: {
	channel: string;
	args: unknown[];
}): void {
	for (const listener of ipcListeners.get(channel) ?? []) {
		listener(...args);
	}
}

function listenerCount({ channel }: { channel: string }): number {
	return ipcListeners.get(channel)?.size ?? 0;
}

beforeEach(() => {
	ipcListeners.clear();
});

describe("QCut persisted import evidence main-process handler", () => {
	it("ignores a forged subframe response and accepts the main frame", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutImportEvidenceFromRenderer({
			appVersion: "test",
			request: {
				projectId: "project-1",
				expectedBundleDigest: BUNDLE_DIGEST,
			},
			timeoutMs: 1000,
			win,
		});
		const { requestId } = sentRequest({ webContents });
		const snapshot = createSnapshot();

		emitIpc({
			channel: "qcut:interop:import-evidence:response",
			args: [
				{ sender: webContents, senderFrame: {} },
				{ requestId, result: snapshot },
			],
		});
		expect(
			listenerCount({ channel: "qcut:interop:import-evidence:response" })
		).toBe(1);
		emitIpc({
			channel: "qcut:interop:import-evidence:response",
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{ requestId, result: snapshot },
			],
		});

		await expect(promise).resolves.toEqual(snapshot);
		expect(
			listenerCount({ channel: "qcut:interop:import-evidence:response" })
		).toBe(0);
	});

	it("rejects a trusted response with the wrong project binding", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutImportEvidenceFromRenderer({
			appVersion: "test",
			request: {
				projectId: "project-1",
				expectedBundleDigest: BUNDLE_DIGEST,
			},
			timeoutMs: 1000,
			win,
		});
		const { requestId } = sentRequest({ webContents });
		const snapshot = createSnapshot();
		snapshot.project.id = "another-project";

		emitIpc({
			channel: "qcut:interop:import-evidence:response",
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{ requestId, result: snapshot },
			],
		});

		await expect(promise).rejects.toThrow("requested project binding");
	});

	it("times out and removes its response listener", async () => {
		const { win } = createWindow();
		await expect(
			requestQCutImportEvidenceFromRenderer({
				appVersion: "test",
				request: {
					projectId: "project-1",
					expectedBundleDigest: BUNDLE_DIGEST,
				},
				timeoutMs: 5,
				win,
			})
		).rejects.toThrow("Timeout waiting");
		expect(
			listenerCount({ channel: "qcut:interop:import-evidence:response" })
		).toBe(0);
	});
});

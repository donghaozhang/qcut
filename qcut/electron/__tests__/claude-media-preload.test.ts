import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMocks = vi.hoisted(() => {
	const listeners = new Map<string, (...args: unknown[]) => void>();
	return {
		invoke: vi.fn(),
		listeners,
		on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
			listeners.set(channel, listener);
		}),
		removeAllListeners: vi.fn((channel: string) => listeners.delete(channel)),
		send: vi.fn(),
	};
});

vi.mock("electron", () => ({
	ipcRenderer: {
		invoke: ipcMocks.invoke,
		on: ipcMocks.on,
		removeAllListeners: ipcMocks.removeAllListeners,
		send: ipcMocks.send,
	},
}));

import { createClaudeAPI } from "../preload-integrations";

async function dispatch({
	channel,
	payload,
}: {
	channel: string;
	payload: Record<string, unknown>;
}): Promise<void> {
	const listener = ipcMocks.listeners.get(channel);
	if (!listener) throw new Error(`Missing listener for ${channel}`);
	await listener({}, payload);
}

describe("Claude media preload acknowledgements", () => {
	beforeEach(() => {
		ipcMocks.listeners.clear();
		vi.clearAllMocks();
	});

	it("acks a media import only after the async renderer callback resolves", async () => {
		const claude = createClaudeAPI();
		let finish: (() => void) | undefined;
		claude.media.onMediaImported(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);

		const pending = dispatch({
			channel: "claude:media:imported",
			payload: {
				id: "media-1",
				name: "reference.gif",
				path: "/project/media/reference.gif",
				projectId: "project-1",
				requestId: "request-1",
				size: 128,
				type: "image",
			},
		});

		expect(ipcMocks.send).not.toHaveBeenCalled();
		finish?.();
		await pending;
		expect(ipcMocks.send).toHaveBeenCalledWith(
			"claude:media:imported:response",
			{ requestId: "request-1" }
		);
	});

	it("nacks a failed media import", async () => {
		const claude = createClaudeAPI();
		claude.media.onMediaImported(async () => {
			throw new Error("storage failed");
		});

		await dispatch({
			channel: "claude:media:imported",
			payload: {
				id: "media-1",
				name: "reference.gif",
				path: "/project/media/reference.gif",
				projectId: "project-1",
				requestId: "request-2",
				size: 128,
				type: "image",
			},
		});

		expect(ipcMocks.send).toHaveBeenCalledWith(
			"claude:media:imported:response",
			{ error: "storage failed", requestId: "request-2" }
		);
	});

	it("acks durable media deletion", async () => {
		const claude = createClaudeAPI();
		const callback = vi.fn(async () => undefined);
		claude.media.onMediaDeleted(callback);

		await dispatch({
			channel: "claude:media:deleted",
			payload: {
				mediaId: "media-1",
				projectId: "project-1",
				requestId: "request-3",
			},
		});

		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({ mediaId: "media-1" })
		);
		expect(ipcMocks.send).toHaveBeenCalledWith(
			"claude:media:deleted:response",
			{ requestId: "request-3" }
		);
	});

	it("acks a timeline element only after the async callback resolves", async () => {
		const claude = createClaudeAPI();
		let finish: (() => void) | undefined;
		const callback = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		claude.timeline.onAddElement(callback);

		const pending = dispatch({
			channel: "claude:timeline:addElement",
			payload: {
				id: "element-1",
				projectId: "project-1",
				requestId: "timeline-request-1",
				type: "sticker",
			},
		});

		expect(ipcMocks.send).not.toHaveBeenCalled();
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: "project-1" })
		);
		finish?.();
		await pending;
		expect(ipcMocks.send).toHaveBeenCalledWith(
			"claude:timeline:addElement:response",
			{ requestId: "timeline-request-1" }
		);
	});

	it("nacks a failed timeline element callback", async () => {
		const claude = createClaudeAPI();
		claude.timeline.onAddElement(async () => {
			throw new Error("track span is occupied");
		});

		await dispatch({
			channel: "claude:timeline:addElement",
			payload: {
				id: "element-1",
				projectId: "project-1",
				requestId: "timeline-request-2",
				type: "sticker",
			},
		});

		expect(ipcMocks.send).toHaveBeenCalledWith(
			"claude:timeline:addElement:response",
			{
				error: "track span is occupied",
				requestId: "timeline-request-2",
			}
		);
	});

	it("nacks a timeline callback that rejects without an Error", async () => {
		const claude = createClaudeAPI();
		claude.timeline.onAddElement(() => Promise.reject(undefined));

		await dispatch({
			channel: "claude:timeline:addElement",
			payload: {
				id: "element-1",
				projectId: "project-1",
				requestId: "timeline-request-3",
				type: "sticker",
			},
		});

		expect(ipcMocks.send).toHaveBeenCalledWith(
			"claude:timeline:addElement:response",
			{
				error: "Renderer mutation failed",
				requestId: "timeline-request-3",
			}
		);
	});
});

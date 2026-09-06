// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	QCUT_FILTER_LOAD,
	QCUT_FILTER_LIST,
	QCUT_FILTER_RENDER,
	QCUT_FOG_RESOURCE,
	QCUT_FOG_VERSION,
} from "../qcut-independent-filter/contract.js";
import { setupIndependentFilterIPC } from "../qcut-independent-filter/ipc.js";

const mock = vi.hoisted(() => ({
	handle: vi.fn(),
	remove: vi.fn(),
	load: vi.fn(),
	render: vi.fn(),
	dispose: vi.fn(async () => {}),
}));
vi.mock("electron", () => ({
	ipcMain: { handle: mock.handle, removeHandler: mock.remove },
}));
vi.mock("../qcut-independent-filter/provider.js", () => ({
	createIndependentFilterProvider: () => mock,
}));

function setup() {
	const webContents = { isDestroyed: () => false, mainFrame: {} };
	const window = {
		isDestroyed: () => false,
		webContents,
	} as unknown as BrowserWindow;
	const controller = setupIndependentFilterIPC({ getMainWindow: () => window });
	const event = {
		sender: webContents,
		senderFrame: webContents.mainFrame,
	} as unknown as IpcMainInvokeEvent;
	return { controller, event };
}
function handler({ channel }: { channel: string }) {
	const registration = mock.handle.mock.calls.find(
		(call: unknown[]) => call[0] === channel
	);
	if (!registration) throw new Error("Missing IPC handler");
	return registration[1] as (
		event: IpcMainInvokeEvent,
		request?: unknown
	) => unknown;
}
const request = {
	resourceId: QCUT_FOG_RESOURCE,
	version: QCUT_FOG_VERSION,
	width: 1,
	height: 1,
	intensity: 50,
	rgba: new Uint8Array([10, 20, 30, 255]),
};
beforeEach(() => {
	vi.clearAllMocks();
});
describe("independent filter IPC boundary", () => {
	it.each([
		QCUT_FILTER_LOAD,
		QCUT_FILTER_RENDER,
		QCUT_FILTER_LIST,
	])("rejects subframes on %s", (channel) => {
		const { event } = setup();
		expect(() =>
			handler({ channel })(
				{ ...event, senderFrame: {} } as IpcMainInvokeEvent,
				request
			)
		).toThrow("untrusted");
		expect(mock.load).not.toHaveBeenCalled();
		expect(mock.render).not.toHaveBeenCalled();
	});
	it("does not allow renderer-selected LUT paths or unchecked versions", () => {
		const { event } = setup();
		handler({ channel: QCUT_FILTER_RENDER })(event, {
			...request,
			lutPath: "/arbitrary/file",
		});
		expect(mock.render).toHaveBeenCalledWith(
			expect.objectContaining({ version: QCUT_FOG_VERSION })
		);
		expect(mock.render.mock.calls[0][0]).not.toHaveProperty("lutPath");
		expect(() =>
			handler({ channel: QCUT_FILTER_RENDER })(event, {
				...request,
				version: "wrong",
			})
		).toThrow("verified Fog");
		expect(() =>
			handler({ channel: QCUT_FILTER_RENDER })(event, {
				...request,
				version: undefined,
			})
		).toThrow("exact version");
	});
	it("checks readiness and removes all handlers on shutdown", () => {
		const { event, controller } = setup();
		handler({ channel: QCUT_FILTER_LOAD })(event);
		expect(mock.load).toHaveBeenCalledOnce();
		controller.dispose();
		expect(mock.remove.mock.calls.map(([channel]) => channel)).toEqual([
			QCUT_FILTER_LOAD,
			QCUT_FILTER_RENDER,
			QCUT_FILTER_LIST,
		]);
		expect(mock.dispose).toHaveBeenCalledOnce();
	});
});

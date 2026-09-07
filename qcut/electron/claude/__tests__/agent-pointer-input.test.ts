import type { BrowserWindow, MouseInputEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { AgentPointerInput } from "../handlers/agent-pointer-input.js";

function createInputHarness({
	visible = false,
	devToolsOpened = false,
	minimized: initiallyMinimized = false,
	attachError,
}: {
	visible?: boolean;
	devToolsOpened?: boolean;
	minimized?: boolean;
	attachError?: Error;
} = {}) {
	const inputEvents: MouseInputEvent[] = [];
	const debuggerCommands: Array<{
		method: string;
		params?: Record<string, unknown>;
	}> = [];
	let currentVisible = visible;
	let focused = false;
	let minimized = initiallyMinimized;
	let debuggerAttached = false;
	const focus = vi.fn(() => {
		focused = true;
	});
	const show = vi.fn(() => {
		currentVisible = true;
	});
	const showInactive = vi.fn(() => {
		currentVisible = true;
	});
	const restore = vi.fn(() => {
		minimized = false;
	});
	const attach = vi.fn(() => {
		if (attachError) throw attachError;
		debuggerAttached = true;
	});
	const detach = vi.fn(() => {
		debuggerAttached = false;
	});
	type DebuggerListener = (
		event: unknown,
		method: string,
		params: Record<string, unknown>
	) => void;
	const debuggerListeners: DebuggerListener[] = [];
	const webContents = {
		backgroundThrottling: true,
		isDestroyed: () => false,
		isDevToolsOpened: () => devToolsOpened,
		sendInputEvent: (event: MouseInputEvent) => inputEvents.push(event),
		debugger: {
			isAttached: () => debuggerAttached,
			attach,
			detach,
			on: (_event: string, listener: DebuggerListener) => {
				debuggerListeners.push(listener);
			},
			removeListener: (_event: string, listener: DebuggerListener) => {
				const index = debuggerListeners.indexOf(listener);
				if (index >= 0) debuggerListeners.splice(index, 1);
			},
			sendCommand: vi.fn(
				async (method: string, params?: Record<string, unknown>) => {
					debuggerCommands.push({ method, params });
				}
			),
		},
	};
	const emitDebuggerMessage = (
		method: string,
		params: Record<string, unknown>
	) => {
		for (const listener of [...debuggerListeners]) {
			listener({}, method, params);
		}
	};
	const win = {
		isDestroyed: () => false,
		isVisible: () => currentVisible,
		isFocused: () => focused,
		isMinimized: () => minimized,
		show,
		showInactive,
		restore,
		focus,
		getContentSize: () => [1200, 800] as [number, number],
		webContents,
	} as unknown as BrowserWindow;

	return {
		attach,
		debuggerCommands,
		debuggerListeners,
		detach,
		emitDebuggerMessage,
		focus,
		input: new AgentPointerInput({ win }),
		inputEvents,
		restore,
		show,
		showInactive,
		webContents,
	};
}

describe("AgentPointerInput", () => {
	it("dispatches background input without activating the QCut window", async () => {
		const harness = createInputHarness();
		const session = await harness.input.begin({ inputMode: "background" });

		expect(session).toEqual(
			expect.objectContaining({
				inputMode: "background",
				backend: "cdp-dispatch-mouse-event",
				attachedByPointer: true,
			})
		);
		expect(harness.showInactive).toHaveBeenCalledOnce();
		expect(harness.show).not.toHaveBeenCalled();
		expect(harness.focus).not.toHaveBeenCalled();
		expect(harness.webContents.backgroundThrottling).toBe(false);

		await harness.input.sendMouse({
			session,
			type: "mouseMove",
			point: { x: 120, y: 160 },
		});
		await harness.input.sendMouse({
			session,
			type: "mouseDown",
			point: { x: 120, y: 160 },
			button: "left",
			clickCount: 1,
		});
		await harness.input.sendMouse({
			session,
			type: "mouseUp",
			point: { x: 120, y: 160 },
			button: "left",
			clickCount: 1,
		});
		await harness.input.sendWheel({
			session,
			point: { x: 120, y: 300 },
			deltaX: 0,
			deltaY: 240,
		});

		expect(harness.debuggerCommands.map(({ params }) => params?.type)).toEqual([
			"mouseMoved",
			"mousePressed",
			"mouseReleased",
			"mouseWheel",
		]);
		expect(harness.debuggerCommands[1]?.params).toEqual(
			expect.objectContaining({ button: "left", buttons: 1, clickCount: 1 })
		);
		expect(harness.debuggerCommands[2]?.params).toEqual(
			expect.objectContaining({ button: "left", buttons: 0, clickCount: 1 })
		);
		expect(harness.inputEvents).toHaveLength(0);

		await harness.input.end({ session });
		expect(harness.detach).toHaveBeenCalledOnce();
		expect(harness.webContents.backgroundThrottling).toBe(true);
		expect(harness.input.isWindowFocused()).toBe(false);
	});

	it("dispatches Chromium key descriptors and editing commands", async () => {
		const harness = createInputHarness();
		const session = await harness.input.begin({ inputMode: "background" });

		await harness.input.sendKey({
			session,
			type: "keyDown",
			key: "A",
			modifiers: ["Meta"],
		});
		await harness.input.sendKey({
			session,
			type: "keyUp",
			key: "A",
			modifiers: ["Meta"],
		});
		await harness.input.sendKey({
			session,
			type: "keyDown",
			key: "Backspace",
		});

		expect(harness.debuggerCommands[0]).toEqual({
			method: "Input.dispatchKeyEvent",
			params: expect.objectContaining({
				type: "rawKeyDown",
				key: "a",
				code: "KeyA",
				windowsVirtualKeyCode: 65,
				modifiers: 4,
				commands: ["selectAll"],
			}),
		});
		expect(harness.debuggerCommands[2]?.params).toEqual(
			expect.objectContaining({
				type: "rawKeyDown",
				key: "Backspace",
				code: "Backspace",
				windowsVirtualKeyCode: 8,
				commands: ["deleteBackward"],
			})
		);

		await harness.input.end({ session });
	});

	it("preserves explicit foreground Electron input", async () => {
		const harness = createInputHarness({ visible: true });
		const session = await harness.input.begin({ inputMode: "foreground" });

		await harness.input.sendMouse({
			session,
			type: "mouseDown",
			point: { x: 40, y: 50 },
			button: "right",
			clickCount: 1,
		});
		await harness.input.sendWheel({
			session,
			point: { x: 40, y: 50 },
			deltaX: 0,
			deltaY: -120,
		});

		expect(harness.show).toHaveBeenCalledOnce();
		expect(harness.focus).toHaveBeenCalledOnce();
		expect(harness.showInactive).not.toHaveBeenCalled();
		expect(harness.inputEvents).toEqual([
			expect.objectContaining({ type: "mouseDown", button: "right" }),
			expect.objectContaining({ type: "mouseWheel", deltaY: -120 }),
		]);
		expect(harness.attach).not.toHaveBeenCalled();
		expect(harness.debuggerCommands).toHaveLength(0);
		expect(harness.input.isWindowFocused()).toBe(true);
	});

	it("fails closed instead of stealing focus when background input conflicts", async () => {
		const harness = createInputHarness({ visible: true, devToolsOpened: true });

		await expect(
			harness.input.begin({ inputMode: "background" })
		).rejects.toThrow("DevTools or another debugger session");
		expect(harness.focus).not.toHaveBeenCalled();
		expect(harness.attach).not.toHaveBeenCalled();
		expect(harness.webContents.backgroundThrottling).toBe(true);
	});

	it("restores a minimized window without activating it", async () => {
		const harness = createInputHarness({ visible: true, minimized: true });
		const session = await harness.input.begin({ inputMode: "background" });

		expect(harness.restore).toHaveBeenCalledOnce();
		expect(harness.showInactive).toHaveBeenCalledOnce();
		expect(harness.focus).not.toHaveBeenCalled();

		await harness.input.end({ session });
	});

	it("restores throttling and focus state when debugger attachment fails", async () => {
		const harness = createInputHarness({
			visible: true,
			attachError: new Error("Debugger already attached elsewhere"),
		});

		await expect(
			harness.input.begin({ inputMode: "background" })
		).rejects.toThrow(
			"Unable to start background pointer input: Debugger already attached elsewhere"
		);
		expect(harness.focus).not.toHaveBeenCalled();
		expect(harness.webContents.backgroundThrottling).toBe(true);
	});

	it("intercepts HTML5 drags and replays them as CDP drag events", async () => {
		const harness = createInputHarness();
		const session = await harness.input.begin({ inputMode: "background" });

		const interception = await harness.input.beginDragInterception({ session });
		expect(interception).not.toBeNull();
		expect(harness.debuggerCommands.at(-1)).toEqual({
			method: "Input.setInterceptDrags",
			params: { enabled: true },
		});
		expect(harness.debuggerListeners).toHaveLength(1);
		expect(interception?.intercepted()).toBeNull();

		const pending = interception!.waitForIntercept({ timeoutMs: 1000 });
		harness.emitDebuggerMessage("Input.dragIntercepted", {
			data: {
				items: [
					{ mimeType: "application/x-media-item", data: '{"id":"m1"}' },
					{ mimeType: 7, data: "ignored" },
				],
				files: ["/tmp/still.png"],
				dragOperationsMask: 1,
			},
		});
		const data = {
			items: [{ mimeType: "application/x-media-item", data: '{"id":"m1"}' }],
			files: ["/tmp/still.png"],
			dragOperationsMask: 1,
		};
		await expect(pending).resolves.toEqual(data);
		expect(interception?.intercepted()).toEqual(data);

		await harness.input.sendDrag({
			session,
			type: "drop",
			point: { x: 10, y: 20 },
			data,
		});
		expect(harness.debuggerCommands.at(-1)).toEqual({
			method: "Input.dispatchDragEvent",
			params: { type: "drop", x: 10, y: 20, data },
		});

		await interception!.dispose();
		expect(harness.debuggerCommands.at(-1)).toEqual({
			method: "Input.setInterceptDrags",
			params: { enabled: false },
		});
		expect(harness.debuggerListeners).toHaveLength(0);
		await harness.input.end({ session });
	});

	it("resolves null when no drag is intercepted before the timeout", async () => {
		const harness = createInputHarness();
		const session = await harness.input.begin({ inputMode: "background" });
		const interception = await harness.input.beginDragInterception({ session });

		await expect(
			interception!.waitForIntercept({ timeoutMs: 0 })
		).resolves.toBeNull();
		harness.emitDebuggerMessage("Input.dragIntercepted", { data: null });
		expect(interception?.intercepted()).toBeNull();

		await interception!.dispose();
		await harness.input.end({ session });
	});

	it("cannot intercept or dispatch drags through foreground Electron input", async () => {
		const harness = createInputHarness();
		const session = await harness.input.begin({ inputMode: "foreground" });

		await expect(
			harness.input.beginDragInterception({ session })
		).resolves.toBeNull();
		await expect(
			harness.input.sendDrag({
				session,
				type: "dragEnter",
				point: { x: 1, y: 1 },
				data: { items: [], dragOperationsMask: 1 },
			})
		).rejects.toThrow("require background pointer input");
		expect(harness.debuggerCommands).toEqual([]);
	});
});

import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, MouseInputEvent } from "electron";
import {
	AgentPointerController,
	buildPointerMovementPath,
} from "../handlers/agent-pointer-controller.js";
import type { AgentPointerResolvedTarget } from "../../types/claude-api.js";

function createPointerHarness() {
	const inputEvents: MouseInputEvent[] = [];
	const debuggerCommands: Array<{
		method: string;
		params?: Record<string, unknown>;
	}> = [];
	const visualStates: Array<Record<string, unknown>> = [];
	const resolvedTarget: AgentPointerResolvedTarget = {
		ref: "@e12",
		x: 240,
		y: 180,
		bounds: { x: 200, y: 160, width: 80, height: 40 },
		tagName: "button",
		role: "button",
		name: "Effects",
		value: null,
		disabled: false,
	};
	const resolveRef = vi.fn(async () => resolvedTarget);
	let focused = false;
	let debuggerAttached = false;
	const focus = vi.fn(() => {
		focused = true;
	});
	let destroyed = false;
	const win = {
		isDestroyed: () => destroyed,
		isVisible: () => true,
		isFocused: () => focused,
		isMinimized: () => false,
		show: vi.fn(),
		showInactive: vi.fn(),
		restore: vi.fn(),
		focus,
		getContentSize: () => [1200, 800] as [number, number],
		webContents: {
			backgroundThrottling: true,
			isDestroyed: () => destroyed,
			isDevToolsOpened: () => false,
			sendInputEvent: (event: MouseInputEvent) => inputEvents.push(event),
			send: (_channel: string, state: Record<string, unknown>) =>
				visualStates.push(state),
			debugger: {
				isAttached: () => debuggerAttached,
				attach: vi.fn(() => {
					debuggerAttached = true;
				}),
				detach: vi.fn(() => {
					debuggerAttached = false;
				}),
				sendCommand: vi.fn(
					async (method: string, params?: Record<string, unknown>) => {
						debuggerCommands.push({ method, params });
					}
				),
			},
		},
	} as unknown as BrowserWindow;
	const controller = new AgentPointerController({
		win,
		resolveRef,
		sleep: async () => {},
	});
	return {
		controller,
		debuggerCommands,
		destroy: () => {
			destroyed = true;
		},
		focus,
		inputEvents,
		resolveRef,
		resolvedTarget,
		visualStates,
	};
}

describe("AgentPointerController", () => {
	it("uses background CDP input without focusing QCut by default", async () => {
		const harness = createPointerHarness();

		const result = await harness.controller.click({ ref: "@e12" });

		expect(harness.resolveRef).toHaveBeenCalledWith({
			win: expect.anything(),
			ref: "@e12",
		});
		expect(harness.focus).not.toHaveBeenCalled();
		expect(harness.inputEvents).toHaveLength(0);
		expect(harness.debuggerCommands.map(({ params }) => params?.type)).toEqual([
			"mouseMoved",
			"mousePressed",
			"mouseReleased",
		]);
		expect(harness.debuggerCommands.slice(1)).toEqual([
			expect.objectContaining({
				method: "Input.dispatchMouseEvent",
				params: expect.objectContaining({
					type: "mousePressed",
					button: "left",
					x: 240,
					y: 180,
				}),
			}),
			expect.objectContaining({
				method: "Input.dispatchMouseEvent",
				params: expect.objectContaining({
					type: "mouseReleased",
					button: "left",
					x: 240,
					y: 180,
				}),
			}),
		]);
		expect(result).toEqual(
			expect.objectContaining({
				action: "click",
				input: "cdp-dispatch-mouse-event",
				inputMode: "background",
				windowFocused: false,
				x: 240,
				y: 180,
			})
		);
		expect(harness.visualStates).toContainEqual(
			expect.objectContaining({
				active: true,
				action: "click",
				inputMode: "background",
				pulseId: 1,
			})
		);
		await expect(harness.controller.hide()).resolves.toEqual({
			action: "hidden",
			visible: false,
			input: "cdp-dispatch-mouse-event",
			inputMode: "background",
			windowFocused: false,
			x: 240,
			y: 180,
		});
	});

	it("moves through intermediate hover points", async () => {
		const harness = createPointerHarness();
		await harness.controller.move({
			x: 40,
			y: 40,
			inputMode: "foreground",
		});
		harness.inputEvents.splice(0, harness.inputEvents.length);

		await harness.controller.hover({
			x: 740,
			y: 440,
			inputMode: "foreground",
		});

		expect(harness.inputEvents.length).toBeGreaterThan(3);
		expect(
			harness.inputEvents.every((event) => event.type === "mouseMove")
		).toBe(true);
		expect(harness.inputEvents.at(-1)).toEqual(
			expect.objectContaining({ x: 740, y: 440 })
		);
		expect(harness.visualStates.at(-1)).toEqual(
			expect.objectContaining({
				action: "hover",
				inputMode: "foreground",
				x: 740,
				y: 440,
			})
		);
		expect(harness.focus).toHaveBeenCalled();
		await harness.controller.hide();
	});

	it("holds the left button while dragging along a real movement path", async () => {
		const harness = createPointerHarness();

		const result = await harness.controller.drag({
			from: { x: 200, y: 700 },
			to: { x: 820, y: 700 },
			inputMode: "foreground",
		});

		const downIndex = harness.inputEvents.findIndex(
			(event) => event.type === "mouseDown"
		);
		const upIndex = harness.inputEvents.findIndex(
			(event) => event.type === "mouseUp"
		);
		const dragMoves = harness.inputEvents.slice(downIndex + 1, upIndex);
		expect(downIndex).toBeGreaterThanOrEqual(0);
		expect(upIndex).toBeGreaterThan(downIndex);
		expect(dragMoves.length).toBeGreaterThan(2);
		expect(
			dragMoves.every(
				(event) => event.type === "mouseMove" && event.button === "left"
			)
		).toBe(true);
		expect(harness.visualStates).toContainEqual(
			expect.objectContaining({
				action: "drag",
				dragging: true,
				pressed: true,
			})
		);
		expect(result).toEqual(expect.objectContaining({ x: 820, y: 700 }));
		await harness.controller.hide();
	});

	it("releases the left button when a drag destination fails", async () => {
		const harness = createPointerHarness();

		await expect(
			harness.controller.drag({
				from: { x: 200, y: 700 },
				to: { x: 1400, y: 700 },
				inputMode: "foreground",
			})
		).rejects.toThrow("outside the editor viewport");

		expect(harness.inputEvents.map((event) => event.type)).toEqual([
			"mouseMove",
			"mouseDown",
			"mouseUp",
		]);
		expect(harness.visualStates.at(-1)).toEqual(
			expect.objectContaining({
				action: "drag",
				dragging: false,
				pressed: false,
			})
		);
		await harness.controller.hide();
	});

	it("supports double-click, right-click, wheel, and hide", async () => {
		const harness = createPointerHarness();

		await harness.controller.doubleClick({
			x: 300,
			y: 250,
			inputMode: "foreground",
		});
		const doubleClickEvents = harness.inputEvents.filter(
			(event) => event.type === "mouseDown" || event.type === "mouseUp"
		);
		expect(doubleClickEvents.map((event) => event.clickCount)).toEqual([
			1, 1, 2, 2,
		]);

		harness.inputEvents.splice(0, harness.inputEvents.length);
		await harness.controller.rightClick({
			x: 320,
			y: 260,
			inputMode: "foreground",
		});
		expect(
			harness.inputEvents
				.filter((event) => event.type !== "mouseMove")
				.map((event) => event.type)
		).toEqual(["mouseDown", "mouseUp"]);
		expect(
			harness.inputEvents
				.filter((event) => event.type !== "mouseMove")
				.every((event) => event.button === "right")
		).toBe(true);

		harness.inputEvents.splice(0, harness.inputEvents.length);
		const scrollResult = await harness.controller.scroll({
			deltaY: 400,
			inputMode: "foreground",
		});
		expect(harness.inputEvents).toContainEqual(
			expect.objectContaining({ type: "mouseWheel", deltaY: 400 })
		);
		expect(scrollResult).toEqual(
			expect.objectContaining({ action: "scroll", deltaY: 400 })
		);

		const hideResult = await harness.controller.hide();
		expect(hideResult.visible).toBe(false);
		expect(harness.visualStates.at(-1)).toEqual(
			expect.objectContaining({ action: "hidden", visible: false, pulseId: 0 })
		);
	});

	it("rejects coordinates outside the editor viewport", async () => {
		const harness = createPointerHarness();

		await expect(harness.controller.move({ x: 1200, y: 10 })).rejects.toThrow(
			"outside the editor viewport"
		);
	});

	it("can hide safely after the editor window closes", async () => {
		const harness = createPointerHarness();
		harness.destroy();

		await expect(harness.controller.hide()).resolves.toEqual(
			expect.objectContaining({ action: "hidden", visible: false })
		);
		expect(harness.visualStates).toHaveLength(0);
	});
});

describe("buildPointerMovementPath", () => {
	it("keeps the internal path limited to pointer coordinates", () => {
		const path = buildPointerMovementPath({
			from: null,
			to: {
				x: 120,
				y: 240,
				ref: "@e12",
				bounds: { x: 100, y: 200, width: 40, height: 80 },
			} as AgentPointerResolvedTarget,
		});

		expect(path).toEqual([{ x: 120, y: 240 }]);
	});

	it("lands exactly on the destination while producing smooth intermediate points", () => {
		const path = buildPointerMovementPath({
			from: { x: 0, y: 0 },
			to: { x: 700, y: 350 },
		});

		expect(path.length).toBeGreaterThan(3);
		expect(path.at(-1)).toEqual({ x: 700, y: 350 });
	});
});

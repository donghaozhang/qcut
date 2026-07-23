import type {
	BrowserWindow,
	KeyboardInputEvent,
	MouseInputEvent,
} from "electron";
import type {
	AgentKeyboardModifier,
	AgentPointerButton,
	AgentPointerInputBackend,
	AgentPointerInputMode,
	AgentPointerPoint,
	AgentPointerTarget,
} from "../../types/claude-api.js";
import { AgentPointerError } from "./agent-pointer-error.js";

type PointerMouseEventType = "mouseMove" | "mouseDown" | "mouseUp";
type KeyboardEventType = "keyDown" | "keyUp";

export interface AgentPointerInputSession {
	inputMode: AgentPointerInputMode;
	backend: AgentPointerInputBackend;
	attachedByPointer: boolean;
	previousBackgroundThrottling?: boolean;
}

export function hasExplicitPointerTarget({
	target,
}: {
	target: AgentPointerTarget;
}): boolean {
	const hasCoordinates =
		typeof target.x === "number" &&
		Number.isFinite(target.x) &&
		typeof target.y === "number" &&
		Number.isFinite(target.y);
	return (
		(typeof target.ref === "string" && target.ref.trim().length > 0) ||
		hasCoordinates
	);
}

function cdpEventType({
	type,
}: {
	type: PointerMouseEventType;
}): "mouseMoved" | "mousePressed" | "mouseReleased" {
	switch (type) {
		case "mouseMove":
			return "mouseMoved";
		case "mouseDown":
			return "mousePressed";
		case "mouseUp":
			return "mouseReleased";
	}
}

function buttonMask({ button }: { button?: AgentPointerButton }): number {
	switch (button) {
		case "left":
			return 1;
		case "right":
			return 2;
		case "middle":
			return 4;
		default:
			return 0;
	}
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function cdpModifierMask(modifiers: AgentKeyboardModifier[]): number {
	let mask = 0;
	if (modifiers.includes("Alt")) mask |= 1;
	if (modifiers.includes("Control")) mask |= 2;
	if (modifiers.includes("Meta")) mask |= 4;
	if (modifiers.includes("Shift")) mask |= 8;
	return mask;
}

function electronModifiers(
	modifiers: AgentKeyboardModifier[]
): Array<"alt" | "control" | "meta" | "shift"> {
	return modifiers.map((modifier) => modifier.toLowerCase()) as Array<
		"alt" | "control" | "meta" | "shift"
	>;
}

interface CdpKeyDescriptor {
	key: string;
	code: string;
	windowsVirtualKeyCode: number;
	text?: string;
	commands?: string[];
}

const CDP_SPECIAL_KEYS: Record<
	string,
	Pick<CdpKeyDescriptor, "key" | "code" | "windowsVirtualKeyCode">
> = {
	Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
	Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
	Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
	Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
	Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32 },
	PageUp: { key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 },
	PageDown: { key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 },
	End: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
	Home: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
	ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
	ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
	ArrowRight: {
		key: "ArrowRight",
		code: "ArrowRight",
		windowsVirtualKeyCode: 39,
	},
	ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
	Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
};

function cdpEditingCommands({
	key,
	modifiers,
}: {
	key: string;
	modifiers: AgentKeyboardModifier[];
}): string[] | undefined {
	if (key === "Backspace") return ["deleteBackward"];
	if (key === "Delete") return ["deleteForward"];
	const shortcut = modifiers.includes("Meta") || modifiers.includes("Control");
	if (!shortcut) return undefined;
	switch (key.toLowerCase()) {
		case "a":
			return ["selectAll"];
		case "c":
			return ["copy"];
		case "x":
			return ["cut"];
		case "v":
			return ["paste"];
		case "z":
			return modifiers.includes("Shift") ? ["redo"] : ["undo"];
		default:
			return undefined;
	}
}

function describeCdpKey({
	key,
	modifiers,
}: {
	key: string;
	modifiers: AgentKeyboardModifier[];
}): CdpKeyDescriptor {
	const special = CDP_SPECIAL_KEYS[key];
	if (special) {
		return {
			...special,
			commands: cdpEditingCommands({ key, modifiers }),
		};
	}

	if (/^[a-z]$/i.test(key)) {
		const upper = key.toUpperCase();
		const rendered = modifiers.includes("Shift") ? upper : upper.toLowerCase();
		const hasCommandModifier = modifiers.some((modifier) =>
			["Alt", "Control", "Meta"].includes(modifier)
		);
		return {
			key: rendered,
			code: `Key${upper}`,
			windowsVirtualKeyCode: upper.charCodeAt(0),
			...(hasCommandModifier ? {} : { text: rendered }),
			commands: cdpEditingCommands({ key: rendered, modifiers }),
		};
	}

	if (/^[0-9]$/.test(key)) {
		return {
			key,
			code: `Digit${key}`,
			windowsVirtualKeyCode: key.charCodeAt(0),
			text: key,
		};
	}

	const printable = key.length === 1;
	return {
		key,
		code: key,
		windowsVirtualKeyCode: printable ? key.toUpperCase().charCodeAt(0) : 0,
		...(printable ? { text: key } : {}),
		commands: cdpEditingCommands({ key, modifiers }),
	};
}

export class AgentPointerInput {
	private readonly win: BrowserWindow;

	constructor({ win }: { win: BrowserWindow }) {
		this.win = win;
	}

	async begin({
		inputMode,
	}: {
		inputMode: AgentPointerInputMode;
	}): Promise<AgentPointerInputSession> {
		this.assertWindowAvailable();
		const wasMinimized = this.win.isMinimized();
		if (wasMinimized) this.win.restore();

		if (inputMode === "foreground") {
			this.win.show();
			this.win.focus();
			return {
				inputMode,
				backend: "electron-send-input-event",
				attachedByPointer: false,
			};
		}

		if (!this.win.isVisible() || wasMinimized) this.win.showInactive();
		const webContents = this.win.webContents;
		const previousBackgroundThrottling = webContents.backgroundThrottling;
		webContents.backgroundThrottling = false;

		try {
			if (webContents.isDevToolsOpened() || webContents.debugger.isAttached()) {
				throw new AgentPointerError({
					message:
						"Background pointer input is unavailable while DevTools or another debugger session is attached. Close DevTools or retry with foreground input.",
					statusCode: 409,
				});
			}
			webContents.debugger.attach("1.3");
			return {
				inputMode,
				backend: "cdp-dispatch-mouse-event",
				attachedByPointer: true,
				previousBackgroundThrottling,
			};
		} catch (error) {
			webContents.backgroundThrottling = previousBackgroundThrottling;
			if (error instanceof AgentPointerError) throw error;
			throw new AgentPointerError({
				message: `Unable to start background pointer input: ${errorMessage({ error })}`,
				statusCode: 503,
			});
		}
	}

	async end({ session }: { session: AgentPointerInputSession }): Promise<void> {
		if (session.inputMode !== "background") return;
		if (this.win.isDestroyed() || this.win.webContents.isDestroyed()) return;
		const webContents = this.win.webContents;
		try {
			if (session.attachedByPointer && webContents.debugger.isAttached()) {
				try {
					webContents.debugger.detach();
				} catch {
					// Renderer shutdown can race with debugger cleanup.
				}
			}
		} finally {
			if (session.previousBackgroundThrottling !== undefined) {
				webContents.backgroundThrottling = session.previousBackgroundThrottling;
			}
		}
	}

	async sendMouse({
		session,
		type,
		point,
		button,
		clickCount,
		movement,
	}: {
		session: AgentPointerInputSession;
		type: PointerMouseEventType;
		point: AgentPointerPoint;
		button?: AgentPointerButton;
		clickCount?: number;
		movement?: AgentPointerPoint;
	}): Promise<void> {
		if (session.inputMode === "foreground") {
			const event: MouseInputEvent = {
				type,
				x: point.x,
				y: point.y,
				...(button ? { button } : {}),
				...(typeof clickCount === "number" ? { clickCount } : {}),
				...(movement ? { movementX: movement.x, movementY: movement.y } : {}),
			};
			this.win.webContents.sendInputEvent(event);
			return;
		}

		await this.dispatchBackground({
			params: {
				type: cdpEventType({ type }),
				x: point.x,
				y: point.y,
				button: button ?? "none",
				buttons: type === "mouseUp" ? 0 : buttonMask({ button }),
				clickCount: clickCount ?? 0,
				pointerType: "mouse",
			},
		});
	}

	async sendWheel({
		session,
		point,
		deltaX,
		deltaY,
	}: {
		session: AgentPointerInputSession;
		point: AgentPointerPoint;
		deltaX: number;
		deltaY: number;
	}): Promise<void> {
		if (session.inputMode === "foreground") {
			this.win.webContents.sendInputEvent({
				type: "mouseWheel",
				x: point.x,
				y: point.y,
				deltaX,
				deltaY,
				canScroll: true,
				hasPreciseScrollingDeltas: true,
			});
			return;
		}

		await this.dispatchBackground({
			params: {
				type: "mouseWheel",
				x: point.x,
				y: point.y,
				button: "none",
				buttons: 0,
				deltaX,
				deltaY,
				pointerType: "mouse",
			},
		});
	}

	async sendKey({
		session,
		type,
		key,
		modifiers = [],
	}: {
		session: AgentPointerInputSession;
		type: KeyboardEventType;
		key: string;
		modifiers?: AgentKeyboardModifier[];
	}): Promise<void> {
		if (session.inputMode === "foreground") {
			const event: KeyboardInputEvent = {
				type,
				keyCode: key,
				modifiers: electronModifiers(modifiers),
			};
			this.win.webContents.sendInputEvent(event);
			return;
		}

		const descriptor = describeCdpKey({ key, modifiers });
		await this.dispatchBackgroundCommand({
			method: "Input.dispatchKeyEvent",
			params: {
				type:
					type === "keyUp"
						? "keyUp"
						: descriptor.text
							? "keyDown"
							: "rawKeyDown",
				key: descriptor.key,
				code: descriptor.code,
				windowsVirtualKeyCode: descriptor.windowsVirtualKeyCode,
				modifiers: cdpModifierMask(modifiers),
				...(type === "keyDown" && descriptor.text
					? { text: descriptor.text, unmodifiedText: descriptor.text }
					: {}),
				...(type === "keyDown" && descriptor.commands
					? { commands: descriptor.commands }
					: {}),
			},
		});
	}

	async insertText({
		session,
		text,
	}: {
		session: AgentPointerInputSession;
		text: string;
	}): Promise<void> {
		if (session.inputMode === "foreground") {
			await this.win.webContents.insertText(text);
			return;
		}
		await this.dispatchBackgroundCommand({
			method: "Input.insertText",
			params: { text },
		});
	}

	isWindowFocused(): boolean {
		return !this.win.isDestroyed() && this.win.isFocused();
	}

	assertInsideViewport({ point }: { point: AgentPointerPoint }): void {
		const [width, height] = this.win.getContentSize();
		if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) {
			throw new AgentPointerError({
				message: `Pointer coordinates (${point.x}, ${point.y}) are outside the editor viewport (${width} x ${height}).`,
				statusCode: 400,
			});
		}
	}

	getViewportCenter(): AgentPointerPoint {
		const [width, height] = this.win.getContentSize();
		return {
			x: Math.max(0, Math.round(width / 2)),
			y: Math.max(0, Math.round(height / 2)),
		};
	}

	private assertWindowAvailable(): void {
		if (this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
			throw new AgentPointerError({
				message: "The QCut editor window is no longer available.",
				statusCode: 503,
			});
		}
	}

	private async dispatchBackground({
		params,
	}: {
		params: Record<string, string | number>;
	}): Promise<void> {
		try {
			await this.dispatchBackgroundCommand({
				method: "Input.dispatchMouseEvent",
				params,
			});
		} catch (error) {
			throw new AgentPointerError({
				message: `Background pointer input failed: ${errorMessage({ error })}`,
				statusCode: 503,
			});
		}
	}

	private async dispatchBackgroundCommand({
		method,
		params,
	}: {
		method: string;
		params: Record<string, unknown>;
	}): Promise<void> {
		try {
			await this.win.webContents.debugger.sendCommand(method, params);
		} catch (error) {
			throw new AgentPointerError({
				message: `Background input failed: ${errorMessage({ error })}`,
				statusCode: 503,
			});
		}
	}
}

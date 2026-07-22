import type {
	BrowserWindow,
	MouseInputEvent,
	MouseWheelInputEvent,
} from "electron";
import type {
	AgentPointerButton,
	AgentPointerPoint,
	AgentPointerTarget,
} from "../../types/claude-api.js";
import { AgentPointerError } from "./agent-pointer-error.js";

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

export class AgentPointerInput {
	private readonly win: BrowserWindow;

	constructor({ win }: { win: BrowserWindow }) {
		this.win = win;
	}

	ensureWindowReady(): void {
		if (this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
			throw new AgentPointerError({
				message: "The QCut editor window is no longer available.",
				statusCode: 503,
			});
		}
		if (!this.win.isVisible()) {
			this.win.show();
		}
		this.win.focus();
	}

	sendMouse({
		type,
		point,
		button,
		clickCount,
		movement,
	}: {
		type: MouseInputEvent["type"];
		point: AgentPointerPoint;
		button?: AgentPointerButton;
		clickCount?: number;
		movement?: AgentPointerPoint;
	}): void {
		const event: MouseInputEvent = {
			type,
			x: point.x,
			y: point.y,
			...(button ? { button } : {}),
			...(typeof clickCount === "number" ? { clickCount } : {}),
			...(movement ? { movementX: movement.x, movementY: movement.y } : {}),
		};
		this.win.webContents.sendInputEvent(event);
	}

	sendWheel({
		point,
		deltaX,
		deltaY,
	}: {
		point: AgentPointerPoint;
		deltaX: number;
		deltaY: number;
	}): void {
		const event: MouseWheelInputEvent = {
			type: "mouseWheel",
			x: point.x,
			y: point.y,
			deltaX,
			deltaY,
			canScroll: true,
			hasPreciseScrollingDeltas: true,
		};
		this.win.webContents.sendInputEvent(event);
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
}

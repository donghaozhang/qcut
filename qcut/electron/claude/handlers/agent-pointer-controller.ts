import type { BrowserWindow } from "electron";
import {
	type AgentPointerAction,
	type AgentPointerButton,
	type AgentPointerClickRequest,
	type AgentPointerDragRequest,
	type AgentPointerMoveRequest,
	type AgentPointerPoint,
	type AgentPointerResolvedTarget,
	type AgentPointerResult,
	type AgentPointerScrollRequest,
	type AgentPointerTarget,
	type AgentPointerVisualState,
} from "../../types/claude-api.js";
import { AgentPointerError } from "./agent-pointer-error.js";
import {
	AgentPointerInput,
	hasExplicitPointerTarget,
} from "./agent-pointer-input.js";
import {
	buildPointerMovementPath,
	POINTER_MOVE_STEP_MS,
} from "./agent-pointer-motion.js";
import { AgentPointerVisualStateStore } from "./agent-pointer-visual-state.js";

export { AgentPointerError } from "./agent-pointer-error.js";
export { buildPointerMovementPath } from "./agent-pointer-motion.js";

const POINTER_PRESS_MS = 55;
const POINTER_DOUBLE_CLICK_GAP_MS = 80;
const POINTER_HOVER_SETTLE_MS = 180;

type ResolveAgentPointerRef = (input: {
	win: BrowserWindow;
	ref: string;
}) => Promise<AgentPointerResolvedTarget>;

type Sleep = (input: { durationMs: number }) => Promise<void>;

interface AgentPointerControllerOptions {
	win: BrowserWindow;
	resolveRef: ResolveAgentPointerRef;
	sleep?: Sleep;
}

interface MovePathOptions {
	points: AgentPointerPoint[];
	index?: number;
	action: AgentPointerAction;
	button: AgentPointerButton | null;
	dragging: boolean;
}

interface MoveToOptions {
	target: AgentPointerTarget;
	action: AgentPointerAction;
	button?: AgentPointerButton | null;
	dragging?: boolean;
}

interface PressCycleOptions {
	target: AgentPointerResolvedTarget;
	action: "click" | "double-click" | "right-click";
	button: "left" | "right";
	clickCount: number;
}

function defaultSleep({ durationMs }: { durationMs: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export class AgentPointerController {
	private readonly win: BrowserWindow;
	private readonly resolveRef: ResolveAgentPointerRef;
	private readonly sleep: Sleep;
	private readonly input: AgentPointerInput;
	private readonly visual: AgentPointerVisualStateStore;
	private currentPosition: AgentPointerPoint | null = null;
	private queue: Promise<void> = Promise.resolve();

	constructor({
		win,
		resolveRef,
		sleep = defaultSleep,
	}: AgentPointerControllerOptions) {
		this.win = win;
		this.resolveRef = resolveRef;
		this.sleep = sleep;
		this.input = new AgentPointerInput({ win });
		this.visual = new AgentPointerVisualStateStore({ win });
	}

	getState(): AgentPointerVisualState {
		return this.visual.getState();
	}

	move(request: AgentPointerMoveRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const target = await this.moveTo({ target: request, action: "move" });
				this.visual.scheduleIdle();
				return this.buildResult({ action: "move", target });
			},
		});
	}

	hover(request: AgentPointerMoveRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const target = await this.moveTo({ target: request, action: "hover" });
				await this.sleep({ durationMs: POINTER_HOVER_SETTLE_MS });
				this.visual.scheduleIdle();
				return this.buildResult({ action: "hover", target });
			},
		});
	}

	click(request: AgentPointerClickRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const target = await this.moveTo({ target: request, action: "click" });
				this.assertTargetEnabled({ target });
				await this.pressCycle({
					target,
					action: "click",
					button: "left",
					clickCount: 1,
				});
				this.visual.scheduleIdle();
				return this.buildResult({ action: "click", target });
			},
		});
	}

	doubleClick(request: AgentPointerClickRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const target = await this.moveTo({
					target: request,
					action: "double-click",
				});
				this.assertTargetEnabled({ target });
				await this.pressCycle({
					target,
					action: "double-click",
					button: "left",
					clickCount: 1,
				});
				await this.sleep({ durationMs: POINTER_DOUBLE_CLICK_GAP_MS });
				await this.pressCycle({
					target,
					action: "double-click",
					button: "left",
					clickCount: 2,
				});
				this.visual.scheduleIdle();
				return this.buildResult({ action: "double-click", target });
			},
		});
	}

	rightClick(request: AgentPointerClickRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const target = await this.moveTo({
					target: request,
					action: "right-click",
				});
				this.assertTargetEnabled({ target });
				await this.pressCycle({
					target,
					action: "right-click",
					button: "right",
					clickCount: 1,
				});
				this.visual.scheduleIdle();
				return this.buildResult({ action: "right-click", target });
			},
		});
	}

	drag(request: AgentPointerDragRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const from = await this.moveTo({
					target: request.from,
					action: "drag",
				});
				let buttonDown = false;
				let destination: AgentPointerResolvedTarget | undefined;
				try {
					this.visual.update({
						action: "drag",
						pressed: true,
						dragging: true,
						button: "left",
					});
					this.input.sendMouse({
						type: "mouseDown",
						point: from,
						button: "left",
						clickCount: 1,
					});
					buttonDown = true;
					await this.sleep({ durationMs: POINTER_PRESS_MS });

					destination = await this.moveTo({
						target: request.to,
						action: "drag",
						button: "left",
						dragging: true,
					});
				} finally {
					try {
						if (buttonDown) {
							this.input.sendMouse({
								type: "mouseUp",
								point: this.currentPosition ?? from,
								button: "left",
								clickCount: 1,
							});
						}
					} finally {
						this.visual.update({
							action: "drag",
							pressed: false,
							dragging: false,
							button: null,
						});
						this.visual.scheduleIdle();
					}
				}

				if (!destination) {
					throw new AgentPointerError({
						message: "Pointer drag did not resolve a destination.",
						statusCode: 500,
					});
				}
				return this.buildResult({ action: "drag", target: destination });
			},
		});
	}

	scroll(request: AgentPointerScrollRequest): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				const target = hasExplicitPointerTarget({ target: request })
					? await this.moveTo({ target: request, action: "scroll" })
					: await this.resolveCurrentOrCenter();
				this.input.ensureWindowReady();
				this.visual.update({ action: "scroll", x: target.x, y: target.y });

				const deltaX = request.deltaX ?? 0;
				const deltaY = request.deltaY ?? 0;
				this.input.sendWheel({ point: target, deltaX, deltaY });
				this.visual.scheduleIdle();
				return {
					...this.buildResult({ action: "scroll", target }),
					deltaX,
					deltaY,
				};
			},
		});
	}

	hide(): Promise<AgentPointerResult> {
		return this.enqueue({
			operation: async () => {
				this.visual.clearIdle();
				this.visual.update({
					visible: false,
					active: false,
					action: "hidden",
					pressed: false,
					dragging: false,
					button: null,
					pulseId: 0,
				});
				const point = this.currentPosition ?? { x: 0, y: 0 };
				return {
					action: "hidden",
					visible: false,
					input: "electron-send-input-event",
					...point,
				};
			},
		});
	}

	private enqueue<T>({
		operation,
	}: {
		operation: () => Promise<T>;
	}): Promise<T> {
		const result = this.queue.then(operation, operation);
		this.queue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async moveTo({
		target,
		action,
		button = null,
		dragging = false,
	}: MoveToOptions): Promise<AgentPointerResolvedTarget> {
		this.input.ensureWindowReady();
		const resolvedTarget = await this.resolveTarget({ target });
		const points = buildPointerMovementPath({
			from: this.currentPosition,
			to: resolvedTarget,
		});
		await this.moveAlongPath({ points, action, button, dragging });
		return resolvedTarget;
	}

	private async moveAlongPath({
		points,
		index = 0,
		action,
		button,
		dragging,
	}: MovePathOptions): Promise<void> {
		const point = points[index];
		if (!point) return;

		const previous = this.currentPosition;
		this.input.sendMouse({
			type: "mouseMove",
			point,
			button: button ?? undefined,
			movement: previous
				? { x: point.x - previous.x, y: point.y - previous.y }
				: undefined,
		});
		this.currentPosition = { x: point.x, y: point.y };
		this.visual.update({
			action,
			x: point.x,
			y: point.y,
			pressed: button !== null,
			dragging,
			button,
		});

		if (index >= points.length - 1) return;
		await this.sleep({ durationMs: POINTER_MOVE_STEP_MS });
		await this.moveAlongPath({
			points,
			index: index + 1,
			action,
			button,
			dragging,
		});
	}

	private async pressCycle({
		target,
		action,
		button,
		clickCount,
	}: PressCycleOptions): Promise<void> {
		this.visual.update({
			action,
			pressed: true,
			button,
			x: target.x,
			y: target.y,
		});
		this.input.sendMouse({
			type: "mouseDown",
			point: target,
			button,
			clickCount,
		});
		await this.sleep({ durationMs: POINTER_PRESS_MS });
		this.input.sendMouse({
			type: "mouseUp",
			point: target,
			button,
			clickCount,
		});
		this.visual.update({
			action,
			pressed: false,
			button: null,
			pulseId: this.visual.getState().pulseId + 1,
		});
	}

	private async resolveTarget({
		target,
	}: {
		target: AgentPointerTarget;
	}): Promise<AgentPointerResolvedTarget> {
		const ref = target.ref?.trim();
		if (ref) {
			const resolved = await this.resolveRef({ win: this.win, ref });
			this.input.assertInsideViewport({ point: resolved });
			return resolved;
		}

		const coordinateX = target.x;
		const coordinateY = target.y;
		if (
			typeof coordinateX !== "number" ||
			!Number.isFinite(coordinateX) ||
			typeof coordinateY !== "number" ||
			!Number.isFinite(coordinateY)
		) {
			throw new AgentPointerError({
				message:
					"Pointer target requires either 'ref' or finite 'x' and 'y' coordinates.",
				statusCode: 400,
			});
		}

		const point = {
			x: Math.round(coordinateX),
			y: Math.round(coordinateY),
		};
		this.input.assertInsideViewport({ point });
		return point;
	}

	private async resolveCurrentOrCenter(): Promise<AgentPointerResolvedTarget> {
		if (this.currentPosition) {
			return { ...this.currentPosition };
		}
		return this.input.getViewportCenter();
	}

	private assertTargetEnabled({
		target,
	}: {
		target: AgentPointerResolvedTarget;
	}): void {
		if (target.disabled !== true) return;
		throw new AgentPointerError({
			message: "Cannot interact with a disabled element.",
			statusCode: 409,
		});
	}

	private buildResult({
		action,
		target,
	}: {
		action: AgentPointerAction;
		target: AgentPointerResolvedTarget;
	}): AgentPointerResult {
		return {
			action,
			visible: true,
			input: "electron-send-input-event",
			x: target.x,
			y: target.y,
			target,
		};
	}
}

const controllerByWindow = new WeakMap<BrowserWindow, AgentPointerController>();

export function getAgentPointerController({
	win,
	resolveRef,
}: {
	win: BrowserWindow;
	resolveRef: ResolveAgentPointerRef;
}): AgentPointerController {
	const existing = controllerByWindow.get(win);
	if (existing) return existing;

	const controller = new AgentPointerController({ win, resolveRef });
	controllerByWindow.set(win, controller);
	return controller;
}

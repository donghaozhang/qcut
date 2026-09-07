import {
	type AgentPointerAction,
	type AgentPointerButton,
	type AgentPointerDragData,
	type AgentPointerDragMode,
	type AgentPointerDragOutcome,
	type AgentPointerDragRequest,
	type AgentPointerPoint,
	type AgentPointerResolvedTarget,
	type AgentPointerTarget,
} from "../../types/claude-api.js";
import { AgentPointerError } from "./agent-pointer-error.js";
import type {
	AgentPointerInput,
	AgentPointerInputSession,
} from "./agent-pointer-input.js";
import {
	buildPointerMovementPath,
	POINTER_MOVE_STEP_MS,
} from "./agent-pointer-motion.js";
import type { AgentPointerTargetResolver } from "./agent-pointer-target-resolver.js";
import type { AgentPointerVisualStateStore } from "./agent-pointer-visual-state.js";

const POINTER_PRESS_MS = 55;
/** Pressed-pointer moves dispatched before checking whether the page started an HTML5 drag. */
const POINTER_DRAG_START_STEPS = 3;
/** Grace period for `Input.dragIntercepted` after the first drag moves. */
const POINTER_DRAG_INTERCEPT_TIMEOUT_MS = 250;

type Sleep = (input: { durationMs: number }) => Promise<void>;

/** The controller internals a drag needs; keeps the drag flow out of the controller file. */
export interface AgentPointerDragHost {
	input: AgentPointerInput;
	visual: AgentPointerVisualStateStore;
	targets: AgentPointerTargetResolver;
	sleep: Sleep;
	getPosition: () => AgentPointerPoint | null;
	setPosition: (point: AgentPointerPoint) => void;
	moveTo: (input: {
		session: AgentPointerInputSession;
		target: AgentPointerTarget;
		action: AgentPointerAction;
	}) => Promise<AgentPointerResolvedTarget>;
	moveStep: (input: {
		session: AgentPointerInputSession;
		point: AgentPointerPoint;
		action: AgentPointerAction;
		button: AgentPointerButton | null;
		dragging: boolean;
	}) => Promise<void>;
	moveAlongPath: (input: {
		session: AgentPointerInputSession;
		points: AgentPointerPoint[];
		index?: number;
		action: AgentPointerAction;
		button: AgentPointerButton | null;
		dragging: boolean;
		stepDelayMs?: number;
	}) => Promise<void>;
}

export function describeDragOutcome({
	mode,
	dragData,
}: {
	mode: AgentPointerDragMode;
	dragData: AgentPointerDragData | null;
}): AgentPointerDragOutcome {
	if (!dragData) {
		return {
			mode,
			intercepted: false,
			backend: "mouse",
			mimeTypes: [],
			fileCount: 0,
			dragOperationsMask: null,
		};
	}
	return {
		mode,
		intercepted: true,
		backend: "cdp-dispatch-drag-event",
		mimeTypes: dragData.items.map((item) => item.mimeType),
		fileCount: dragData.files?.length ?? 0,
		dragOperationsMask: dragData.dragOperationsMask,
	};
}

/**
 * Run one drag: press at `from`, and either replay an HTML5 drag the page
 * started (intercepted through CDP) with dragEnter/dragOver/drop, or move the
 * pressed pointer to `to` as a plain mouse drag.
 */
export async function runAgentPointerDrag({
	host,
	session,
	request,
}: {
	host: AgentPointerDragHost;
	session: AgentPointerInputSession;
	request: AgentPointerDragRequest;
}): Promise<{
	destination: AgentPointerResolvedTarget;
	outcome: AgentPointerDragOutcome;
}> {
	const mode: AgentPointerDragMode = request.dnd ?? "auto";
	const from = await host.moveTo({
		session,
		target: request.from,
		action: "drag",
	});
	const interception =
		mode === "mouse"
			? null
			: await host.input.beginDragInterception({ session });
	if (mode === "html5" && !interception) {
		throw new AgentPointerError({
			message:
				"HTML5 drag-and-drop requires background pointer input. Retry without --foreground, or use --dnd mouse for a plain mouse drag.",
			statusCode: 400,
		});
	}
	let buttonDown = false;
	let dragData: AgentPointerDragData | null = null;
	let dropped = false;
	let destination: AgentPointerResolvedTarget | undefined;
	try {
		host.visual.update({
			action: "drag",
			inputMode: session.inputMode,
			pressed: true,
			dragging: true,
			button: "left",
		});
		await host.input.sendMouse({
			session,
			type: "mouseDown",
			point: from,
			button: "left",
			clickCount: 1,
		});
		buttonDown = true;
		await host.sleep({
			durationMs: request.holdMs ?? POINTER_PRESS_MS,
		});

		const waypoints = [...(request.via ?? []), request.to];
		const resolvedWaypoints: AgentPointerResolvedTarget[] = [];
		for (const waypoint of waypoints) {
			resolvedWaypoints.push(await host.targets.resolve({ target: waypoint }));
		}
		const perSegmentSteps = request.steps
			? Math.max(1, Math.round(request.steps / resolvedWaypoints.length))
			: undefined;
		const points: AgentPointerPoint[] = [];
		let cursor: AgentPointerPoint | null = from;
		for (const waypoint of resolvedWaypoints) {
			points.push(
				...buildPointerMovementPath({
					from: cursor,
					to: waypoint,
					steps: perSegmentSteps,
				})
			);
			cursor = waypoint;
		}
		const stepDelayMs = Math.max(
			0,
			request.durationMs !== undefined
				? request.durationMs / Math.max(1, points.length - 1)
				: POINTER_MOVE_STEP_MS
		);
		const finalTarget = resolvedWaypoints[resolvedWaypoints.length - 1];

		let index = 0;
		if (interception) {
			// Chromium starts a drag once the pressed pointer crosses its
			// drag threshold, so walk the first steps and let the page claim it.
			const startSteps = Math.min(points.length, POINTER_DRAG_START_STEPS);
			while (index < startSteps && !interception.intercepted()) {
				await host.moveStep({
					session,
					point: points[index],
					action: "drag",
					button: "left",
					dragging: true,
				});
				index += 1;
				if (index < points.length) {
					await host.sleep({ durationMs: stepDelayMs });
				}
			}
			dragData =
				interception.intercepted() ??
				(await interception.waitForIntercept({
					timeoutMs:
						request.dragStartTimeoutMs ?? POINTER_DRAG_INTERCEPT_TIMEOUT_MS,
				}));
			if (!dragData && mode === "html5") {
				throw new AgentPointerError({
					message:
						"The drag source did not start an HTML5 drag-and-drop; the element is not draggable or the page cancelled the drag. Retry with --dnd mouse for a plain mouse drag.",
					statusCode: 409,
				});
			}
		}

		if (dragData) {
			await host.input.sendDrag({
				session,
				type: "dragEnter",
				point: host.getPosition() ?? from,
				data: dragData,
			});
			for (; index < points.length; index += 1) {
				const point = points[index];
				await host.input.sendDrag({
					session,
					type: "dragOver",
					point,
					data: dragData,
				});
				host.setPosition({ x: point.x, y: point.y });
				host.visual.update({
					action: "drag",
					inputMode: session.inputMode,
					x: point.x,
					y: point.y,
					pressed: true,
					dragging: true,
					button: "left",
				});
				if (index < points.length - 1) {
					await host.sleep({ durationMs: stepDelayMs });
				}
			}
			await host.sleep({
				durationMs: request.releaseDelayMs ?? POINTER_PRESS_MS,
			});
			await host.input.sendDrag({
				session,
				type: "drop",
				point: finalTarget,
				data: dragData,
			});
			dropped = true;
		} else {
			await host.moveAlongPath({
				session,
				points,
				index,
				action: "drag",
				button: "left",
				dragging: true,
				stepDelayMs,
			});
			await host.sleep({
				durationMs: request.releaseDelayMs ?? POINTER_PRESS_MS,
			});
		}
		destination = finalTarget;
	} finally {
		try {
			if (dragData && !dropped) {
				try {
					await host.input.sendDrag({
						session,
						type: "dragCancel",
						point: host.getPosition() ?? from,
						data: dragData,
					});
				} catch {
					// The button release below still ends the gesture.
				}
			}
			if (buttonDown) {
				await host.input.sendMouse({
					session,
					type: "mouseUp",
					point: host.getPosition() ?? from,
					button: "left",
					clickCount: 1,
				});
			}
		} finally {
			await interception?.dispose();
			host.visual.update({
				action: "drag",
				inputMode: session.inputMode,
				pressed: false,
				dragging: false,
				button: null,
			});
			host.visual.scheduleIdle();
		}
	}

	if (!destination) {
		throw new AgentPointerError({
			message: "Pointer drag did not resolve a destination.",
			statusCode: 500,
		});
	}
	return { destination, outcome: describeDragOutcome({ mode, dragData }) };
}

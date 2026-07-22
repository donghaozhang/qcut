import type { BrowserWindow } from "electron";
import type {
	AgentPointerPoint,
	AgentPointerResolvedTarget,
	AgentPointerTarget,
} from "../../types/claude-api.js";
import { AgentPointerError } from "./agent-pointer-error.js";
import type { AgentPointerInput } from "./agent-pointer-input.js";

export type ResolveAgentPointerRef = (input: {
	win: BrowserWindow;
	ref: string;
}) => Promise<AgentPointerResolvedTarget>;

export class AgentPointerTargetResolver {
	private readonly win: BrowserWindow;
	private readonly input: AgentPointerInput;
	private readonly resolveRef: ResolveAgentPointerRef;

	constructor({
		win,
		input,
		resolveRef,
	}: {
		win: BrowserWindow;
		input: AgentPointerInput;
		resolveRef: ResolveAgentPointerRef;
	}) {
		this.win = win;
		this.input = input;
		this.resolveRef = resolveRef;
	}

	async resolve({
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

	currentOrCenter({
		currentPosition,
	}: {
		currentPosition: AgentPointerPoint | null;
	}): AgentPointerResolvedTarget {
		return currentPosition
			? { ...currentPosition }
			: this.input.getViewportCenter();
	}

	assertEnabled({ target }: { target: AgentPointerResolvedTarget }): void {
		if (target.disabled !== true) return;
		throw new AgentPointerError({
			message: "Cannot interact with a disabled element.",
			statusCode: 409,
		});
	}
}

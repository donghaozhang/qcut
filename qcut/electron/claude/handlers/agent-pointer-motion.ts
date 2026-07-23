import type {
	AgentPointerPoint,
	AgentPointerResolvedTarget,
} from "../../types/claude-api.js";

export const POINTER_MOVE_STEP_MS = 14;

const MAX_MOVEMENT_STEPS = 14;
const MIN_MOVEMENT_STEPS = 3;

function distanceBetween({
	from,
	to,
}: {
	from: AgentPointerPoint;
	to: AgentPointerPoint;
}): number {
	return Math.hypot(to.x - from.x, to.y - from.y);
}

export function buildPointerMovementPath({
	from,
	to,
	steps,
}: {
	from: AgentPointerPoint | null;
	to: AgentPointerResolvedTarget;
	steps?: number;
}): AgentPointerPoint[] {
	if (!from) {
		return [{ x: to.x, y: to.y }];
	}

	const distance = distanceBetween({ from, to });
	if (distance < 1) {
		return [{ x: to.x, y: to.y }];
	}

	const stepCount =
		typeof steps === "number" && Number.isFinite(steps)
			? Math.max(1, Math.round(steps))
			: Math.min(
					MAX_MOVEMENT_STEPS,
					Math.max(MIN_MOVEMENT_STEPS, Math.ceil(distance / 70))
				);
	return Array.from({ length: stepCount }, (_, index) => {
		const progress = (index + 1) / stepCount;
		const eased = 1 - (1 - progress) ** 3;
		return {
			x: Math.round(from.x + (to.x - from.x) * eased),
			y: Math.round(from.y + (to.y - from.y) * eased),
		};
	});
}

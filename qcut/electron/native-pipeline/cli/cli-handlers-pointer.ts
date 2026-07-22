import type {
	AgentPointerDragRequest,
	AgentPointerScrollRequest,
	AgentPointerTarget,
} from "../../types/claude-api.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

interface PointerTargetOptions {
	ref?: string;
	x?: number;
	y?: number;
}

const BACKGROUND_POINTER_CAPABILITY = {
	name: "state.pointer",
	minVersion: "1.1.0",
	feature: "Background pointer input",
	remediation:
		"Update QCut. Editors advertising state.pointer 1.0.0 can retry with --foreground.",
} as const;

function pointerInputMode({
	options,
}: {
	options: CLIRunOptions;
}): "background" | "foreground" {
	return options.foreground ? "foreground" : "background";
}

async function requirePointerInputSupport({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<void> {
	if (options.foreground) return;
	await client.requireCapability(BACKGROUND_POINTER_CAPABILITY);
}

type PointerTargetResult =
	| { ok: true; target: AgentPointerTarget }
	| { ok: false; error: string };

function buildPointerTarget({
	options,
	label,
}: {
	options: PointerTargetOptions;
	label: string;
}): PointerTargetResult {
	const ref = options.ref?.trim();
	const hasX = typeof options.x === "number" && Number.isFinite(options.x);
	const hasY = typeof options.y === "number" && Number.isFinite(options.y);
	const hasAnyCoordinate = options.x !== undefined || options.y !== undefined;
	if (ref && hasAnyCoordinate) {
		return {
			ok: false,
			error: `${label} accepts either --ref or coordinates, not both`,
		};
	}
	if (ref) return { ok: true, target: { ref } };
	if (hasX && hasY) {
		return { ok: true, target: { x: options.x, y: options.y } };
	}

	return {
		ok: false,
		error: `${label} requires --ref <@eN> or both --x <number> and --y <number>`,
	};
}

async function postTargetAction({
	client,
	options,
	action,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	action: "move" | "hover" | "click" | "double-click" | "right-click";
}): Promise<CLIResult> {
	const target = buildPointerTarget({
		options: { ref: options.ref, x: options.x, y: options.y },
		label: `Pointer ${action}`,
	});
	if (!target.ok) return { success: false, error: target.error };

	await requirePointerInputSupport({ client, options });
	const data = await client.post(`/api/claude/pointer/${action}`, {
		...target.target,
		inputMode: pointerInputMode({ options }),
	});
	return { success: true, data };
}

async function handleDrag({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const from = buildPointerTarget({
		options: {
			ref: options.fromRef,
			x: options.fromX,
			y: options.fromY,
		},
		label: "Pointer drag start",
	});
	if (!from.ok) return { success: false, error: from.error };

	const to = buildPointerTarget({
		options: {
			ref: options.toRef,
			x: options.toX,
			y: options.toY,
		},
		label: "Pointer drag destination",
	});
	if (!to.ok) return { success: false, error: to.error };

	const request: AgentPointerDragRequest = {
		from: from.target,
		to: to.target,
		inputMode: pointerInputMode({ options }),
	};
	await requirePointerInputSupport({ client, options });
	const data = await client.post("/api/claude/pointer/drag", request);
	return { success: true, data };
}

async function handleScroll({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const hasDeltaX =
		typeof options.deltaX === "number" && Number.isFinite(options.deltaX);
	const hasDeltaY =
		typeof options.deltaY === "number" && Number.isFinite(options.deltaY);
	if (!hasDeltaX && !hasDeltaY) {
		return {
			success: false,
			error: "Pointer scroll requires --delta-x <number> or --delta-y <number>",
		};
	}

	const request: AgentPointerScrollRequest = {
		inputMode: pointerInputMode({ options }),
		...(hasDeltaX ? { deltaX: options.deltaX } : {}),
		...(hasDeltaY ? { deltaY: options.deltaY } : {}),
	};
	const hasTargetOption =
		options.ref !== undefined ||
		options.x !== undefined ||
		options.y !== undefined;
	if (hasTargetOption) {
		const target = buildPointerTarget({
			options: { ref: options.ref, x: options.x, y: options.y },
			label: "Pointer scroll target",
		});
		if (!target.ok) return { success: false, error: target.error };
		Object.assign(request, target.target);
	}

	await requirePointerInputSupport({ client, options });
	const data = await client.post("/api/claude/pointer/scroll", request);
	return { success: true, data };
}

export async function handlePointerCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	switch (action) {
		case "move":
		case "hover":
		case "click":
		case "double-click":
		case "right-click":
			return await postTargetAction({ client, options, action });
		case "drag":
			return await handleDrag({ client, options });
		case "scroll":
			return await handleScroll({ client, options });
		case "hide": {
			const data = await client.post("/api/claude/pointer/hide", {});
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown pointer action: ${action ?? ""}. Available: move, hover, click, double-click, right-click, drag, scroll, hide`,
			};
	}
}

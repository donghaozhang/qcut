import type {
	AgentKeyboardPressRequest,
	AgentKeyboardResult,
	AgentKeyboardTypeRequest,
	AgentPointerClickRequest,
	AgentPointerDragRequest,
	AgentPointerMoveRequest,
	AgentPointerResult,
	AgentPointerScrollRequest,
	AgentPointerTarget,
	AgentPointerVisualState,
} from "../../types/claude-api.js";
import { DEFAULT_AGENT_POINTER_INPUT_MODE } from "../../types/claude-api.js";
import { AgentPointerError } from "../handlers/agent-pointer-controller.js";
import { EditorSnapshotActionError } from "../handlers/claude-snapshot-handler.js";
import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";

interface AgentPointerRouteHandlers {
	getState: () => Promise<AgentPointerVisualState>;
	move: (request: AgentPointerMoveRequest) => Promise<AgentPointerResult>;
	hover: (request: AgentPointerMoveRequest) => Promise<AgentPointerResult>;
	click: (request: AgentPointerClickRequest) => Promise<AgentPointerResult>;
	doubleClick: (
		request: AgentPointerClickRequest
	) => Promise<AgentPointerResult>;
	rightClick: (
		request: AgentPointerClickRequest
	) => Promise<AgentPointerResult>;
	drag: (request: AgentPointerDragRequest) => Promise<AgentPointerResult>;
	scroll: (request: AgentPointerScrollRequest) => Promise<AgentPointerResult>;
	hide: () => Promise<AgentPointerResult>;
	pressKeys: (
		request: AgentKeyboardPressRequest
	) => Promise<AgentKeyboardResult>;
	typeText: (request: AgentKeyboardTypeRequest) => Promise<AgentKeyboardResult>;
	timeoutMs?: number;
}

function requireBodyObject({
	body,
}: {
	body: unknown;
}): Record<string, unknown> {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		throw new HttpError(400, "Pointer request body must be an object.");
	}
	return body as Record<string, unknown>;
}

function parseFiniteNumber({
	value,
	field,
}: {
	value: unknown;
	field: string;
}): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new HttpError(400, `Pointer '${field}' must be a finite number.`);
	}
	return value;
}

export function parseAgentPointerTarget({
	value,
	required = true,
	field = "target",
}: {
	value: unknown;
	required?: boolean;
	field?: string;
}): AgentPointerTarget {
	const body = requireBodyObject({ body: value });
	const rawRef = body.ref;
	const ref =
		typeof rawRef === "string" && rawRef.trim().length > 0
			? rawRef.trim()
			: undefined;
	if (rawRef !== undefined && !ref) {
		throw new HttpError(400, `Pointer '${field}.ref' must be non-empty.`);
	}

	const x = parseFiniteNumber({ value: body.x, field: `${field}.x` });
	const y = parseFiniteNumber({ value: body.y, field: `${field}.y` });
	const hasCoordinates = x !== undefined || y !== undefined;
	if (hasCoordinates && (x === undefined || y === undefined)) {
		throw new HttpError(
			400,
			`Pointer '${field}' requires both x and y coordinates.`
		);
	}
	if (ref && hasCoordinates) {
		throw new HttpError(
			400,
			`Pointer '${field}' accepts either ref or coordinates, not both.`
		);
	}
	if (!ref && !hasCoordinates && required) {
		throw new HttpError(
			400,
			`Pointer '${field}' requires either ref or x/y coordinates.`
		);
	}

	if (ref) return { ref };
	if (x !== undefined && y !== undefined) return { x, y };
	return {};
}

export function parseAgentPointerInputMode({
	value,
}: {
	value: unknown;
}): "background" | "foreground" {
	if (value === undefined) return DEFAULT_AGENT_POINTER_INPUT_MODE;
	if (value === "background" || value === "foreground") return value;
	throw new HttpError(
		400,
		"Pointer 'inputMode' must be 'background' or 'foreground'."
	);
}

function parseTargetRequest({
	body,
}: {
	body: unknown;
}): AgentPointerMoveRequest {
	const parsed = requireBodyObject({ body });
	return {
		...parseAgentPointerTarget({ value: parsed }),
		inputMode: parseAgentPointerInputMode({ value: parsed.inputMode }),
	};
}

function parseDragRequest({
	body,
}: {
	body: unknown;
}): AgentPointerDragRequest {
	const parsed = requireBodyObject({ body });
	const holdMs = parseFiniteNumber({ value: parsed.holdMs, field: "holdMs" });
	const durationMs = parseFiniteNumber({
		value: parsed.durationMs,
		field: "durationMs",
	});
	const releaseDelayMs = parseFiniteNumber({
		value: parsed.releaseDelayMs,
		field: "releaseDelayMs",
	});
	const steps = parseFiniteNumber({ value: parsed.steps, field: "steps" });
	for (const [field, value] of [
		["holdMs", holdMs],
		["durationMs", durationMs],
		["releaseDelayMs", releaseDelayMs],
	] as const) {
		if (value !== undefined && value < 0) {
			throw new HttpError(400, `Pointer '${field}' must be >= 0.`);
		}
	}
	if (
		steps !== undefined &&
		(!Number.isInteger(steps) || steps < 1 || steps > 500)
	) {
		throw new HttpError(
			400,
			"Pointer 'steps' must be an integer from 1 to 500."
		);
	}
	let via: AgentPointerTarget[] | undefined;
	if (parsed.via !== undefined) {
		if (!Array.isArray(parsed.via) || parsed.via.length > 50) {
			throw new HttpError(
				400,
				"Pointer 'via' must be an array of up to 50 targets."
			);
		}
		via = parsed.via.map((target, index) =>
			parseAgentPointerTarget({ value: target, field: `via[${index}]` })
		);
	}
	return {
		from: parseAgentPointerTarget({ value: parsed.from, field: "from" }),
		to: parseAgentPointerTarget({ value: parsed.to, field: "to" }),
		inputMode: parseAgentPointerInputMode({ value: parsed.inputMode }),
		via,
		holdMs,
		durationMs,
		releaseDelayMs,
		steps,
	};
}

function parseKeyboardPressRequest(body: unknown): AgentKeyboardPressRequest {
	const parsed = requireBodyObject({ body });
	if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
		throw new HttpError(
			400,
			"Keyboard press requires a non-empty 'keys' array."
		);
	}
	const keys = parsed.keys.map((key) => {
		if (typeof key !== "string" || !key.trim()) {
			throw new HttpError(
				400,
				"Every keyboard key must be a non-empty string."
			);
		}
		return key.trim();
	});
	const intervalMs = parseFiniteNumber({
		value: parsed.intervalMs,
		field: "intervalMs",
	});
	if (intervalMs !== undefined && intervalMs < 0) {
		throw new HttpError(400, "Keyboard 'intervalMs' must be >= 0.");
	}
	return {
		keys,
		intervalMs,
		inputMode: parseAgentPointerInputMode({ value: parsed.inputMode }),
	};
}

function parseKeyboardTypeRequest(body: unknown): AgentKeyboardTypeRequest {
	const parsed = requireBodyObject({ body });
	if (typeof parsed.text !== "string") {
		throw new HttpError(400, "Keyboard type requires string 'text'.");
	}
	const intervalMs = parseFiniteNumber({
		value: parsed.intervalMs,
		field: "intervalMs",
	});
	if (intervalMs !== undefined && intervalMs < 0) {
		throw new HttpError(400, "Keyboard 'intervalMs' must be >= 0.");
	}
	return {
		text: parsed.text,
		intervalMs,
		inputMode: parseAgentPointerInputMode({ value: parsed.inputMode }),
	};
}

function parseScrollRequest({
	body,
}: {
	body: unknown;
}): AgentPointerScrollRequest {
	const parsed = requireBodyObject({ body });
	const target = parseAgentPointerTarget({ value: parsed, required: false });
	const deltaX = parseFiniteNumber({ value: parsed.deltaX, field: "deltaX" });
	const deltaY = parseFiniteNumber({ value: parsed.deltaY, field: "deltaY" });
	if (deltaX === undefined && deltaY === undefined) {
		throw new HttpError(400, "Pointer scroll requires deltaX or deltaY.");
	}
	return {
		...target,
		inputMode: parseAgentPointerInputMode({ value: parsed.inputMode }),
		deltaX,
		deltaY,
	};
}

async function withPointerTimeout<T>({
	timeoutMs,
	work,
}: {
	timeoutMs: number;
	work: () => Promise<T>;
}): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new HttpError(504, "Pointer action timed out")),
					timeoutMs
				);
			}),
		]);
	} catch (error) {
		if (error instanceof HttpError) throw error;
		if (
			error instanceof AgentPointerError ||
			error instanceof EditorSnapshotActionError
		) {
			throw new HttpError(error.statusCode, error.message);
		}
		throw error;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export function registerAgentPointerRoutes(
	router: Router,
	handlers: AgentPointerRouteHandlers
): void {
	const timeoutMs = handlers.timeoutMs ?? 15_000;

	router.get("/api/claude/pointer/state", async () => {
		return await withPointerTimeout({ timeoutMs, work: handlers.getState });
	});

	router.post("/api/claude/pointer/move", async (req) => {
		const request = parseTargetRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.move(request),
		});
	});

	router.post("/api/claude/pointer/hover", async (req) => {
		const request = parseTargetRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.hover(request),
		});
	});

	router.post("/api/claude/pointer/click", async (req) => {
		const request = parseTargetRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.click(request),
		});
	});

	router.post("/api/claude/pointer/double-click", async (req) => {
		const request = parseTargetRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.doubleClick(request),
		});
	});

	router.post("/api/claude/pointer/right-click", async (req) => {
		const request = parseTargetRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.rightClick(request),
		});
	});

	router.post("/api/claude/pointer/drag", async (req) => {
		const request = parseDragRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.drag(request),
		});
	});

	router.post("/api/claude/pointer/scroll", async (req) => {
		const request = parseScrollRequest({ body: req.body });
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.scroll(request),
		});
	});

	router.post("/api/claude/pointer/hide", async () => {
		return await withPointerTimeout({ timeoutMs, work: handlers.hide });
	});

	router.post("/api/claude/keyboard/press", async (req) => {
		const request = parseKeyboardPressRequest(req.body);
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.pressKeys(request),
		});
	});

	router.post("/api/claude/keyboard/type", async (req) => {
		const request = parseKeyboardTypeRequest(req.body);
		return await withPointerTimeout({
			timeoutMs,
			work: async () => await handlers.typeText(request),
		});
	});
}

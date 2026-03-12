import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";
import type {
	EditorSnapshotActionResult,
	EditorSnapshotCheckRequest,
	EditorSnapshotClickRequest,
	EditorSnapshotFillRequest,
	EditorSnapshotRequest,
	EditorSnapshotResult,
	EditorSnapshotSelectRequest,
} from "../../types/claude-api.js";
import { MAX_EDITOR_SNAPSHOT_DEPTH } from "../../types/claude-api.js";
import { EditorSnapshotActionError } from "../handlers/claude-snapshot-handler.js";

function parseInteractive({ value }: { value?: string }): boolean | undefined {
	if (!value) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no"].includes(normalized)) {
		return false;
	}
	throw new HttpError(
		400,
		"Invalid interactive query. Use true/false, yes/no, or 1/0."
	);
}

function parseDepth({ value }: { value?: string }): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new HttpError(400, "Invalid depth query. Use an integer >= 0.");
	}
	return Math.min(parsed, MAX_EDITOR_SNAPSHOT_DEPTH);
}

export function parseSnapshotRequestFromQuery({
	interactive,
	depth,
}: {
	interactive?: string;
	depth?: string;
}): EditorSnapshotRequest | undefined {
	const request: EditorSnapshotRequest = {};
	const interactiveValue = parseInteractive({ value: interactive });
	const depthValue = parseDepth({ value: depth });

	if (typeof interactiveValue === "boolean") {
		request.interactive = interactiveValue;
	}
	if (typeof depthValue === "number") {
		request.depth = depthValue;
	}

	return Object.keys(request).length > 0 ? request : undefined;
}

function parseSnapshotClickRequest({
	body,
}: {
	body: unknown;
}): EditorSnapshotClickRequest {
	if (typeof body !== "object" || body === null) {
		throw new HttpError(400, "Snapshot click body must be an object.");
	}
	const ref = (body as { ref?: unknown }).ref;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new HttpError(400, "Snapshot click requires a non-empty 'ref'.");
	}
	return { ref };
}

function parseSnapshotFillRequest({
	body,
}: {
	body: unknown;
}): EditorSnapshotFillRequest {
	if (typeof body !== "object" || body === null) {
		throw new HttpError(400, "Snapshot fill body must be an object.");
	}
	const ref = (body as { ref?: unknown }).ref;
	const value = (body as { value?: unknown }).value;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new HttpError(400, "Snapshot fill requires a non-empty 'ref'.");
	}
	if (typeof value !== "string") {
		throw new HttpError(400, "Snapshot fill requires string 'value'.");
	}
	return { ref, value };
}

function parseSnapshotSelectRequest({
	body,
}: {
	body: unknown;
}): EditorSnapshotSelectRequest {
	if (typeof body !== "object" || body === null) {
		throw new HttpError(400, "Snapshot select body must be an object.");
	}
	const ref = (body as { ref?: unknown }).ref;
	const value = (body as { value?: unknown }).value;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new HttpError(400, "Snapshot select requires a non-empty 'ref'.");
	}
	if (typeof value !== "string") {
		throw new HttpError(400, "Snapshot select requires string 'value'.");
	}
	return { ref, value };
}

function parseSnapshotCheckRequest({
	body,
}: {
	body: unknown;
}): EditorSnapshotCheckRequest {
	if (typeof body !== "object" || body === null) {
		throw new HttpError(400, "Snapshot check body must be an object.");
	}
	const ref = (body as { ref?: unknown }).ref;
	const checked = (body as { checked?: unknown }).checked;
	if (typeof ref !== "string" || ref.trim().length === 0) {
		throw new HttpError(400, "Snapshot check requires a non-empty 'ref'.");
	}
	if (typeof checked !== "boolean") {
		throw new HttpError(400, "Snapshot check requires boolean 'checked'.");
	}
	return { ref, checked };
}

async function withSnapshotTimeout<T>({
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
					() => reject(new HttpError(504, "Renderer timed out")),
					timeoutMs
				);
			}),
		]);
	} catch (error) {
		if (error instanceof HttpError) {
			throw error;
		}
		if (error instanceof EditorSnapshotActionError) {
			throw new HttpError(error.statusCode, error.message);
		}
		throw error;
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

export function registerSnapshotRoutes(
	router: Router,
	options: {
		requestSnapshot: (
			request?: EditorSnapshotRequest
		) => Promise<EditorSnapshotResult>;
		clickSnapshotRef: (
			request: EditorSnapshotClickRequest
		) => Promise<EditorSnapshotActionResult>;
		fillSnapshotRef: (
			request: EditorSnapshotFillRequest
		) => Promise<EditorSnapshotActionResult>;
		selectSnapshotRef: (
			request: EditorSnapshotSelectRequest
		) => Promise<EditorSnapshotActionResult>;
		checkSnapshotRef: (
			request: EditorSnapshotCheckRequest
		) => Promise<EditorSnapshotActionResult>;
		timeoutMs?: number;
	}
): void {
	router.get("/api/claude/snapshot", async (req) => {
		const request = parseSnapshotRequestFromQuery({
			interactive: req.query.interactive,
			depth: req.query.depth,
		});
		const timeoutMs = options.timeoutMs ?? 5000;
		return await withSnapshotTimeout({
			timeoutMs,
			work: async () => await options.requestSnapshot(request),
		});
	});

	router.post("/api/claude/snapshot/click", async (req) => {
		const request = parseSnapshotClickRequest({ body: req.body });
		const timeoutMs = options.timeoutMs ?? 5000;
		return await withSnapshotTimeout({
			timeoutMs,
			work: async () => await options.clickSnapshotRef(request),
		});
	});

	router.post("/api/claude/snapshot/fill", async (req) => {
		const request = parseSnapshotFillRequest({ body: req.body });
		const timeoutMs = options.timeoutMs ?? 5000;
		return await withSnapshotTimeout({
			timeoutMs,
			work: async () => await options.fillSnapshotRef(request),
		});
	});

	router.post("/api/claude/snapshot/select", async (req) => {
		const request = parseSnapshotSelectRequest({ body: req.body });
		const timeoutMs = options.timeoutMs ?? 5000;
		return await withSnapshotTimeout({
			timeoutMs,
			work: async () => await options.selectSnapshotRef(request),
		});
	});

	router.post("/api/claude/snapshot/check", async (req) => {
		const request = parseSnapshotCheckRequest({ body: req.body });
		const timeoutMs = options.timeoutMs ?? 5000;
		return await withSnapshotTimeout({
			timeoutMs,
			work: async () => await options.checkSnapshotRef(request),
		});
	});
}

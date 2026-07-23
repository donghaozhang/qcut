import type {
	AgentPointerDragRequest,
	AgentPointerScrollRequest,
	AgentPointerTarget,
	EditorSnapshotElement,
	EditorSnapshotResponse,
} from "../../types/claude-api.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import { resolveJsonInput } from "../editor/editor-api-types.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

interface PointerTargetOptions {
	ref?: string;
	x?: number;
	y?: number;
}

interface ListDragContext {
	source: EditorSnapshotElement;
	siblings: EditorSnapshotElement[];
	sourceIndex: number;
	destination: AgentPointerTarget;
}

interface UiWaitOptions {
	ref?: string;
	text?: string;
	value?: string;
	timeoutMs?: number;
	intervalMs?: number;
}

const sleep = (durationMs: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, durationMs));

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

async function getEditorSnapshot(
	client: EditorApiClient
): Promise<{ elements: EditorSnapshotElement[] }> {
	const snapshot = await client.get<EditorSnapshotResponse>(
		"/api/claude/snapshot",
		{
			interactive: "true",
			depth: "32",
			maxNodes: "8000",
			maxBytes: String(1024 * 1024),
		}
	);
	if (snapshot.truncated === true) {
		throw new Error(`Editor snapshot was truncated: ${snapshot.reason}`);
	}
	return snapshot;
}

function visibleSiblings({
	elements,
	parentRef,
}: {
	elements: EditorSnapshotElement[];
	parentRef: string | null;
}): EditorSnapshotElement[] {
	return elements
		.filter(
			(element) =>
				element.parentRef === parentRef &&
				element.bounds.width > 0 &&
				element.bounds.height > 0
		)
		.sort((left, right) => {
			const verticalDelta = left.bounds.y - right.bounds.y;
			if (Math.abs(verticalDelta) > 3) return verticalDelta;
			return left.bounds.x - right.bounds.x;
		});
}

function sameListItemShape({
	source,
	candidate,
}: {
	source: EditorSnapshotElement;
	candidate: EditorSnapshotElement;
}): boolean {
	if (candidate.role !== source.role || candidate.tagName !== source.tagName) {
		return false;
	}

	const widthTolerance = Math.max(4, source.bounds.width * 0.2);
	const heightTolerance = Math.max(4, source.bounds.height * 0.2);
	return (
		Math.abs(candidate.bounds.width - source.bounds.width) <= widthTolerance &&
		Math.abs(candidate.bounds.height - source.bounds.height) <= heightTolerance
	);
}

function clusterAroundSource({
	items,
	source,
	axis,
}: {
	items: EditorSnapshotElement[];
	source: EditorSnapshotElement;
	axis: "x" | "y";
}): EditorSnapshotElement[] {
	const sorted = [...items].sort(
		(left, right) => left.bounds[axis] - right.bounds[axis]
	);
	if (sorted.length < 3) return sorted;

	const gaps = sorted
		.slice(1)
		.map((item, index) => ({
			index,
			distance: item.bounds[axis] - sorted[index].bounds[axis],
		}))
		.sort((left, right) => right.distance - left.distance);
	const largest = gaps[0];
	const secondLargest = gaps[1]?.distance ?? 0;
	const itemSpan = axis === "y" ? source.bounds.height : source.bounds.width;
	if (
		!largest ||
		largest.distance <= Math.max(itemSpan * 3, secondLargest * 1.75)
	) {
		return sorted;
	}

	const beforeGap = sorted.slice(0, largest.index + 1);
	const afterGap = sorted.slice(largest.index + 1);
	return beforeGap.some((item) => item.ref === source.ref)
		? beforeGap
		: afterGap;
}

function flattenedListSiblings({
	elements,
	source,
}: {
	elements: EditorSnapshotElement[];
	source: EditorSnapshotElement;
}): EditorSnapshotElement[] {
	const shaped = elements.filter(
		(candidate) =>
			candidate.bounds.width > 0 &&
			candidate.bounds.height > 0 &&
			sameListItemShape({ source, candidate })
	);
	if (source.testId) {
		const matchingTestIds = shaped.filter(
			(candidate) => candidate.testId === source.testId
		);
		const verticalSpan =
			Math.max(...matchingTestIds.map((item) => item.bounds.y)) -
			Math.min(...matchingTestIds.map((item) => item.bounds.y));
		const horizontalSpan =
			Math.max(...matchingTestIds.map((item) => item.bounds.x)) -
			Math.min(...matchingTestIds.map((item) => item.bounds.x));
		return clusterAroundSource({
			items: matchingTestIds,
			source,
			axis: verticalSpan >= horizontalSpan ? "y" : "x",
		});
	}

	const widthTolerance = Math.max(4, source.bounds.width * 0.2);
	const heightTolerance = Math.max(4, source.bounds.height * 0.2);
	const column = shaped.filter(
		(candidate) =>
			Math.abs(candidate.bounds.x - source.bounds.x) <= widthTolerance
	);
	const row = shaped.filter(
		(candidate) =>
			Math.abs(candidate.bounds.y - source.bounds.y) <= heightTolerance
	);
	return column.length >= row.length
		? clusterAroundSource({ items: column, source, axis: "y" })
		: clusterAroundSource({ items: row, source, axis: "x" });
}

function findSnapshotElement({
	elements,
	source,
}: {
	elements: EditorSnapshotElement[];
	source: EditorSnapshotElement;
}): EditorSnapshotElement | undefined {
	const hasSemanticIdentity = Boolean(source.testId || source.name);
	const matchesIdentity = (element: EditorSnapshotElement) =>
		element.testId === source.testId &&
		element.name === source.name &&
		element.role === source.role &&
		element.tagName === source.tagName;
	const refMatch = elements.find((element) => element.ref === source.ref);
	if (refMatch && (!hasSemanticIdentity || matchesIdentity(refMatch))) {
		return refMatch;
	}
	return hasSemanticIdentity
		? elements.find((element) => matchesIdentity(element))
		: undefined;
}

function resolveListDragContext({
	elements,
	fromRef,
	toIndex,
}: {
	elements: EditorSnapshotElement[];
	fromRef: string;
	toIndex: number;
}): ListDragContext {
	let source = elements.find((element) => element.ref === fromRef);
	if (!source) throw new Error(`Snapshot ref not found: ${fromRef}`);
	let siblings: EditorSnapshotElement[] = [];
	const flattenedSource = source;

	while (source && source.parentRef) {
		siblings = visibleSiblings({ elements, parentRef: source.parentRef });
		if (
			siblings.length > toIndex &&
			siblings.some((candidate) => candidate.ref === source!.ref)
		) {
			break;
		}
		if (!source.parentRef) break;
		const parent = elements.find(
			(element) => element.ref === source!.parentRef
		);
		if (!parent) break;
		source = parent;
	}
	if (siblings.length <= toIndex || !siblings.includes(source)) {
		source = flattenedSource;
		siblings = flattenedListSiblings({ elements, source });
	}

	const sourceIndex = siblings.findIndex(
		(candidate) => candidate.ref === source!.ref
	);
	if (sourceIndex < 0 || toIndex < 0 || toIndex >= siblings.length) {
		throw new Error(
			`Cannot resolve list index ${toIndex}; detected ${siblings.length} sibling item(s)`
		);
	}

	const target = siblings[toIndex];
	const verticalSpan =
		Math.max(...siblings.map((item) => item.bounds.y)) -
		Math.min(...siblings.map((item) => item.bounds.y));
	const horizontalSpan =
		Math.max(...siblings.map((item) => item.bounds.x)) -
		Math.min(...siblings.map((item) => item.bounds.x));
	const movingEarlier = toIndex < sourceIndex;
	const destination =
		verticalSpan >= horizontalSpan
			? {
					x: target.bounds.x + target.bounds.width / 2,
					y:
						target.bounds.y +
						target.bounds.height * (movingEarlier ? 0.2 : 0.8),
				}
			: {
					x:
						target.bounds.x + target.bounds.width * (movingEarlier ? 0.2 : 0.8),
					y: target.bounds.y + target.bounds.height / 2,
				};

	return { source, siblings, sourceIndex, destination };
}

async function captureFailureScreenshot(
	client: EditorApiClient
): Promise<unknown | undefined> {
	try {
		return await client.post("/api/claude/screenshot/capture", {
			fileName: `qcut-automation-failure-${Date.now()}.png`,
		});
	} catch {
		return undefined;
	}
}

export async function waitForEditorUi({
	client,
	options,
}: {
	client: EditorApiClient;
	options: UiWaitOptions;
}): Promise<CLIResult> {
	if (!options.ref && !options.text && options.value === undefined) {
		return {
			success: false,
			error: "UI wait requires --ref, --text, or --value",
		};
	}
	if (options.value !== undefined && !options.ref) {
		return {
			success: false,
			error:
				"UI value waits require --ref to avoid matching an unrelated control",
		};
	}
	const startedAt = Date.now();
	const timeoutMs = Math.max(1, options.timeoutMs ?? 5000);
	const intervalMs = Math.max(20, options.intervalMs ?? 100);
	while (Date.now() - startedAt <= timeoutMs) {
		const snapshot = await getEditorSnapshot(client);
		const matched = snapshot.elements.find((element) => {
			if (options.ref && element.ref !== options.ref) return false;
			if (
				options.text &&
				![element.name, element.textPreview]
					.filter((value): value is string => typeof value === "string")
					.some((value) => value.includes(options.text!))
			) {
				return false;
			}
			if (options.value !== undefined && element.value !== options.value) {
				return false;
			}
			return true;
		});
		if (matched) {
			return {
				success: true,
				data: { matched, elapsedMs: Date.now() - startedAt },
			};
		}
		await sleep(intervalMs);
	}
	const screenshot = await captureFailureScreenshot(client);
	return {
		success: false,
		error: `UI wait timed out after ${timeoutMs}ms`,
		data: { screenshot },
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
	let from = buildPointerTarget({
		options: {
			ref: options.fromRef,
			x: options.fromX,
			y: options.fromY,
		},
		label: "Pointer drag start",
	});
	if (!from.ok) return { success: false, error: from.error };

	let listContext: ListDragContext | undefined;
	let to: PointerTargetResult;
	if (options.toIndex !== undefined) {
		if (!options.fromRef) {
			return { success: false, error: "--to-index requires --from-ref" };
		}
		try {
			const snapshot = await getEditorSnapshot(client);
			listContext = resolveListDragContext({
				elements: snapshot.elements,
				fromRef: options.fromRef,
				toIndex: options.toIndex,
			});
			from = { ok: true, target: { ref: listContext.source.ref } };
			to = { ok: true, target: listContext.destination };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	} else {
		to = buildPointerTarget({
			options: {
				ref: options.toRef,
				x: options.toX,
				y: options.toY,
			},
			label: "Pointer drag destination",
		});
		if (!to.ok) return { success: false, error: to.error };
	}

	let via: AgentPointerTarget[] | undefined;
	if (options.via) {
		const parsed = await resolveJsonInput(options.via);
		if (!Array.isArray(parsed)) {
			return { success: false, error: "--via must be a JSON array" };
		}
		via = parsed.map((target, index) => {
			if (typeof target !== "object" || target === null) {
				throw new Error(`--via target ${index} must be an object`);
			}
			return target as AgentPointerTarget;
		});
	}

	const request: AgentPointerDragRequest = {
		from: from.target,
		to: to.target,
		inputMode: pointerInputMode({ options }),
		via,
		holdMs: options.holdMs ?? 120,
		durationMs: options.durationMs ?? 450,
		steps: options.steps ?? 24,
		releaseDelayMs: options.releaseDelayMs ?? 100,
	};
	await requirePointerInputSupport({ client, options });
	const data = await client.post("/api/claude/pointer/drag", request);

	if (
		listContext &&
		options.verify !== false &&
		options.toIndex !== undefined
	) {
		await sleep(120);
		const after = await getEditorSnapshot(client);
		try {
			const sourceAfterDrag = findSnapshotElement({
				elements: after.elements,
				source: listContext.source,
			});
			if (!sourceAfterDrag) {
				throw new Error("dragged item is no longer present in the UI snapshot");
			}
			const verified = resolveListDragContext({
				elements: after.elements,
				fromRef: sourceAfterDrag.ref,
				toIndex: options.toIndex,
			});
			if (verified.sourceIndex !== options.toIndex) {
				const screenshot = await captureFailureScreenshot(client);
				return {
					success: false,
					error: `Drag verification failed: expected index ${options.toIndex}, got ${verified.sourceIndex}`,
					data: { pointer: data, screenshot },
				};
			}
		} catch (error) {
			const screenshot = await captureFailureScreenshot(client);
			return {
				success: false,
				error: `Drag verification failed: ${error instanceof Error ? error.message : String(error)}`,
				data: { pointer: data, screenshot },
			};
		}
	}
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

export async function handleKeyboardCommand({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2];
	await requirePointerInputSupport({ client, options });
	if (action === "press") {
		const keys = options.keys
			?.split(",")
			.map((key) => key.trim())
			.filter(Boolean);
		if (!keys?.length) {
			return { success: false, error: "Keyboard press requires --keys" };
		}
		const data = await client.post("/api/claude/keyboard/press", {
			keys,
			intervalMs: options.intervalMs,
			inputMode: pointerInputMode({ options }),
		});
		return { success: true, data };
	}
	if (action === "type") {
		if (options.text === undefined) {
			return { success: false, error: "Keyboard type requires --text" };
		}
		const data = await client.post("/api/claude/keyboard/type", {
			text: options.text,
			intervalMs: options.intervalMs,
			inputMode: pointerInputMode({ options }),
		});
		return { success: true, data };
	}
	return {
		success: false,
		error: `Unknown keyboard action: ${action ?? ""}. Available: press, type`,
	};
}

function numberValue(
	action: Record<string, unknown>,
	key: string
): number | undefined {
	const value = action[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function stringValue(
	action: Record<string, unknown>,
	key: string
): string | undefined {
	const value = action[key];
	return typeof value === "string" ? value : undefined;
}

async function runSequenceAction({
	client,
	baseOptions,
	action,
}: {
	client: EditorApiClient;
	baseOptions: CLIRunOptions;
	action: Record<string, unknown>;
}): Promise<CLIResult> {
	const name = stringValue(action, "action") ?? stringValue(action, "type");
	if (!name)
		return { success: false, error: "Sequence action is missing 'action'" };
	const foreground =
		typeof action.foreground === "boolean"
			? action.foreground
			: baseOptions.foreground;

	if (
		["move", "hover", "click", "double-click", "right-click"].includes(name)
	) {
		return postTargetAction({
			client,
			options: {
				...baseOptions,
				foreground,
				ref: stringValue(action, "ref"),
				x: numberValue(action, "x"),
				y: numberValue(action, "y"),
			},
			action: name as
				| "move"
				| "hover"
				| "click"
				| "double-click"
				| "right-click",
		});
	}

	if (name === "drag") {
		const from = isRecord(action.from) ? action.from : {};
		const to = isRecord(action.to) ? action.to : {};
		return handleDrag({
			client,
			options: {
				...baseOptions,
				foreground,
				fromRef: stringValue(action, "fromRef") ?? stringValue(from, "ref"),
				fromX: numberValue(action, "fromX") ?? numberValue(from, "x"),
				fromY: numberValue(action, "fromY") ?? numberValue(from, "y"),
				toRef: stringValue(action, "toRef") ?? stringValue(to, "ref"),
				toX: numberValue(action, "toX") ?? numberValue(to, "x"),
				toY: numberValue(action, "toY") ?? numberValue(to, "y"),
				toIndex: numberValue(action, "toIndex"),
				via: Array.isArray(action.via) ? JSON.stringify(action.via) : undefined,
				holdMs: numberValue(action, "holdMs"),
				durationMs: numberValue(action, "durationMs"),
				steps: numberValue(action, "steps"),
				releaseDelayMs: numberValue(action, "releaseDelayMs"),
				verify:
					typeof action.verify === "boolean"
						? action.verify
						: baseOptions.verify,
			},
		});
	}

	if (name === "scroll") {
		return handleScroll({
			client,
			options: {
				...baseOptions,
				foreground,
				ref: stringValue(action, "ref"),
				x: numberValue(action, "x"),
				y: numberValue(action, "y"),
				deltaX: numberValue(action, "deltaX"),
				deltaY: numberValue(action, "deltaY"),
			},
		});
	}

	if (name === "press" || name === "keyboard:press") {
		const keys = Array.isArray(action.keys)
			? action.keys
					.filter((key): key is string => typeof key === "string")
					.join(",")
			: stringValue(action, "keys");
		return handleKeyboardCommand({
			client,
			options: {
				...baseOptions,
				command: "editor:keyboard:press",
				foreground,
				keys,
				intervalMs: numberValue(action, "intervalMs"),
			},
		});
	}

	if (name === "type" || name === "keyboard:type") {
		return handleKeyboardCommand({
			client,
			options: {
				...baseOptions,
				command: "editor:keyboard:type",
				foreground,
				text: stringValue(action, "text"),
				intervalMs: numberValue(action, "intervalMs"),
			},
		});
	}

	if (name === "wait") {
		return waitForEditorUi({
			client,
			options: {
				ref: stringValue(action, "ref"),
				text: stringValue(action, "text"),
				value: stringValue(action, "value"),
				timeoutMs: numberValue(action, "timeoutMs"),
				intervalMs: numberValue(action, "intervalMs"),
			},
		});
	}

	if (name === "sleep") {
		const durationMs = numberValue(action, "durationMs") ?? 0;
		await sleep(Math.max(0, durationMs));
		return { success: true, data: { durationMs } };
	}

	if (name === "snapshot") {
		return { success: true, data: await getEditorSnapshot(client) };
	}

	return { success: false, error: `Unsupported sequence action: ${name}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveRecordingOutputPath({
	requestedPath,
}: {
	requestedPath: string;
}): Promise<string> {
	const path = await import("node:path");
	const extension = path.extname(requestedPath).toLowerCase();
	if (extension && extension !== ".mp4") {
		throw new Error("Pointer sequence recordings must use the .mp4 extension");
	}
	return path.resolve(extension ? requestedPath : `${requestedPath}.mp4`);
}

async function moveRecordingToRequestedPath({
	recording,
	outputPath,
}: {
	recording: unknown;
	outputPath: string;
}): Promise<unknown> {
	if (!isRecord(recording) || typeof recording.filePath !== "string") {
		return recording;
	}
	const path = await import("node:path");
	const fs = await import("node:fs/promises");
	const sourcePath = path.resolve(recording.filePath);
	if (sourcePath === outputPath) return recording;

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.rm(outputPath, { force: true });
	try {
		await fs.rename(sourcePath, outputPath);
	} catch (error) {
		if (!isRecord(error) || error.code !== "EXDEV") throw error;
		await fs.copyFile(sourcePath, outputPath);
		await fs.unlink(sourcePath);
	}
	return { ...recording, filePath: outputPath };
}

async function stopSequenceRecording({
	client,
	outputPath,
}: {
	client: EditorApiClient;
	outputPath: string;
}): Promise<unknown> {
	const recording = await client.post("/api/claude/screen-recording/stop", {});
	return await moveRecordingToRequestedPath({ recording, outputPath });
}

async function handleSequence({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (!options.actions) return { success: false, error: "Missing --actions" };
	const parsed = await resolveJsonInput(options.actions);
	const actions = Array.isArray(parsed)
		? parsed
		: isRecord(parsed) && Array.isArray(parsed.actions)
			? parsed.actions
			: undefined;
	if (!actions)
		return { success: false, error: "--actions must be a JSON array" };

	let recordingStarted = false;
	let recording: unknown;
	let recordingOutputPath: string | undefined;
	if (options.record) {
		const path = await import("node:path");
		recordingOutputPath = await resolveRecordingOutputPath({
			requestedPath: options.record,
		});
		await client.post("/api/claude/screen-recording/start", {
			fileName: path.basename(recordingOutputPath),
		});
		recordingStarted = true;
	}

	const results: Array<{ index: number; action: unknown; result: CLIResult }> =
		[];
	let activeRef: string | undefined;
	try {
		for (const [index, action] of actions.entries()) {
			if (!isRecord(action)) {
				throw new Error(`Action ${index} must be an object`);
			}
			const actionName =
				stringValue(action, "action") ?? stringValue(action, "type");
			const contextualAction =
				actionName === "wait" &&
				typeof action.value === "string" &&
				typeof action.ref !== "string" &&
				activeRef
					? { ...action, ref: activeRef }
					: action;
			const result = await runSequenceAction({
				client,
				baseOptions: options,
				action: contextualAction,
			});
			results.push({ index, action: action.action ?? action.type, result });
			if (!result.success) {
				throw new Error(result.error || `Action ${index} failed`);
			}
			if (
				["click", "double-click", "right-click"].includes(actionName ?? "") &&
				typeof action.ref === "string"
			) {
				activeRef = action.ref;
			}
		}
	} catch (error) {
		const screenshot = await captureFailureScreenshot(client);
		if (recordingStarted && recordingOutputPath) {
			try {
				recording = await stopSequenceRecording({
					client,
					outputPath: recordingOutputPath,
				});
			} catch {
				// Preserve the action failure.
			}
		}
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			data: { results, screenshot, recording },
		};
	}

	if (recordingStarted && recordingOutputPath) {
		recording = await stopSequenceRecording({
			client,
			outputPath: recordingOutputPath,
		});
	}
	return {
		success: true,
		data: { actionCount: actions.length, results, recording },
	};
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
		case "sequence":
			return await handleSequence({ client, options });
		case "scroll":
			return await handleScroll({ client, options });
		case "hide": {
			const data = await client.post("/api/claude/pointer/hide", {});
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown pointer action: ${action ?? ""}. Available: move, hover, click, double-click, right-click, drag, scroll, sequence, hide`,
			};
	}
}

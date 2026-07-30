import type {
	AgentPointerDragRequest,
	AgentPointerScrollRequest,
	AgentPointerTarget,
	EditorSnapshotElement,
	EditorSnapshotResponse,
	EditorSnapshotResult,
} from "../../types/claude-api.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import { resolveJsonInput } from "../editor/editor-api-types.js";
import { ensureEditorPreviewReady } from "../editor/editor-preview-readiness.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

interface PointerTargetOptions {
	target?: string;
	ref?: string;
	x?: number;
	y?: number;
	normalizedX?: number;
	normalizedY?: number;
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

const SEMANTIC_TARGET_TEST_IDS: Record<string, string[]> = {
	"panel.media": ["media-panel-tab"],
	"panel.audio": ["audio-panel-tab"],
	"panel.text": ["text-panel-tab"],
	"panel.stickers": ["stickers-panel-tab"],
	"panel.effects": ["effects-panel-tab"],
	"panel.transitions": ["transitions-panel-tab"],
	"panel.captions": ["captions-panel-tab"],
	"panel.filters": ["filters-panel-tab"],
	"panel.adjustments": ["adjustments-panel-tab"],
	"panel.templates": ["templates-panel-tab"],
	"export.button": ["export-button", "export-start-button"],
	"export.start": ["export-start-button"],
	"timeline.playhead": ["timeline-playhead"],
	"timeline.toolbar": ["timeline-toolbar"],
	"timeline.zoom-in": ["zoom-in-button"],
	"timeline.zoom-out": ["zoom-out-button"],
	"timeline.play": ["timeline-play-button", "preview-play-button"],
	"timeline.pause": ["timeline-pause-button", "preview-pause-button"],
	"preview.canvas": ["preview-canvas", "preview-panel"],
	"media.import": ["import-media-button"],
	"text.add": ["text-overlay-button"],
	"text.content": ["text-content-input"],
	"text.font-size": ["text-font-size-input"],
	"text.animation": ["text-animation-group-toggle"],
	"text.animation.entrance": ["text-animation-phase-entrance"],
	"text.animation.loop": ["text-animation-phase-loop"],
	"text.animation.exit": ["text-animation-phase-exit"],
};

const TEXT_ANIMATION_PRESET_TARGET =
	/^text\.animation\.(entrance|loop|exit)\.([a-z0-9-]+)$/;

function isSemanticTarget({ target }: { target: string }): boolean {
	return (
		Boolean(SEMANTIC_TARGET_TEST_IDS[target]) ||
		target.startsWith("testid:") ||
		TEXT_ANIMATION_PRESET_TARGET.test(target)
	);
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

function buildCoordinateTarget({
	options,
	label,
}: {
	options: PointerTargetOptions;
	label: string;
}): PointerTargetResult {
	const ref = options.ref?.trim();
	const semanticTarget = options.target?.trim();
	const hasX = typeof options.x === "number" && Number.isFinite(options.x);
	const hasY = typeof options.y === "number" && Number.isFinite(options.y);
	const hasAnyCoordinate = options.x !== undefined || options.y !== undefined;
	const hasAnyNormalizedCoordinate =
		options.normalizedX !== undefined || options.normalizedY !== undefined;
	if (
		[
			Boolean(ref),
			Boolean(semanticTarget),
			hasAnyCoordinate,
			hasAnyNormalizedCoordinate,
		].filter(Boolean).length > 1
	) {
		return {
			ok: false,
			error: `${label} accepts either --ref or coordinates/semantic target, not both`,
		};
	}
	if (semanticTarget) {
		return {
			ok: false,
			error: `${label} semantic target '${semanticTarget}' must be resolved from the editor snapshot`,
		};
	}
	if (ref) return { ok: true, target: { ref } };
	if (hasX && hasY) {
		return { ok: true, target: { x: options.x, y: options.y } };
	}

	return {
		ok: false,
		error: `${label} requires --target, --ref, both --x and --y, or both normalized coordinates`,
	};
}

async function getEditorSnapshot(
	client: EditorApiClient
): Promise<EditorSnapshotResult> {
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

function findSemanticTarget({
	snapshot,
	target,
}: {
	snapshot: EditorSnapshotResult;
	target: string;
}): EditorSnapshotElement | undefined {
	const normalized = target.trim();
	const explicitTestId = normalized.startsWith("testid:")
		? normalized.slice("testid:".length)
		: undefined;
	const animationPreset = normalized.match(TEXT_ANIMATION_PRESET_TARGET);
	const testIds = explicitTestId
		? [explicitTestId]
		: animationPreset
			? [`text-animation-card-${animationPreset[1]}-${animationPreset[2]}`]
			: (SEMANTIC_TARGET_TEST_IDS[normalized] ?? [normalized]);
	return snapshot.elements.find(
		(element) =>
			element.bounds.width > 0 &&
			element.bounds.height > 0 &&
			element.testId !== null &&
			testIds.includes(element.testId)
	);
}

async function waitForSemanticTarget({
	client,
	target,
	timeoutMs = 5000,
	intervalMs = 100,
}: {
	client: EditorApiClient;
	target: string;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<EditorSnapshotElement> {
	const startedAt = Date.now();
	while (Date.now() - startedAt <= Math.max(1, timeoutMs)) {
		const snapshot = await getEditorSnapshot(client);
		const matched = findSemanticTarget({ snapshot, target });
		if (matched) return matched;
		await sleep(Math.max(20, intervalMs));
	}
	const supported = Object.keys(SEMANTIC_TARGET_TEST_IDS).join(", ");
	throw new Error(
		`Semantic target '${target}' did not appear within ${timeoutMs}ms. Supported targets: ${supported}; custom test IDs use testid:<id>.`
	);
}

async function resolvePointerTarget({
	client,
	options,
	label,
	timeoutMs,
}: {
	client: EditorApiClient;
	options: PointerTargetOptions;
	label: string;
	timeoutMs?: number;
}): Promise<PointerTargetResult> {
	const semanticTarget = options.target?.trim();
	const ref = options.ref?.trim();
	const hasCoordinates = options.x !== undefined || options.y !== undefined;
	const hasNormalized =
		options.normalizedX !== undefined || options.normalizedY !== undefined;
	if (
		[
			Boolean(semanticTarget),
			Boolean(ref),
			hasCoordinates,
			hasNormalized,
		].filter(Boolean).length > 1
	) {
		return {
			ok: false,
			error: `${label} accepts either --ref or coordinates/semantic target, not both`,
		};
	}
	if (semanticTarget) {
		try {
			const element = await waitForSemanticTarget({
				client,
				target: semanticTarget,
				timeoutMs,
			});
			return { ok: true, target: { ref: element.ref } };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
	if (hasNormalized) {
		const x = options.normalizedX;
		const y = options.normalizedY;
		if (
			typeof x !== "number" ||
			!Number.isFinite(x) ||
			typeof y !== "number" ||
			!Number.isFinite(y) ||
			x < 0 ||
			x > 1 ||
			y < 0 ||
			y > 1
		) {
			return {
				ok: false,
				error: `${label} normalized coordinates must include X and Y values from 0 to 1`,
			};
		}
		const snapshot = await getEditorSnapshot(client);
		if (!snapshot.viewport?.width || !snapshot.viewport.height) {
			return {
				ok: false,
				error:
					"The running QCut instance does not report viewport dimensions; update QCut or use --x/--y.",
			};
		}
		return {
			ok: true,
			target: {
				x: Math.min(
					snapshot.viewport.width - 1,
					Math.max(0, Math.round(x * snapshot.viewport.width))
				),
				y: Math.min(
					snapshot.viewport.height - 1,
					Math.max(0, Math.round(y * snapshot.viewport.height))
				),
			},
		};
	}
	return buildCoordinateTarget({ options, label });
}

function speedMultiplier(options: Pick<CLIRunOptions, "speed">): number {
	const speed = options.speed ?? 1;
	if (!Number.isFinite(speed) || speed <= 0) {
		throw new Error("--speed must be greater than 0");
	}
	return speed;
}

function scaledDuration(
	durationMs: number | undefined,
	speed: number,
	fallback: number
): number {
	return Math.max(0, (durationMs ?? fallback) / speed);
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

async function waitForRequestedState({
	client,
	value,
	timeoutMs,
	intervalMs,
	projectId,
}: {
	client: EditorApiClient;
	value: string;
	timeoutMs?: number;
	intervalMs?: number;
	projectId?: string;
}): Promise<CLIResult> {
	if (value === "preview.ready" || value === "preview.frame-ready") {
		try {
			const readiness = await ensureEditorPreviewReady({
				client,
				projectId,
				timeoutMs,
				intervalMs,
			});
			return { success: true, data: readiness };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
	if (isSemanticTarget({ target: value })) {
		try {
			const matched = await waitForSemanticTarget({
				client,
				target: value,
				timeoutMs,
				intervalMs,
			});
			return { success: true, data: { matched } };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
	return await waitForEditorUi({
		client,
		options: { text: value, timeoutMs, intervalMs },
	});
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
	const target = await resolvePointerTarget({
		client,
		options: {
			target: options.target,
			ref: options.ref,
			x: options.x,
			y: options.y,
			normalizedX: options.normalizedX,
			normalizedY: options.normalizedY,
		},
		label: `Pointer ${action}`,
		timeoutMs: options.timeoutMs,
	});
	if (!target.ok) return { success: false, error: target.error };

	await requirePointerInputSupport({ client, options });
	const speed = speedMultiplier(options);
	const data = await client.post(`/api/claude/pointer/${action}`, {
		...target.target,
		inputMode: pointerInputMode({ options }),
		...(options.speed !== undefined || options.durationMs !== undefined
			? { durationMs: scaledDuration(options.durationMs, speed, 220) }
			: {}),
	});
	if (options.waitFor) {
		const waited = await waitForRequestedState({
			client,
			value: options.waitFor,
			timeoutMs: options.timeoutMs,
			intervalMs: options.intervalMs,
			projectId: options.projectId,
		});
		if (!waited.success) return waited;
	}
	return { success: true, data };
}

async function materializeTargetPoint({
	client,
	target,
}: {
	client: EditorApiClient;
	target: AgentPointerTarget;
}): Promise<{ x: number; y: number }> {
	if (
		typeof target.x === "number" &&
		Number.isFinite(target.x) &&
		typeof target.y === "number" &&
		Number.isFinite(target.y)
	) {
		return { x: target.x, y: target.y };
	}
	if (target.ref) {
		const snapshot = await getEditorSnapshot(client);
		const element = snapshot.elements.find(
			(candidate) => candidate.ref === target.ref
		);
		if (!element) throw new Error(`Snapshot ref not found: ${target.ref}`);
		return {
			x: element.bounds.x + element.bounds.width / 2,
			y: element.bounds.y + element.bounds.height / 2,
		};
	}
	throw new Error("Pointer target does not contain coordinates or a ref");
}

async function handleSemanticTimelineSeek({
	client,
	options,
	from,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	from: AgentPointerTarget;
}): Promise<CLIResult> {
	if (
		typeof options.toTime !== "number" ||
		!Number.isFinite(options.toTime) ||
		options.toTime < 0
	) {
		return { success: false, error: "--to-time must be a number >= 0" };
	}
	const navigator = await client.get<{ activeProjectId?: string | null }>(
		"/api/claude/navigator/projects"
	);
	const projectId = options.projectId ?? navigator.activeProjectId ?? undefined;
	if (!projectId) {
		return {
			success: false,
			error: "No active project; pass --project-id for --to-time",
		};
	}
	const speed = speedMultiplier(options);
	const fromPoint = await materializeTargetPoint({ client, target: from });
	const operation = await client.post(
		`/api/claude/timeline/${encodeURIComponent(projectId)}/playback`,
		{ action: "seek", time: options.toTime }
	);
	await sleep(Math.max(20, 120 / speed));
	const playhead = await waitForSemanticTarget({
		client,
		target: "timeline.playhead",
		timeoutMs: options.timeoutMs,
	});
	const toPoint = {
		x: playhead.bounds.x + playhead.bounds.width / 2,
		y: playhead.bounds.y + playhead.bounds.height / 2,
	};
	await requirePointerInputSupport({ client, options });
	const inputMode = pointerInputMode({ options });
	const animationStart = await client.post("/api/claude/pointer/move", {
		...fromPoint,
		inputMode,
		durationMs: scaledDuration(undefined, speed, 120),
	});
	const animationEnd = await client.post("/api/claude/pointer/move", {
		...toPoint,
		inputMode,
		durationMs: scaledDuration(options.durationMs, speed, 450),
	});
	return {
		success: true,
		data: {
			projectId,
			time: options.toTime,
			operation,
			animation: {
				type: "display-only",
				from: fromPoint,
				to: toPoint,
				start: animationStart,
				end: animationEnd,
			},
		},
	};
}

async function handleDrag({
	client,
	options,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
}): Promise<CLIResult> {
	if (options.waitFor) {
		const waited = await waitForRequestedState({
			client,
			value: options.waitFor,
			timeoutMs: options.timeoutMs,
			intervalMs: options.intervalMs,
			projectId: options.projectId,
		});
		if (!waited.success) return waited;
	}
	let from = await resolvePointerTarget({
		client,
		options: {
			target: options.from,
			ref: options.fromRef,
			x: options.fromX,
			y: options.fromY,
			normalizedX: options.fromNormalizedX,
			normalizedY: options.fromNormalizedY,
		},
		label: "Pointer drag start",
		timeoutMs: options.timeoutMs,
	});
	if (!from.ok) return { success: false, error: from.error };
	if (options.toTime !== undefined) {
		return await handleSemanticTimelineSeek({
			client,
			options,
			from: from.target,
		});
	}

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
		to = await resolvePointerTarget({
			client,
			options: {
				target: options.to,
				ref: options.toRef,
				x: options.toX,
				y: options.toY,
				normalizedX: options.toNormalizedX,
				normalizedY: options.toNormalizedY,
			},
			label: "Pointer drag destination",
			timeoutMs: options.timeoutMs,
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

	const speed = speedMultiplier(options);
	const request: AgentPointerDragRequest = {
		from: from.target,
		to: to.target,
		inputMode: pointerInputMode({ options }),
		via,
		holdMs: scaledDuration(options.holdMs, speed, 120),
		durationMs: scaledDuration(options.durationMs, speed, 450),
		steps: options.steps ?? 24,
		releaseDelayMs: scaledDuration(options.releaseDelayMs, speed, 100),
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
		options.target !== undefined ||
		options.ref !== undefined ||
		options.x !== undefined ||
		options.y !== undefined ||
		options.normalizedX !== undefined ||
		options.normalizedY !== undefined;
	if (hasTargetOption) {
		const target = await resolvePointerTarget({
			client,
			options: {
				target: options.target,
				ref: options.ref,
				x: options.x,
				y: options.y,
				normalizedX: options.normalizedX,
				normalizedY: options.normalizedY,
			},
			label: "Pointer scroll target",
			timeoutMs: options.timeoutMs,
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
	const speed = numberValue(action, "speed") ?? speedMultiplier(baseOptions);
	if (!Number.isFinite(speed) || speed <= 0) {
		return { success: false, error: "Sequence action speed must be > 0" };
	}
	const actionOptions: CLIRunOptions = {
		...baseOptions,
		foreground,
		speed,
		waitFor: stringValue(action, "waitFor"),
		timeoutMs: numberValue(action, "timeoutMs") ?? baseOptions.timeoutMs,
	};

	if (
		["move", "hover", "click", "double-click", "right-click"].includes(name)
	) {
		return postTargetAction({
			client,
			options: {
				...actionOptions,
				target: stringValue(action, "target"),
				ref: stringValue(action, "ref"),
				x: numberValue(action, "x"),
				y: numberValue(action, "y"),
				normalizedX: numberValue(action, "normalizedX"),
				normalizedY: numberValue(action, "normalizedY"),
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
				...actionOptions,
				from:
					stringValue(action, "fromTarget") ??
					stringValue(action, "from") ??
					stringValue(from, "target"),
				fromRef: stringValue(action, "fromRef") ?? stringValue(from, "ref"),
				fromX: numberValue(action, "fromX") ?? numberValue(from, "x"),
				fromY: numberValue(action, "fromY") ?? numberValue(from, "y"),
				fromNormalizedX:
					numberValue(action, "fromNormalizedX") ??
					numberValue(from, "normalizedX"),
				fromNormalizedY:
					numberValue(action, "fromNormalizedY") ??
					numberValue(from, "normalizedY"),
				to:
					stringValue(action, "toTarget") ??
					stringValue(action, "to") ??
					stringValue(to, "target"),
				toRef: stringValue(action, "toRef") ?? stringValue(to, "ref"),
				toX: numberValue(action, "toX") ?? numberValue(to, "x"),
				toY: numberValue(action, "toY") ?? numberValue(to, "y"),
				toNormalizedX:
					numberValue(action, "toNormalizedX") ??
					numberValue(to, "normalizedX"),
				toNormalizedY:
					numberValue(action, "toNormalizedY") ??
					numberValue(to, "normalizedY"),
				toTime: numberValue(action, "toTime"),
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
				...actionOptions,
				target: stringValue(action, "target"),
				ref: stringValue(action, "ref"),
				x: numberValue(action, "x"),
				y: numberValue(action, "y"),
				normalizedX: numberValue(action, "normalizedX"),
				normalizedY: numberValue(action, "normalizedY"),
				deltaX: numberValue(action, "deltaX"),
				deltaY: numberValue(action, "deltaY"),
			},
		});
	}

	if (name === "hide") {
		const data = await client.post("/api/claude/pointer/hide", {});
		return { success: true, data };
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
				...actionOptions,
				command: "editor:keyboard:press",
				keys,
				intervalMs: (numberValue(action, "intervalMs") ?? 45) / speed,
			},
		});
	}

	if (name === "type" || name === "keyboard:type") {
		return handleKeyboardCommand({
			client,
			options: {
				...actionOptions,
				command: "editor:keyboard:type",
				text: stringValue(action, "text"),
				intervalMs:
					numberValue(action, "intervalMs") === undefined
						? undefined
						: numberValue(action, "intervalMs")! / speed,
			},
		});
	}

	if (name === "wait") {
		const semanticTarget = stringValue(action, "target");
		if (semanticTarget) {
			return await waitForRequestedState({
				client,
				value: semanticTarget,
				timeoutMs: numberValue(action, "timeoutMs"),
				intervalMs: numberValue(action, "intervalMs"),
				projectId: stringValue(action, "projectId") ?? baseOptions.projectId,
			});
		}
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
		const scaledMs = Math.max(0, durationMs / speed);
		await sleep(scaledMs);
		return { success: true, data: { durationMs: scaledMs } };
	}

	if (name === "seek" || name === "timeline:seek") {
		const time = numberValue(action, "time");
		if (time === undefined || time < 0) {
			return { success: false, error: "Seek action requires time >= 0" };
		}
		const navigator = await client.get<{ activeProjectId?: string | null }>(
			"/api/claude/navigator/projects"
		);
		const projectId =
			stringValue(action, "projectId") ??
			baseOptions.projectId ??
			navigator.activeProjectId ??
			undefined;
		if (!projectId) {
			return { success: false, error: "Seek action has no active project" };
		}
		const data = await client.post(
			`/api/claude/timeline/${encodeURIComponent(projectId)}/playback`,
			{ action: "seek", time }
		);
		return { success: true, data: { projectId, time, operation: data } };
	}

	if (name === "switch-panel") {
		const panel = stringValue(action, "panel");
		if (!panel) {
			return { success: false, error: "switch-panel requires panel" };
		}
		const data = await client.post("/api/claude/ui/switch-panel", {
			panel,
			...(stringValue(action, "tab")
				? { tab: stringValue(action, "tab") }
				: {}),
		});
		return { success: true, data };
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

async function writePointerEventTrack({
	requestedPath,
	captureStartedAt,
	sequenceStartedAt,
	endedAt,
	prerollMs,
	postrollMs,
	speed,
	skipIdle,
	events,
}: {
	requestedPath: string;
	captureStartedAt: number;
	sequenceStartedAt: number;
	endedAt: number;
	prerollMs: number;
	postrollMs: number;
	speed: number;
	skipIdle: boolean;
	events: Array<Record<string, unknown>>;
}): Promise<string> {
	const path = await import("node:path");
	const fs = await import("node:fs/promises");
	const outputPath = path.resolve(requestedPath);
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(
		outputPath,
		JSON.stringify(
			{
				version: 2,
				kind: "qcut-pointer-event-track",
				startedAt: new Date(captureStartedAt).toISOString(),
				sequenceStartedAt: new Date(sequenceStartedAt).toISOString(),
				durationMs: Math.max(0, endedAt - captureStartedAt),
				prerollMs,
				postrollMs,
				speed,
				skipIdle,
				events,
			},
			null,
			2
		),
		"utf8"
	);
	return outputPath;
}

export async function runPointerSequence({
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
	let recordingStart: unknown;
	let recording: unknown;
	let recordingOutputPath: string | undefined;
	let captureStartedAt: number | undefined;
	let appliedPrerollMs = 0;
	let appliedPostrollMs = 0;
	if (options.record) {
		const path = await import("node:path");
		recordingOutputPath = await resolveRecordingOutputPath({
			requestedPath: options.record,
		});
		recordingStart = await client.post("/api/claude/screen-recording/start", {
			fileName: path.basename(recordingOutputPath),
			captureMode: "editor",
			recordingQuality: options.recordingQuality ?? "native",
		});
		recordingStarted = true;
		if (isRecord(recordingStart)) {
			captureStartedAt =
				numberValue(recordingStart, "captureStartedAt") ??
				numberValue(recordingStart, "startedAt");
		}
		appliedPrerollMs = Math.max(0, options.prerollMs ?? 0);
		if (appliedPrerollMs > 0) await sleep(appliedPrerollMs);
	}

	const results: Array<{ index: number; action: unknown; result: CLIResult }> =
		[];
	const events: Array<Record<string, unknown>> = [];
	const sequenceStartedAt = Date.now();
	const eventTrackStartedAt = captureStartedAt ?? sequenceStartedAt;
	const speed = speedMultiplier(options);
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
			const actionStartedAt = Date.now();
			const skipped =
				options.skipIdle === true &&
				(actionName === "sleep" || action.idle === true);
			const result = skipped
				? {
						success: true,
						data: { skipped: true, reason: "skip-idle" },
					}
				: await runSequenceAction({
						client,
						baseOptions: { ...options, speed },
						action: contextualAction,
					});
			results.push({ index, action: action.action ?? action.type, result });
			events.push({
				index,
				action: actionName,
				startMs: actionStartedAt - eventTrackStartedAt,
				endMs: Date.now() - eventTrackStartedAt,
				durationMs: Date.now() - actionStartedAt,
				skipped,
				target: action.target,
				from: action.from ?? action.fromTarget,
				to: action.to ?? action.toTarget,
				toTime: action.toTime,
				success: result.success,
				result: result.data,
			});
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
		const captureEndedAt = Date.now();
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
		let eventTrack: string | undefined;
		if (options.eventTrack) {
			try {
				eventTrack = await writePointerEventTrack({
					requestedPath: options.eventTrack,
					captureStartedAt: eventTrackStartedAt,
					sequenceStartedAt,
					endedAt: captureEndedAt,
					prerollMs: appliedPrerollMs,
					postrollMs: 0,
					speed,
					skipIdle: options.skipIdle === true,
					events,
				});
			} catch {
				// Preserve the action failure.
			}
		}
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			data: {
				results,
				screenshot,
				recording,
				eventTrack,
				capture: {
					start: recordingStart,
					captureStartedAt: eventTrackStartedAt,
					sequenceStartedAt,
					endedAt: captureEndedAt,
					expectedDurationMs: Math.max(0, captureEndedAt - eventTrackStartedAt),
					prerollMs: appliedPrerollMs,
					postrollMs: 0,
				},
			},
		};
	}

	if (recordingStarted) {
		appliedPostrollMs = Math.max(0, options.postrollMs ?? 0);
		if (appliedPostrollMs > 0) await sleep(appliedPostrollMs);
	}
	const captureEndedAt = Date.now();
	if (recordingStarted && recordingOutputPath) {
		recording = await stopSequenceRecording({
			client,
			outputPath: recordingOutputPath,
		});
	}
	const eventTrack = options.eventTrack
		? await writePointerEventTrack({
				requestedPath: options.eventTrack,
				captureStartedAt: eventTrackStartedAt,
				sequenceStartedAt,
				endedAt: captureEndedAt,
				prerollMs: appliedPrerollMs,
				postrollMs: appliedPostrollMs,
				speed,
				skipIdle: options.skipIdle === true,
				events,
			})
		: undefined;
	return {
		success: true,
		data: {
			actionCount: actions.length,
			executedActionCount: events.filter((event) => event.skipped !== true)
				.length,
			results,
			capture: {
				start: recordingStart,
				captureStartedAt: eventTrackStartedAt,
				sequenceStartedAt,
				endedAt: captureEndedAt,
				expectedDurationMs: Math.max(0, captureEndedAt - eventTrackStartedAt),
				prerollMs: appliedPrerollMs,
				postrollMs: appliedPostrollMs,
			},
			recording,
			eventTrack,
		},
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
			return await runPointerSequence({ client, options });
		case "wait-for": {
			const requested = options.target ?? options.text;
			if (!requested) {
				return {
					success: false,
					error: "Pointer wait-for requires --target or --text",
				};
			}
			return await waitForRequestedState({
				client,
				value: requested,
				timeoutMs: options.timeoutMs,
				intervalMs: options.intervalMs,
				projectId: options.projectId,
			});
		}
		case "scroll":
			return await handleScroll({ client, options });
		case "hide": {
			const data = await client.post("/api/claude/pointer/hide", {});
			return { success: true, data };
		}
		default:
			return {
				success: false,
				error: `Unknown pointer action: ${action ?? ""}. Available: move, hover, click, double-click, right-click, drag, scroll, wait-for, sequence, hide`,
			};
	}
}

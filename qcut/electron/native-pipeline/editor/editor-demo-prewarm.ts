import type { EditorStateSnapshot } from "../../types/claude-api.js";
import type { EditorApiClient } from "./editor-api-client.js";
import { ensureEditorPreviewReady } from "./editor-preview-readiness.js";

type JsonRecord = Record<string, unknown>;

const sleep = (durationMs: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, durationMs));

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue({
	record,
	key,
}: {
	record: JsonRecord;
	key: string;
}): string | undefined {
	return typeof record[key] === "string" ? record[key] : undefined;
}

export function collectDemoPrewarmPanels({
	actions,
}: {
	actions: unknown[];
}): string[] {
	const panels = new Set<string>();
	for (const action of actions) {
		if (!isRecord(action)) continue;
		const actionName =
			stringValue({ record: action, key: "action" }) ??
			stringValue({ record: action, key: "type" });
		if (actionName === "switch-panel") {
			const panel = stringValue({ record: action, key: "panel" });
			if (panel) panels.add(panel);
		}
		const target = stringValue({ record: action, key: "target" });
		if (target?.startsWith("panel.")) {
			panels.add(target.slice("panel.".length));
		}
	}
	return [...panels];
}

async function settleActivePanel({
	client,
	settleMs,
}: {
	client: EditorApiClient;
	settleMs: number;
}): Promise<void> {
	if (settleMs > 0) await sleep(settleMs);
	await client.get("/api/claude/snapshot", {
		interactive: "true",
		depth: "8",
		maxNodes: "2000",
		maxBytes: String(512 * 1024),
	});
}

async function currentPlayheadTime({
	client,
}: {
	client: EditorApiClient;
}): Promise<number | undefined> {
	const snapshot = await client.get<EditorStateSnapshot>("/api/claude/state", {
		include: "playhead,editor,project",
	});
	return snapshot.state.timeline?.playhead?.currentTime;
}

export async function prewarmEditorDemo({
	client,
	projectId,
	actions,
	startTime = 0,
	timeoutMs = 15_000,
	panelSettleMs = 120,
}: {
	client: EditorApiClient;
	projectId: string;
	actions: unknown[];
	startTime?: number;
	timeoutMs?: number;
	panelSettleMs?: number;
}): Promise<{
	elapsedMs: number;
	panels: string[];
	startTime: number;
	preview: Awaited<ReturnType<typeof ensureEditorPreviewReady>>;
}> {
	const startedAt = Date.now();
	const panels = collectDemoPrewarmPanels({ actions });

	for (const panel of panels) {
		await client.post("/api/claude/ui/switch-panel", { panel });
		await settleActivePanel({ client, settleMs: panelSettleMs });
	}

	if (panels.length > 0) {
		await client.post("/api/claude/ui/switch-panel", { panel: panels[0] });
		await settleActivePanel({ client, settleMs: panelSettleMs });
	}
	await client.post("/api/claude/pointer/hide", {});

	const normalizedStartTime = Math.max(0, startTime);
	const playheadTime = await currentPlayheadTime({ client });
	const seekChangesFrame =
		playheadTime === undefined ||
		Math.abs(playheadTime - normalizedStartTime) > 1 / 120;
	const frameRequestedAt = Date.now();
	await client.post(
		`/api/claude/timeline/${encodeURIComponent(projectId)}/playback`,
		{ action: "seek", time: normalizedStartTime }
	);
	const preview = await ensureEditorPreviewReady({
		client,
		projectId,
		afterTimestamp: seekChangesFrame ? frameRequestedAt : undefined,
		timeoutMs,
	});

	return {
		elapsedMs: Date.now() - startedAt,
		panels,
		startTime: normalizedStartTime,
		preview,
	};
}

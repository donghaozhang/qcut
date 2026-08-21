#!/usr/bin/env bun
/**
 * Playback diagnostics CLI.
 *
 * Drives the running QCut editor through the Claude HTTP API, samples the
 * renderer's playback diagnostics collector while a clip plays, and prints
 * a stutter report: master-clock health, main-thread long tasks, media
 * element churn (seeks / stalls / source reloads), dropped frames, and
 * preview re-render counts.
 *
 * Usage:
 *   bun scripts/playback-diagnose.ts --project <id> [--from 0] [--seconds 12]
 *
 * Auth: pass --token or set QCUT_API_TOKEN when the app was launched with one.
 */

const BASE_URL = process.env.QCUT_API_URL ?? "http://127.0.0.1:8765";

interface CliArgs {
	project: string | null;
	from: number;
	seconds: number;
	token: string | null;
	json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		project: null,
		from: 0,
		seconds: 12,
		token: process.env.QCUT_API_TOKEN ?? null,
		json: false,
	};
	for (let index = 0; index < argv.length; index++) {
		const value = argv[index];
		if (value === "--project") args.project = argv[++index] ?? null;
		else if (value === "--from") args.from = Number(argv[++index] ?? 0);
		else if (value === "--seconds") args.seconds = Number(argv[++index] ?? 12);
		else if (value === "--token") args.token = argv[++index] ?? null;
		else if (value === "--json") args.json = true;
	}
	return args;
}

async function api(
	path: string,
	init: RequestInit = {},
	token: string | null = null
): Promise<any> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(init.headers as Record<string, string> | undefined),
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
	const body = (await response.json()) as {
		success: boolean;
		data?: unknown;
		error?: string;
	};
	if (!body.success) {
		throw new Error(`${path} failed: ${body.error ?? response.status}`);
	}
	return body.data;
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
	);
	return sorted[index];
}

function ms(value: number): string {
	return `${value.toFixed(1)}ms`;
}

interface Snapshot {
	installed: boolean;
	now: number;
	clockIntervalsMs: number[];
	longTasks: { at: number; durationMs: number }[];
	longTaskTotalCount: number;
	longTaskTotalDurationMs: number;
	mediaEvents: { at: number; type: string; videoId: string; src: string }[];
	previewRenderTimestamps: number[];
	previewRenderTotalCount: number;
	presentedFrames: { at: number; videoId: string; intervalMs: number | null }[];
	videos: {
		videoId: string;
		srcKind: string;
		readyState: number;
		paused: boolean;
		currentTime: number;
		droppedVideoFrames: number | null;
		totalVideoFrames: number | null;
	}[];
	smoothTimeReason: string | null;
	playbackStore: {
		isPlaying: boolean;
		currentTime: number;
		previewQuality: string;
		runtimePreviewQuality: string | null;
		runtimeDiagnosticReason: string | null;
	} | null;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	const health = await api("/api/claude/health", {}, args.token);
	console.log(
		`■ App ${health.appVersion} healthy (uptime ${Math.round(health.uptime)}s)`
	);

	const projectId =
		args.project ??
		(() => {
			throw new Error(
				"Pass --project <id> (see the editor URL or /api/claude/navigator/projects)"
			);
		})();

	// Baseline video stats before the run (dropped/total are cumulative).
	const before = (await api(
		"/api/claude/playback/diagnostics",
		{},
		args.token
	)) as Snapshot;
	if (!before.installed) {
		throw new Error(
			"Diagnostics collector not installed — is the editor open on a project?"
		);
	}
	const beforeVideoStats = new Map(
		before.videos.map((video) => [`${video.videoId}:${video.srcKind}`, video])
	);

	await api(
		"/api/claude/playback/diagnostics/reset",
		{ method: "POST", body: "{}" },
		args.token
	);
	await api(
		`/api/claude/timeline/${projectId}/playback`,
		{
			method: "POST",
			body: JSON.stringify({ action: "seek", time: args.from }),
		},
		args.token
	);
	await new Promise((resolve) => setTimeout(resolve, 800));
	const playStartedAt = Date.now();
	await api(
		`/api/claude/timeline/${projectId}/playback`,
		{ method: "POST", body: JSON.stringify({ action: "play" }) },
		args.token
	);
	console.log(
		`■ Playing project ${projectId} from ${args.from}s for ${args.seconds}s…`
	);
	await new Promise((resolve) => setTimeout(resolve, args.seconds * 1000));

	const snapshot = (await api(
		"/api/claude/playback/diagnostics",
		{},
		args.token
	)) as Snapshot;

	await api(
		`/api/claude/timeline/${projectId}/playback`,
		{ method: "POST", body: JSON.stringify({ action: "pause" }) },
		args.token
	);

	if (args.json) {
		console.log(JSON.stringify(snapshot, null, 1));
		return;
	}

	const runWallMs = Date.now() - playStartedAt;
	const runStartPerfTime = snapshot.now - runWallMs;
	const rel = (at: number) => `${((at - runStartPerfTime) / 1000).toFixed(2)}s`;

	console.log("\n━━━ 主时钟 (playback-update 间隔) ━━━");
	const clock = [...snapshot.clockIntervalsMs].sort((a, b) => a - b);
	if (clock.length === 0) {
		console.log("  没有采到时钟节拍 — 播放没有启动？");
	} else {
		const mean = clock.reduce((sum, value) => sum + value, 0) / clock.length;
		const over50 = clock.filter((value) => value >= 50);
		console.log(
			`  ticks=${clock.length} mean=${ms(mean)} p50=${ms(percentile(clock, 50))} p95=${ms(percentile(clock, 95))} p99=${ms(percentile(clock, 99))} max=${ms(clock[clock.length - 1])}`
		);
		console.log(
			`  ≥50ms 停顿: ${over50.length} 次 ${over50.length > 0 ? "← 主线程被阻塞的帧" : "(无)"}`
		);
	}

	console.log("\n━━━ 主线程长任务 (>50ms longtask) ━━━");
	if (snapshot.longTasks.length === 0) {
		console.log("  无长任务 ✓");
	} else {
		const total =
			snapshot.longTaskTotalDurationMs ??
			snapshot.longTasks.reduce((sum, task) => sum + task.durationMs, 0);
		console.log(
			`  ${snapshot.longTaskTotalCount} 个, 合计 ${ms(total)} (占播放时长 ${((total / runWallMs) * 100).toFixed(1)}%)`
		);
		const top = [...snapshot.longTasks]
			.sort((a, b) => b.durationMs - a.durationMs)
			.slice(0, 8);
		for (const task of top) {
			console.log(`    ${rel(task.at)}  ${ms(task.durationMs)}`);
		}
	}

	console.log("\n━━━ 预览 React 重渲 ━━━");
	console.log(
		`  本次运行: ${snapshot.previewRenderTotalCount} 次 | smooth-time reason: ${snapshot.smoothTimeReason ?? "n/a"}`
	);

	console.log("\n━━━ 媒体元素事件 (seek/停顿/重载) ━━━");
	const interesting = snapshot.mediaEvents.filter((event) =>
		["seeking", "waiting", "stalled", "loadstart", "error", "ended"].includes(
			event.type
		)
	);
	if (interesting.length === 0) {
		console.log("  无 seek/停顿/重载事件 ✓");
	} else {
		for (const event of interesting.slice(-30)) {
			console.log(
				`    ${rel(event.at)}  ${event.type.padEnd(9)} ${event.videoId.slice(0, 20)} (${event.src})`
			);
		}
	}

	console.log("\n━━━ 视频元素状态 (运行结束时) ━━━");
	for (const video of snapshot.videos) {
		const key = `${video.videoId}:${video.srcKind}`;
		const baseline = beforeVideoStats.get(key);
		const droppedDelta =
			video.droppedVideoFrames !== null && baseline?.droppedVideoFrames != null
				? video.droppedVideoFrames - baseline.droppedVideoFrames
				: video.droppedVideoFrames;
		const totalDelta =
			video.totalVideoFrames !== null && baseline?.totalVideoFrames != null
				? video.totalVideoFrames - baseline.totalVideoFrames
				: video.totalVideoFrames;
		console.log(
			`  ${video.videoId.slice(0, 24).padEnd(24)} src=${video.srcKind.padEnd(5)} ready=${video.readyState} ${video.paused ? "paused" : "PLAYING"} t=${video.currentTime.toFixed(2)}s dropped=${droppedDelta ?? "?"}/${totalDelta ?? "?"}`
		);
	}

	console.log("\n━━━ 呈现帧间隔 (rVFC) ━━━");
	const presented = snapshot.presentedFrames
		.map((frame) => frame.intervalMs)
		.filter((value): value is number => typeof value === "number" && value > 0)
		.sort((a, b) => a - b);
	if (presented.length === 0) {
		console.log("  无呈现帧样本");
	} else {
		console.log(
			`  n=${presented.length} p50=${ms(percentile(presented, 50))} p95=${ms(percentile(presented, 95))} max=${ms(presented[presented.length - 1])} (24fps 素材理想 ≈41.7ms)`
		);
		const stalls = presented.filter((value) => value >= 80);
		console.log(
			`  ≥80ms 卡帧: ${stalls.length} 次 ${stalls.length > 0 ? "← 观感卡顿的直接证据" : "(无)"}`
		);
	}

	const store = snapshot.playbackStore;
	if (store) {
		console.log("\n━━━ 播放存储 ━━━");
		console.log(
			`  quality=${store.previewQuality} runtime=${store.runtimePreviewQuality ?? "-"} diagnostic=${store.runtimeDiagnosticReason ?? "-"}`
		);
	}

	console.log("\n━━━ 判定 ━━━");
	const verdicts: string[] = [];
	const clockP95 = percentile(clock, 95);
	if (clockP95 >= 50) {
		verdicts.push(
			`主时钟 p95=${ms(clockP95)} ≥50ms → 主线程 JS 阻塞是首要原因`
		);
	}
	const longTaskTotal =
		snapshot.longTaskTotalDurationMs ??
		snapshot.longTasks.reduce((sum, task) => sum + task.durationMs, 0);
	if (longTaskTotal / runWallMs > 0.1) {
		verdicts.push(
			`长任务占播放时长 ${((longTaskTotal / runWallMs) * 100).toFixed(0)}% → 找出长任务来源`
		);
	}
	if (snapshot.previewRenderTotalCount > args.seconds * 5) {
		verdicts.push(
			`预览重渲 ${snapshot.previewRenderTotalCount} 次 (reason=${snapshot.smoothTimeReason}) → 每帧重渲仍在发生`
		);
	}
	const reloadCount = interesting.filter(
		(event) => event.type === "loadstart"
	).length;
	if (reloadCount > 0) {
		verdicts.push(`播放中发生 ${reloadCount} 次视频源重载 → 每次都是一顿`);
	}
	const seekCount = interesting.filter(
		(event) => event.type === "seeking"
	).length;
	if (seekCount > 2) {
		verdicts.push(`播放中发生 ${seekCount} 次 video seek → 纠偏/重载导致跳帧`);
	}
	const presentedStalls = presented.filter((value) => value >= 80).length;
	if (presentedStalls > 2 && verdicts.length === 0) {
		verdicts.push("呈现帧卡顿但主线程健康 → 怀疑解码/合成侧");
	}
	if (verdicts.length === 0) {
		verdicts.push("各项指标健康 — 若观感仍卡, 采样窗口可能没覆盖到问题片段");
	}
	for (const verdict of verdicts) {
		console.log(`  • ${verdict}`);
	}
}

main().catch((error) => {
	console.error(`✗ ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import type { JsonlEntry } from "@/lib/claude-jsonl";

interface ConversationViewerProps {
	sessionId: string;
	startFullscreen?: boolean;
	height?: string;
}

interface ConversationResponse {
	entries: JsonlEntry[];
	total: number;
	updatedAt: string;
	cwd: string;
}

interface ToolTheme {
	border: string;
	background: string;
	text: string;
	rowBackground: string;
	detailText: string;
}

const DEFAULT_TOOL_THEME: ToolTheme = {
	border: "#5ea0ff",
	background: "rgba(94, 160, 255, 0.2)",
	text: "#dcebff",
	rowBackground: "rgba(94, 160, 255, 0.08)",
	detailText: "#b9d4ff",
};

const TOOL_THEME_PALETTE: ToolTheme[] = [
	DEFAULT_TOOL_THEME,
	{
		border: "#ffb55a",
		background: "rgba(255, 181, 90, 0.2)",
		text: "#ffe3bc",
		rowBackground: "rgba(255, 181, 90, 0.08)",
		detailText: "#ffd39a",
	},
	{
		border: "#57d38c",
		background: "rgba(87, 211, 140, 0.2)",
		text: "#d3ffe5",
		rowBackground: "rgba(87, 211, 140, 0.08)",
		detailText: "#aef2cb",
	},
	{
		border: "#f27ca0",
		background: "rgba(242, 124, 160, 0.2)",
		text: "#ffd8e6",
		rowBackground: "rgba(242, 124, 160, 0.08)",
		detailText: "#fcb8d1",
	},
	{
		border: "#9d86ff",
		background: "rgba(157, 134, 255, 0.2)",
		text: "#ebe3ff",
		rowBackground: "rgba(157, 134, 255, 0.08)",
		detailText: "#d2c5ff",
	},
	{
		border: "#52d6d0",
		background: "rgba(82, 214, 208, 0.2)",
		text: "#d3fffc",
		rowBackground: "rgba(82, 214, 208, 0.08)",
		detailText: "#9ff6ef",
	},
	{
		border: "#ff7d7d",
		background: "rgba(255, 125, 125, 0.2)",
		text: "#ffe1e1",
		rowBackground: "rgba(255, 125, 125, 0.08)",
		detailText: "#ffb9b9",
	},
];

const TOOL_THEME_BY_NAME: Record<string, ToolTheme> = {
	exec_command: TOOL_THEME_PALETTE[0],
	write_stdin: TOOL_THEME_PALETTE[0],
	apply_patch: TOOL_THEME_PALETTE[1],
	open: TOOL_THEME_PALETTE[2],
	click: TOOL_THEME_PALETTE[2],
	find: TOOL_THEME_PALETTE[2],
	search_query: TOOL_THEME_PALETTE[3],
	image_query: TOOL_THEME_PALETTE[3],
	finance: TOOL_THEME_PALETTE[3],
	weather: TOOL_THEME_PALETTE[3],
	sports: TOOL_THEME_PALETTE[3],
	time: TOOL_THEME_PALETTE[3],
	list_mcp_resources: TOOL_THEME_PALETTE[4],
	list_mcp_resource_templates: TOOL_THEME_PALETTE[4],
	read_mcp_resource: TOOL_THEME_PALETTE[4],
	search_tool_bm25: TOOL_THEME_PALETTE[4],
	spawn_agent: TOOL_THEME_PALETTE[5],
	send_input: TOOL_THEME_PALETTE[5],
	wait: TOOL_THEME_PALETTE[5],
	close_agent: TOOL_THEME_PALETTE[5],
	resume_agent: TOOL_THEME_PALETTE[5],
	parallel: TOOL_THEME_PALETTE[5],
};

function normalizeToolName({ name }: { name: string }): string {
	try {
		return name.trim().toLowerCase();
	} catch {
		return "unknown";
	}
}

function hashToolName({ value }: { value: string }): number {
	try {
		let hash = 0;
		for (const char of value) {
			hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
		}
		return hash;
	} catch {
		return 0;
	}
}

function getToolTheme({ name }: { name: string }): ToolTheme {
	try {
		const normalized = normalizeToolName({ name });
		const mapped = TOOL_THEME_BY_NAME[normalized];
		if (mapped) return mapped;
		const paletteIndex = hashToolName({ value: normalized }) % TOOL_THEME_PALETTE.length;
		return TOOL_THEME_PALETTE[paletteIndex] ?? DEFAULT_TOOL_THEME;
	} catch {
		return DEFAULT_TOOL_THEME;
	}
}

/** Extract displayable text from a message content field. */
function extractText(content: string | unknown[] | undefined): string {
	if (!content) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const block of content) {
			if (typeof block === "string") {
				parts.push(block);
			} else if (
				typeof block === "object" &&
				block !== null &&
				"text" in block &&
				typeof (block as { text: string }).text === "string"
			) {
				parts.push((block as { text: string }).text);
			} else if (
				typeof block === "object" &&
				block !== null &&
				"type" in block &&
				(block as { type: string }).type === "tool_use"
			) {
				const tool = block as { name?: string };
				parts.push(`[Tool: ${tool.name ?? "unknown"}]`);
			}
		}
		return parts.join("");
	}
	return "";
}

/** Truncate long text with an expand toggle. */
function TruncatedText({
	text,
	maxLength = 500,
}: {
	text: string;
	maxLength?: number;
}) {
	const [expanded, setExpanded] = useState(false);

	if (text.length <= maxLength) {
		return <span className="whitespace-pre-wrap break-words">{text}</span>;
	}

	return (
		<span className="whitespace-pre-wrap break-words">
			{expanded ? text : text.slice(0, maxLength) + "\u2026"}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="ml-1 text-[var(--color-accent)] hover:underline text-[11px]"
			>
				{expanded ? "show less" : "show more"}
			</button>
		</span>
	);
}

/** Render a single conversation entry. */
function EntryRow({ entry }: { entry: JsonlEntry }) {
	const type = entry.type ?? "unknown";

	if (type === "user") {
		const text = extractText(entry.message?.content);
		if (!text) return null;
		return (
			<div className="px-3 py-2 border-l-2 border-[var(--color-accent)] bg-[rgba(91,126,248,0.04)]">
				<div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-accent)] mb-1">
					User
				</div>
				<div className="text-[12px] text-[var(--color-text-primary)] leading-relaxed">
					<TruncatedText text={text} />
				</div>
			</div>
		);
	}

	if (type === "assistant") {
		const text = extractText(entry.message?.content);
		if (!text) return null;
		return (
			<div className="px-3 py-2">
				<div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-status-ready)] mb-1">
					Assistant
				</div>
				<div className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed">
					<TruncatedText text={text} maxLength={800} />
				</div>
			</div>
		);
	}

	if (type === "tool_use") {
		const name = entry.toolName ?? entry.tool_name ?? "unknown";
		const detail = entry.toolDetail;
		const theme = getToolTheme({ name });
		return (
			<div
				className="px-3 py-1.5 flex items-center gap-2 min-w-0 border-l-2"
				style={{
					borderLeftColor: theme.border,
					background: theme.rowBackground,
				}}
			>
				<span
					className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold"
					style={{
						borderColor: theme.border,
						background: theme.background,
						color: theme.text,
					}}
				>
					{name}
				</span>
				{detail && (
					<span
						className="truncate font-mono text-[10px] opacity-95"
						style={{ color: theme.detailText }}
					>
						{detail}
					</span>
				)}
			</div>
		);
	}

	if (type === "tool_result") {
		const detail = entry.toolResult ?? entry.toolDetail ?? "completed";
		const isError = entry.toolResultError === true;
		const toolName = entry.toolName ?? entry.tool_name;
		const theme = toolName
			? getToolTheme({ name: toolName })
			: null;
		return (
			<div
				className={cn(
					"px-3 py-1.5 flex items-start gap-2 min-w-0 border-l-2",
					isError && "bg-[rgba(248,81,73,0.05)]"
				)}
				style={{
					borderLeftColor: theme?.border ?? "rgba(255,255,255,0.08)",
					background:
						theme && !isError
							? theme.rowBackground
							: undefined,
				}}
			>
				<span
					className={cn(
						"shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono font-medium",
						isError
							? "bg-[rgba(248,81,73,0.14)] text-[var(--color-status-error)]"
							: "bg-[rgba(255,255,255,0.06)] text-[var(--color-text-tertiary)]"
					)}
					style={
						!isError && theme
							? {
									borderColor: theme.border,
									background: theme.background,
									color: theme.text,
								}
							: undefined
					}
				>
					result
				</span>
				<span
					className={cn(
						"min-w-0 whitespace-pre-wrap break-words font-mono text-[10px]",
						isError
							? "text-[var(--color-status-error)]"
							: "text-[var(--color-text-muted)] opacity-80"
					)}
					style={!isError && theme ? { color: theme.detailText } : undefined}
				>
					<TruncatedText text={detail} maxLength={380} />
				</span>
			</div>
		);
	}

	if (type === "error") {
		const text = extractText(entry.message?.content);
		return (
			<div className="px-3 py-2 border-l-2 border-[var(--color-status-error)] bg-[rgba(248,81,73,0.06)]">
				<div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-status-error)] mb-1">
					Error
				</div>
				<div className="text-[12px] text-[var(--color-status-error)] leading-relaxed font-mono">
					{text || "Unknown error"}
				</div>
			</div>
		);
	}

	if (type === "permission_request") {
		return (
			<div className="px-3 py-2 border-l-2 border-[var(--color-status-attention)] bg-[rgba(245,158,11,0.06)]">
				<div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--color-status-attention)]">
					Waiting for permission
				</div>
			</div>
		);
	}

	if (type === "summary") {
		return (
			<div className="px-3 py-1.5">
				<div className="text-[11px] italic text-[var(--color-text-tertiary)]">
					{entry.summary ?? "Session summary"}
				</div>
			</div>
		);
	}

	return null;
}

/** Live conversation viewer for Claude Code sessions, polling JSONL data. */
export function ConversationViewer({
	sessionId,
	startFullscreen = false,
	height = "max(440px, calc(100vh - 440px))",
}: ConversationViewerProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const scrollRef = useRef<HTMLDivElement>(null);
	const [entries, setEntries] = useState<JsonlEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [status, setStatus] = useState<"loading" | "connected" | "error">(
		"loading",
	);
	const [error, setError] = useState<string | null>(null);
	const [fullscreen, setFullscreen] = useState(startFullscreen);
	const [autoScroll, setAutoScroll] = useState(true);
	const prevEntryCount = useRef(0);

	// Update URL when fullscreen changes
	useEffect(() => {
		const params = new URLSearchParams(searchParams.toString());
		if (fullscreen) {
			params.set("fullscreen", "true");
		} else {
			params.delete("fullscreen");
		}
		const newUrl = params.toString()
			? `${pathname}?${params.toString()}`
			: pathname;
		router.replace(newUrl, { scroll: false });
	}, [fullscreen, pathname, router, searchParams]);

	// Detect user scroll to disable auto-scroll
	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			const atBottom = scrollHeight - scrollTop - clientHeight < 60;
			setAutoScroll(atBottom);
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	const fetchConversation = useCallback(async () => {
		try {
			const res = await fetch(
				`/api/sessions/${encodeURIComponent(sessionId)}/conversation?limit=200`,
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
			const data = (await res.json()) as ConversationResponse;
			setEntries(data.entries);
			setTotal(data.total);
			setStatus("connected");
			setError(null);
		} catch (err) {
			setStatus("error");
			setError(err instanceof Error ? err.message : "Failed to load conversation");
		}
	}, [sessionId]);

	// Initial fetch + polling
	useEffect(() => {
		fetchConversation();
		const interval = setInterval(fetchConversation, 3000);
		return () => clearInterval(interval);
	}, [fetchConversation]);

	// Auto-scroll when new entries arrive
	useEffect(() => {
		if (autoScroll && entries.length > prevEntryCount.current) {
			const container = scrollRef.current;
			if (container) {
				requestAnimationFrame(() => {
					container.scrollTop = container.scrollHeight;
				});
			}
		}
		prevEntryCount.current = entries.length;
	}, [entries.length, autoScroll]);

	const statusDotClass =
		status === "connected"
			? "bg-[var(--color-status-ready)]"
			: status === "error"
				? "bg-[var(--color-status-error)]"
				: "bg-[var(--color-status-attention)] animate-[pulse_1.5s_ease-in-out_infinite]";

	const statusText =
		status === "connected"
			? `${total} entries`
			: status === "error"
				? (error ?? "Error")
				: "Loading\u2026";

	const statusTextColor =
		status === "connected"
			? "text-[var(--color-text-tertiary)]"
			: status === "error"
				? "text-[var(--color-status-error)]"
				: "text-[var(--color-text-tertiary)]";

	return (
		<div
			className={cn(
				"overflow-hidden rounded-[6px] border border-[var(--color-border-default)]",
				"bg-[#0a0a0f]",
				fullscreen && "fixed inset-0 z-50 rounded-none border-0",
			)}
		>
			{/* Chrome bar */}
			<div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-2">
				<div className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClass)} />
				<span className="font-[var(--font-mono)] text-[11px] text-[var(--color-accent)]">
					{sessionId}
				</span>
				<span className={cn("text-[10px] font-medium", statusTextColor)}>
					{statusText}
				</span>
				<span
					className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
					style={{
						color: "var(--color-accent)",
						background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
					}}
				>
					JSONL
				</span>
				{!autoScroll && (
					<button
						type="button"
						onClick={() => {
							setAutoScroll(true);
							const container = scrollRef.current;
							if (container) {
								container.scrollTop = container.scrollHeight;
							}
						}}
						className="text-[10px] text-[var(--color-accent)] hover:underline"
					>
						scroll to bottom
					</button>
				)}
				<button
					onClick={() => setFullscreen(!fullscreen)}
					className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]"
				>
					{fullscreen ? (
						<>
							<svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
								<path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
							</svg>
							exit fullscreen
						</>
					) : (
						<>
							<svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
								<path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
							</svg>
							fullscreen
						</>
					)}
				</button>
			</div>

			{/* Conversation entries */}
			<div
				ref={scrollRef}
				className="overflow-y-auto"
				style={{ height: fullscreen ? "calc(100vh - 37px)" : height }}
			>
				{entries.length === 0 && status === "connected" && (
					<div className="flex items-center justify-center py-16 text-[13px] text-[var(--color-text-tertiary)]">
						No conversation entries yet
					</div>
				)}
				{entries.length === 0 && status === "error" && (
					<div className="flex items-center justify-center py-16 text-[13px] text-[var(--color-status-error)]">
						{error}
					</div>
				)}
				<div className="divide-y divide-[rgba(255,255,255,0.04)]">
					{entries.map((entry, i) => (
						<EntryRow key={`${entry.type}-${i}`} entry={entry} />
					))}
				</div>
			</div>
		</div>
	);
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { CLITerminalPanel } from "./CLITerminalPanel";
import type { DashboardSession } from "@/lib/types";

interface TerminalMirrorProps {
	session: DashboardSession;
	startFullscreen?: boolean;
	height?: string;
}

interface TerminalContentResponse {
	content: string;
	tty: string;
	app: string;
	timestamp: string;
}

/** Read-only terminal mirror that polls AppleScript-captured terminal content. */
export function TerminalMirror({
	session,
	startFullscreen = false,
	height = "max(440px, calc(100vh - 440px))",
}: TerminalMirrorProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const scrollRef = useRef<HTMLPreElement>(null);
	const [content, setContent] = useState<string>("");
	const [app, setApp] = useState<string | null>(null);
	const [status, setStatus] = useState<"loading" | "connected" | "error">(
		"loading",
	);
	const [error, setError] = useState<string | null>(null);
	const [fullscreen, setFullscreen] = useState(startFullscreen);
	const [autoScroll, setAutoScroll] = useState(true);

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

	// Detect user scroll
	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	const fetchContent = useCallback(async () => {
		try {
			const res = await fetch(
				`/api/sessions/${encodeURIComponent(session.id)}/terminal-content`,
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
			const data = (await res.json()) as TerminalContentResponse;
			setContent(data.content);
			setApp(data.app);
			setStatus("connected");
			setError(null);
		} catch (err) {
			if (status !== "connected") {
				setStatus("error");
				setError(
					err instanceof Error ? err.message : "Failed to read terminal",
				);
			}
		}
	}, [session.id, status]);

	// Initial fetch + polling
	useEffect(() => {
		fetchContent();
		const interval = setInterval(fetchContent, 2000);
		return () => clearInterval(interval);
	}, [fetchContent]);

	// Auto-scroll on content change
	useEffect(() => {
		if (autoScroll && scrollRef.current) {
			requestAnimationFrame(() => {
				if (scrollRef.current) {
					scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
				}
			});
		}
	}, [content, autoScroll]);

	// If we can't read the terminal, fall back to CLITerminalPanel
	if (status === "error" && !content) {
		return <CLITerminalPanel session={session} />;
	}

	const statusDotClass =
		status === "connected"
			? "bg-[var(--color-status-ready)]"
			: status === "error"
				? "bg-[var(--color-status-error)]"
				: "bg-[var(--color-status-attention)] animate-[pulse_1.5s_ease-in-out_infinite]";

	const statusText =
		status === "connected"
			? "Connected"
			: status === "error"
				? "Stale"
				: "Loading\u2026";

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
					{session.id}
				</span>
				<span className="text-[10px] font-medium text-[var(--color-text-tertiary)]">
					{statusText}
				</span>
				<span
					className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
					style={{
						color: "#d29922",
						background: "rgba(210,153,34,0.12)",
					}}
				>
					Mirror
				</span>
				<span className="text-[10px] text-[var(--color-text-tertiary)]">
					read-only{app ? ` \u00b7 ${app}` : ""}
				</span>
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

			{/* Terminal content */}
			<pre
				ref={scrollRef}
				className="overflow-y-auto p-3 text-[12px] leading-[1.5] text-[var(--color-text-secondary)] font-[var(--font-mono)]"
				style={{
					height: fullscreen ? "calc(100vh - 37px)" : height,
					tabSize: 4,
				}}
			>
				{content || (status === "loading" ? "Loading terminal content\u2026" : "")}
			</pre>
		</div>
	);
}

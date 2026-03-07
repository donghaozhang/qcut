"use client";

import { useState, useEffect, useRef } from "react";
import { type DashboardPR } from "@/lib/types";
import { CI_STATUS } from "@composio/ao-core/types";
import { cn } from "@/lib/cn";
import { CICheckList } from "./CIBadge";

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract title and description from a bugbot-style PR comment body. */
function cleanBugbotComment(body: string): {
	title: string;
	description: string;
} {
	const isBugbot =
		body.includes("<!-- DESCRIPTION START -->") || body.includes("### ");
	if (isBugbot) {
		const titleMatch = body.match(/###\s+(.+?)(?:\n|$)/);
		const title = titleMatch
			? titleMatch[1].replace(/\*\*/g, "").trim()
			: "Comment";
		const descMatch = body.match(
			/<!-- DESCRIPTION START -->\s*([\s\S]*?)\s*<!-- DESCRIPTION END -->/
		);
		const description = descMatch
			? descMatch[1].trim()
			: body.split("\n")[0] || "No description";
		return { title, description };
	}
	return { title: "Comment", description: body.trim() };
}

/** Build the GitHub URL for a PR's source branch. */
export function buildGitHubBranchUrl(pr: DashboardPR): string {
	return `https://github.com/${pr.owner}/${pr.repo}/tree/${pr.branch}`;
}

/** Build the GitHub URL for a PR's repository. */
export function buildGitHubRepoUrl(pr: DashboardPR): string {
	return `https://github.com/${pr.owner}/${pr.repo}`;
}

/** Send a review comment to an agent session for automated fixing. */
async function askAgentToFix(
	sessionId: string,
	comment: { url: string; path: string; body: string },
	onSuccess: () => void,
	onError: () => void
) {
	try {
		const { title, description } = cleanBugbotComment(comment.body);
		const message = `Please address this review comment:\n\nFile: ${comment.path}\nComment: ${title}\nDescription: ${description}\n\nComment URL: ${comment.url}\n\nAfter fixing, mark the comment as resolved at ${comment.url}`;
		const res = await fetch(
			`/api/sessions/${encodeURIComponent(sessionId)}/message`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message }),
			}
		);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		onSuccess();
	} catch (err) {
		console.error("Failed to send message to agent:", err);
		onError();
	}
}

// ── Issues list (pre-merge blockers) ─────────────────────────────────

/** List of pre-merge blockers derived from PR state (CI, reviews, conflicts). */
function IssuesList({ pr }: { pr: DashboardPR }) {
	const issues: Array<{ icon: string; color: string; text: string }> = [];

	if (pr.ciStatus === CI_STATUS.FAILING) {
		const failCount = pr.ciChecks.filter((c) => c.status === "failed").length;
		issues.push({
			icon: "\u2717",
			color: "var(--color-status-error)",
			text:
				failCount > 0
					? `CI failing \u2014 ${failCount} check${failCount !== 1 ? "s" : ""} failed`
					: "CI failing",
		});
	} else if (pr.ciStatus === CI_STATUS.PENDING) {
		issues.push({
			icon: "\u25cf",
			color: "var(--color-status-attention)",
			text: "CI pending",
		});
	}

	if (pr.reviewDecision === "changes_requested") {
		issues.push({
			icon: "\u2717",
			color: "var(--color-status-error)",
			text: "Changes requested",
		});
	} else if (!pr.mergeability.approved) {
		issues.push({
			icon: "\u25cb",
			color: "var(--color-text-tertiary)",
			text: "Not approved \u2014 awaiting reviewer",
		});
	}

	if (pr.state !== "merged" && !pr.mergeability.noConflicts) {
		issues.push({
			icon: "\u2717",
			color: "var(--color-status-error)",
			text: "Merge conflicts",
		});
	}

	if (!pr.mergeability.mergeable && issues.length === 0) {
		issues.push({
			icon: "\u25cb",
			color: "var(--color-text-tertiary)",
			text: "Not mergeable",
		});
	}

	if (pr.unresolvedThreads > 0) {
		issues.push({
			icon: "\u25cf",
			color: "var(--color-status-attention)",
			text: `${pr.unresolvedThreads} unresolved comment${pr.unresolvedThreads !== 1 ? "s" : ""}`,
		});
	}

	if (pr.isDraft) {
		issues.push({
			icon: "\u25cb",
			color: "var(--color-text-tertiary)",
			text: "Draft PR",
		});
	}

	if (issues.length === 0) return null;

	return (
		<div className="space-y-1.5">
			<h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
				Blockers
			</h4>
			{issues.map((issue) => (
				<div key={issue.text} className="flex items-center gap-2.5 text-[12px]">
					<span
						className="w-3 shrink-0 text-center text-[12px]"
						style={{ color: issue.color }}
					>
						{issue.icon}
					</span>
					<span className="text-[var(--color-text-secondary)]">
						{issue.text}
					</span>
				</div>
			))}
		</div>
	);
}

// ── PR Card ───────────────────────────────────────────────────────────

/** Pull request card with CI status, review state, and action buttons. */
export function PRCard({ pr, sessionId }: { pr: DashboardPR; sessionId: string }) {
	const [sendingComments, setSendingComments] = useState<Set<string>>(
		new Set()
	);
	const [sentComments, setSentComments] = useState<Set<string>>(new Set());
	const [errorComments, setErrorComments] = useState<Set<string>>(new Set());
	const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map()
	);

	useEffect(() => {
		return () => {
			timersRef.current.forEach((timer) => clearTimeout(timer));
			timersRef.current.clear();
		};
	}, []);

	const handleAskAgentToFix = async (comment: {
		url: string;
		path: string;
		body: string;
	}) => {
		setSentComments((prev) => {
			const next = new Set(prev);
			next.delete(comment.url);
			return next;
		});
		setErrorComments((prev) => {
			const next = new Set(prev);
			next.delete(comment.url);
			return next;
		});
		setSendingComments((prev) => new Set(prev).add(comment.url));

		await askAgentToFix(
			sessionId,
			comment,
			() => {
				setSendingComments((prev) => {
					const next = new Set(prev);
					next.delete(comment.url);
					return next;
				});
				setSentComments((prev) => new Set(prev).add(comment.url));
				const existing = timersRef.current.get(comment.url);
				if (existing) clearTimeout(existing);
				const timer = setTimeout(() => {
					setSentComments((prev) => {
						const next = new Set(prev);
						next.delete(comment.url);
						return next;
					});
					timersRef.current.delete(comment.url);
				}, 3000);
				timersRef.current.set(comment.url, timer);
			},
			() => {
				setSendingComments((prev) => {
					const next = new Set(prev);
					next.delete(comment.url);
					return next;
				});
				setErrorComments((prev) => new Set(prev).add(comment.url));
				const existing = timersRef.current.get(comment.url);
				if (existing) clearTimeout(existing);
				const timer = setTimeout(() => {
					setErrorComments((prev) => {
						const next = new Set(prev);
						next.delete(comment.url);
						return next;
					});
					timersRef.current.delete(comment.url);
				}, 3000);
				timersRef.current.set(comment.url, timer);
			}
		);
	};

	const allGreen =
		pr.mergeability.mergeable &&
		pr.mergeability.ciPassing &&
		pr.mergeability.approved &&
		pr.mergeability.noConflicts;

	const failedChecks = pr.ciChecks.filter((c) => c.status === "failed");

	const borderColor = allGreen
		? "rgba(63,185,80,0.4)"
		: pr.state === "merged"
			? "rgba(163,113,247,0.3)"
			: "var(--color-border-default)";

	return (
		<div
			className="detail-card mb-6 overflow-hidden rounded-[8px] border"
			style={{ borderColor }}
		>
			{/* Title row */}
			<div className="border-b border-[var(--color-border-subtle)] px-5 py-3.5">
				<a
					href={pr.url}
					target="_blank"
					rel="noopener noreferrer"
					className="text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors hover:text-[var(--color-accent)] hover:no-underline"
				>
					PR #{pr.number}: {pr.title}
				</a>
				<div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
					<span>
						<span className="text-[var(--color-status-ready)]">
							+{pr.additions}
						</span>{" "}
						<span className="text-[var(--color-status-error)]">
							-{pr.deletions}
						</span>
					</span>
					{pr.isDraft && (
						<>
							<span className="text-[var(--color-text-tertiary)]">
								&middot;
							</span>
							<span className="font-medium text-[var(--color-text-tertiary)]">
								Draft
							</span>
						</>
					)}
					{pr.state === "merged" && (
						<>
							<span className="text-[var(--color-text-tertiary)]">
								&middot;
							</span>
							<span
								className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
								style={{
									color: "#a371f7",
									background: "rgba(163,113,247,0.12)",
								}}
							>
								Merged
							</span>
						</>
					)}
				</div>
			</div>

			{/* Body */}
			<div className="px-5 py-4">
				{/* Ready-to-merge banner */}
				{allGreen ? (
					<div className="flex items-center gap-2 rounded-[5px] border border-[rgba(63,185,80,0.25)] bg-[rgba(63,185,80,0.07)] px-3.5 py-2.5">
						<svg
							className="h-4 w-4 shrink-0 text-[var(--color-status-ready)]"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							viewBox="0 0 24 24"
						>
							<path d="M20 6L9 17l-5-5" />
						</svg>
						<span className="text-[13px] font-semibold text-[var(--color-status-ready)]">
							Ready to merge
						</span>
					</div>
				) : (
					<IssuesList pr={pr} />
				)}

				{/* CI Checks */}
				{pr.ciChecks.length > 0 && (
					<div className="mt-4 border-t border-[var(--color-border-subtle)] pt-4">
						<CICheckList
							checks={pr.ciChecks}
							layout={failedChecks.length > 0 ? "expanded" : "inline"}
						/>
					</div>
				)}

				{/* Unresolved comments */}
				{pr.unresolvedComments.length > 0 && (
					<div className="mt-4 border-t border-[var(--color-border-subtle)] pt-4">
						<h4 className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
							Unresolved Comments
							<span
								className="rounded-full px-1.5 py-0.5 text-[11px] font-bold normal-case tracking-normal"
								style={{ color: "#f85149", background: "rgba(248,81,73,0.12)" }}
							>
								{pr.unresolvedThreads}
							</span>
						</h4>
						<div className="space-y-1">
							{pr.unresolvedComments.map((c) => {
								const { title, description } = cleanBugbotComment(c.body);
								return (
									<details key={c.url} className="group">
										<summary className="flex cursor-pointer list-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.04)]">
											<svg
												className="h-3 w-3 shrink-0 text-[var(--color-text-tertiary)] transition-transform group-open:rotate-90"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												viewBox="0 0 24 24"
											>
												<path d="M9 5l7 7-7 7" />
											</svg>
											<span className="font-medium text-[var(--color-text-secondary)]">
												{title}
											</span>
											<span className="text-[var(--color-text-tertiary)]">
												· {c.author}
											</span>
											<a
												href={c.url}
												target="_blank"
												rel="noopener noreferrer"
												onClick={(e) => e.stopPropagation()}
												className="ml-auto text-[11px] text-[var(--color-accent)] hover:underline"
											>
												view →
											</a>
										</summary>
										<div className="ml-5 mt-1 space-y-1.5 px-2 pb-2">
											<div className="font-[var(--font-mono)] text-[11px] text-[var(--color-text-tertiary)]">
												{c.path}
											</div>
											<p className="border-l-2 border-[var(--color-border-default)] pl-3 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
												{description}
											</p>
											<button
												onClick={() => handleAskAgentToFix(c)}
												disabled={sendingComments.has(c.url)}
												className={cn(
													"mt-1.5 rounded-[4px] px-3 py-1 text-[12px] font-semibold transition-all",
													sentComments.has(c.url)
														? "bg-[var(--color-status-ready)] text-white"
														: errorComments.has(c.url)
															? "bg-[var(--color-status-error)] text-white"
															: "bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50"
												)}
											>
												{sendingComments.has(c.url)
													? "Sending\u2026"
													: sentComments.has(c.url)
														? "Sent \u2713"
														: errorComments.has(c.url)
															? "Failed"
															: "Ask Agent to Fix"}
											</button>
										</div>
									</details>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

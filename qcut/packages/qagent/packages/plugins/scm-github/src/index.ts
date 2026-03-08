/**
 * scm-github plugin — GitHub PRs, CI checks, reviews, merge readiness.
 *
 * Uses the `gh` CLI for all GitHub API interactions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	CI_STATUS,
	type PluginModule,
	type SCM,
	type Session,
	type ProjectConfig,
	type PRInfo,
	type PRState,
	type MergeMethod,
	type CICheck,
	type CIStatus,
	type Review,
	type ReviewDecision,
	type ReviewComment,
	type AutomatedComment,
	type MergeReadiness,
} from "@composio/ao-core";

const execFileAsync = promisify(execFile);

/** Known bot logins that produce automated review comments */
const BOT_AUTHORS = new Set([
	"cursor[bot]",
	"github-actions[bot]",
	"codecov[bot]",
	"sonarcloud[bot]",
	"dependabot[bot]",
	"renovate[bot]",
	"codeclimate[bot]",
	"deepsource-autofix[bot]",
	"snyk-bot",
	"lgtm-com[bot]",
	"coderabbitai[bot]",
	"gemini-code-assist[bot]",
	"copilot-pull-request-reviewer[bot]",
	"sourcery-ai[bot]",
	"pr-agent[bot]",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gh(args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync("gh", args, {
			maxBuffer: 10 * 1024 * 1024,
			timeout: 30_000,
		});
		return stdout.trim();
	} catch (err) {
		throw new Error(
			`gh ${args.slice(0, 3).join(" ")} failed: ${(err as Error).message}`,
			{
				cause: err,
			}
		);
	}
}

function repoFlag(pr: PRInfo): string {
	return `${pr.owner}/${pr.repo}`;
}

function parseDate(val: string | undefined | null): Date {
	if (!val) return new Date(0);
	const d = new Date(val);
	return isNaN(d.getTime()) ? new Date(0) : d;
}

// ---------------------------------------------------------------------------
// SCM implementation
// ---------------------------------------------------------------------------

function createGitHubSCM(): SCM {
	return {
		name: "github",

		async detectPR(
			session: Session,
			project: ProjectConfig
		): Promise<PRInfo | null> {
			if (!session.branch) return null;

			const parts = project.repo.split("/");
			if (parts.length !== 2 || !parts[0] || !parts[1]) {
				throw new Error(
					`Invalid repo format "${project.repo}", expected "owner/repo"`
				);
			}
			const [owner, repo] = parts;

			// Try metadata branch first, then fall back to actual worktree branch
			const branchesToTry = [session.branch];
			if (session.workspacePath) {
				try {
					const { stdout } = await execFileAsync(
						"git",
						["-C", session.workspacePath, "branch", "--show-current"],
						{ timeout: 5_000 }
					);
					const actualBranch = stdout.trim();
					if (actualBranch && actualBranch !== session.branch) {
						branchesToTry.push(actualBranch);
					}
				} catch {
					// Worktree may not exist — that's fine
				}
			}

			for (const branch of branchesToTry) {
				try {
					const raw = await gh([
						"pr",
						"list",
						"--repo",
						project.repo,
						"--head",
						branch,
						"--json",
						"number,url,title,headRefName,baseRefName,isDraft",
						"--limit",
						"1",
					]);

					const prs: Array<{
						number: number;
						url: string;
						title: string;
						headRefName: string;
						baseRefName: string;
						isDraft: boolean;
					}> = JSON.parse(raw);

					if (prs.length === 0) continue;

					const pr = prs[0];
					return {
						number: pr.number,
						url: pr.url,
						title: pr.title,
						owner,
						repo,
						branch: pr.headRefName,
						baseBranch: pr.baseRefName,
						isDraft: pr.isDraft,
					};
				} catch {}
			}

			return null;
		},

		async getPRState(pr: PRInfo): Promise<PRState> {
			const raw = await gh([
				"pr",
				"view",
				String(pr.number),
				"--repo",
				repoFlag(pr),
				"--json",
				"state",
			]);
			const data: { state: string } = JSON.parse(raw);
			const s = data.state.toUpperCase();
			if (s === "MERGED") return "merged";
			if (s === "CLOSED") return "closed";
			return "open";
		},

		async getPRSummary(pr: PRInfo) {
			const raw = await gh([
				"pr",
				"view",
				String(pr.number),
				"--repo",
				repoFlag(pr),
				"--json",
				"state,title,additions,deletions",
			]);
			const data: {
				state: string;
				title: string;
				additions: number;
				deletions: number;
			} = JSON.parse(raw);
			const s = data.state.toUpperCase();
			const state: PRState =
				s === "MERGED" ? "merged" : s === "CLOSED" ? "closed" : "open";
			return {
				state,
				title: data.title ?? "",
				additions: data.additions ?? 0,
				deletions: data.deletions ?? 0,
			};
		},

		async mergePR(pr: PRInfo, method: MergeMethod = "squash"): Promise<void> {
			const flag =
				method === "rebase"
					? "--rebase"
					: method === "merge"
						? "--merge"
						: "--squash";

			try {
				await gh([
					"pr",
					"merge",
					String(pr.number),
					"--repo",
					repoFlag(pr),
					flag,
					"--delete-branch",
				]);
			} catch {
				// Branch protection may block normal merge — retry with admin override
				await gh([
					"pr",
					"merge",
					String(pr.number),
					"--repo",
					repoFlag(pr),
					flag,
					"--delete-branch",
					"--admin",
				]);
			}
		},

		async closePR(pr: PRInfo): Promise<void> {
			await gh(["pr", "close", String(pr.number), "--repo", repoFlag(pr)]);
		},

		async getCIChecks(pr: PRInfo): Promise<CICheck[]> {
			try {
				const raw = await gh([
					"pr",
					"checks",
					String(pr.number),
					"--repo",
					repoFlag(pr),
					"--json",
					"name,state,link,startedAt,completedAt",
				]);

				const checks: Array<{
					name: string;
					state: string;
					link: string;
					startedAt: string;
					completedAt: string;
				}> = JSON.parse(raw);

				return checks.map((c) => {
					let status: CICheck["status"];
					const state = c.state?.toUpperCase();

					// gh pr checks returns state directly: SUCCESS, FAILURE, PENDING, QUEUED, etc.
					if (state === "PENDING" || state === "QUEUED") {
						status = "pending";
					} else if (state === "IN_PROGRESS") {
						status = "running";
					} else if (state === "SUCCESS") {
						status = "passed";
					} else if (
						state === "FAILURE" ||
						state === "TIMED_OUT" ||
						state === "CANCELLED" ||
						state === "ACTION_REQUIRED"
					) {
						status = "failed";
					} else if (state === "SKIPPED" || state === "NEUTRAL") {
						status = "skipped";
					} else {
						// Unknown state on a check — fail closed for safety
						status = "failed";
					}

					return {
						name: c.name,
						status,
						url: c.link || undefined,
						conclusion: state || undefined, // Store original state for debugging
						startedAt: c.startedAt ? new Date(c.startedAt) : undefined,
						completedAt: c.completedAt ? new Date(c.completedAt) : undefined,
					};
				});
			} catch (err) {
				// Propagate so callers (getCISummary) can decide how to handle.
				// Do NOT silently return [] — that causes a fail-open where CI
				// appears healthy when we simply failed to fetch check status.
				throw new Error("Failed to fetch CI checks", { cause: err });
			}
		},

		async getCISummary(pr: PRInfo): Promise<CIStatus> {
			let checks: CICheck[];
			try {
				checks = await this.getCIChecks(pr);
			} catch {
				// Before fail-closing, check if the PR is merged/closed —
				// GitHub may not return check data for those, and reporting
				// "failing" for a merged PR is wrong.
				try {
					const state = await this.getPRState(pr);
					if (state === "merged" || state === "closed") return "none";
				} catch {
					// Can't determine state either; fall through to fail-closed.
				}
				// Fail closed for open PRs: report as failing rather than
				// "none" (which getMergeability treats as passing).
				return "failing";
			}
			if (checks.length === 0) return "none";

			const hasFailing = checks.some((c) => c.status === "failed");
			if (hasFailing) return "failing";

			const hasPending = checks.some(
				(c) => c.status === "pending" || c.status === "running"
			);
			if (hasPending) return "pending";

			// Only report passing if at least one check actually passed
			// (not all skipped)
			const hasPassing = checks.some((c) => c.status === "passed");
			if (!hasPassing) return "none";

			return "passing";
		},

		async getReviews(pr: PRInfo): Promise<Review[]> {
			const raw = await gh([
				"pr",
				"view",
				String(pr.number),
				"--repo",
				repoFlag(pr),
				"--json",
				"reviews",
			]);
			const data: {
				reviews: Array<{
					author: { login: string };
					state: string;
					body: string;
					submittedAt: string;
				}>;
			} = JSON.parse(raw);

			return data.reviews.map((r) => {
				let state: Review["state"];
				const s = r.state?.toUpperCase();
				if (s === "APPROVED") state = "approved";
				else if (s === "CHANGES_REQUESTED") state = "changes_requested";
				else if (s === "DISMISSED") state = "dismissed";
				else if (s === "PENDING") state = "pending";
				else state = "commented";

				return {
					author: r.author?.login ?? "unknown",
					state,
					body: r.body || undefined,
					submittedAt: parseDate(r.submittedAt),
				};
			});
		},

		async getReviewDecision(pr: PRInfo): Promise<ReviewDecision> {
			const raw = await gh([
				"pr",
				"view",
				String(pr.number),
				"--repo",
				repoFlag(pr),
				"--json",
				"reviewDecision",
			]);
			const data: { reviewDecision: string } = JSON.parse(raw);

			const d = (data.reviewDecision ?? "").toUpperCase();
			if (d === "APPROVED") return "approved";
			if (d === "CHANGES_REQUESTED") return "changes_requested";
			if (d === "REVIEW_REQUIRED") return "pending";
			return "none";
		},

		async getPendingComments(pr: PRInfo): Promise<ReviewComment[]> {
			try {
				// Use GraphQL with variables to get review threads with actual isResolved status
				const raw = await gh([
					"api",
					"graphql",
					"-f",
					`owner=${pr.owner}`,
					"-f",
					`name=${pr.repo}`,
					"-F",
					`number=${pr.number}`,
					"-f",
					`query=query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                reviewThreads(first: 100) {
                  nodes {
                    isResolved
                    comments(first: 1) {
                      nodes {
                        id
                        author { login }
                        body
                        path
                        line
                        url
                        createdAt
                      }
                    }
                  }
                }
              }
            }
          }`,
				]);

				const data: {
					data: {
						repository: {
							pullRequest: {
								reviewThreads: {
									nodes: Array<{
										isResolved: boolean;
										comments: {
											nodes: Array<{
												id: string;
												author: { login: string } | null;
												body: string;
												path: string | null;
												line: number | null;
												url: string;
												createdAt: string;
											}>;
										};
									}>;
								};
							};
						};
					};
				} = JSON.parse(raw);

				const threads = data.data.repository.pullRequest.reviewThreads.nodes;

				return threads
					.filter((t) => {
						if (t.isResolved) return false; // only pending (unresolved) threads
						const c = t.comments.nodes[0];
						if (!c) return false; // skip threads with no comments
						const author = c.author?.login ?? "";
						return !BOT_AUTHORS.has(author);
					})
					.map((t) => {
						const c = t.comments.nodes[0];
						return {
							id: c.id,
							author: c.author?.login ?? "unknown",
							body: c.body,
							path: c.path || undefined,
							line: c.line ?? undefined,
							isResolved: t.isResolved,
							createdAt: parseDate(c.createdAt),
							url: c.url,
						};
					});
			} catch {
				return [];
			}
		},

		async getAutomatedComments(pr: PRInfo): Promise<AutomatedComment[]> {
			try {
				// Determine severity from body content
				function classifySeverity(body: string): AutomatedComment["severity"] {
					const lower = body.toLowerCase();
					if (
						lower.includes("error") ||
						lower.includes("bug") ||
						lower.includes("critical") ||
						lower.includes("potential issue")
					) {
						return "error";
					}
					if (
						lower.includes("warning") ||
						lower.includes("suggest") ||
						lower.includes("consider")
					) {
						return "warning";
					}
					return "info";
				}

				const repo = repoFlag(pr);

				// Fetch inline review comments AND top-level PR comments in parallel.
				// CodeRabbit and other bots post top-level comments (issues endpoint),
				// while some bots also post inline review comments (pulls endpoint).
				const [inlineRaw, topLevelRaw] = await Promise.all([
					gh(["api", `repos/${repo}/pulls/${pr.number}/comments?per_page=100`]),
					gh([
						"api",
						`repos/${repo}/issues/${pr.number}/comments?per_page=100`,
					]),
				]);

				const inlineComments: Array<{
					id: number;
					user: { login: string };
					body: string;
					path: string;
					line: number | null;
					original_line: number | null;
					created_at: string;
					html_url: string;
				}> = JSON.parse(inlineRaw);

				const topLevelComments: Array<{
					id: number;
					user: { login: string };
					body: string;
					created_at: string;
					html_url: string;
				}> = JSON.parse(topLevelRaw);

				const inline = inlineComments
					.filter((c) => BOT_AUTHORS.has(c.user?.login ?? ""))
					.map((c) => ({
						id: String(c.id),
						botName: c.user?.login ?? "unknown",
						body: c.body,
						path: c.path || undefined,
						line: c.line ?? c.original_line ?? undefined,
						severity: classifySeverity(c.body),
						createdAt: parseDate(c.created_at),
						url: c.html_url,
					}));

				const topLevel = topLevelComments
					.filter((c) => BOT_AUTHORS.has(c.user?.login ?? ""))
					.map((c) => ({
						id: String(c.id),
						botName: c.user?.login ?? "unknown",
						body: c.body,
						path: undefined,
						line: undefined,
						severity: classifySeverity(c.body),
						createdAt: parseDate(c.created_at),
						url: c.html_url,
					}));

				return [...inline, ...topLevel].sort(
					(a, b) => a.createdAt.getTime() - b.createdAt.getTime()
				);
			} catch {
				return [];
			}
		},

		async getMergeability(pr: PRInfo): Promise<MergeReadiness> {
			const blockers: string[] = [];

			// First, check if the PR is merged
			// GitHub returns mergeable=null for merged PRs, which is not useful
			// Note: We only skip checks for merged PRs. Closed PRs still need accurate status.
			const state = await this.getPRState(pr);
			if (state === "merged") {
				// For merged PRs, return a clean result without querying mergeable status
				return {
					mergeable: true,
					ciPassing: true,
					approved: true,
					noConflicts: true,
					blockers: [],
				};
			}

			// Fetch PR details with merge state
			const raw = await gh([
				"pr",
				"view",
				String(pr.number),
				"--repo",
				repoFlag(pr),
				"--json",
				"mergeable,reviewDecision,mergeStateStatus,isDraft",
			]);

			const data: {
				mergeable: string;
				reviewDecision: string;
				mergeStateStatus: string;
				isDraft: boolean;
			} = JSON.parse(raw);

			// CI
			const ciStatus = await this.getCISummary(pr);
			const ciPassing =
				ciStatus === CI_STATUS.PASSING || ciStatus === CI_STATUS.NONE;
			if (!ciPassing) {
				blockers.push(`CI is ${ciStatus}`);
			}

			// Reviews
			const reviewDecision = (data.reviewDecision ?? "").toUpperCase();
			const approved = reviewDecision === "APPROVED";
			if (reviewDecision === "CHANGES_REQUESTED") {
				blockers.push("Changes requested in review");
			} else if (reviewDecision === "REVIEW_REQUIRED") {
				blockers.push("Review required");
			}

			// Conflicts / merge state
			const mergeable = (data.mergeable ?? "").toUpperCase();
			const mergeState = (data.mergeStateStatus ?? "").toUpperCase();
			const noConflicts = mergeable === "MERGEABLE";
			if (mergeable === "CONFLICTING") {
				blockers.push("Merge conflicts");
			} else if (mergeable === "UNKNOWN" || mergeable === "") {
				blockers.push("Merge status unknown (GitHub is computing)");
			}
			if (mergeState === "BEHIND") {
				blockers.push("Branch is behind base branch");
			} else if (mergeState === "BLOCKED") {
				blockers.push("Merge is blocked by branch protection");
			} else if (mergeState === "UNSTABLE") {
				blockers.push("Required checks are failing");
			}

			// Draft
			if (data.isDraft) {
				blockers.push("PR is still a draft");
			}

			return {
				mergeable: blockers.length === 0,
				ciPassing,
				approved,
				noConflicts,
				blockers,
			};
		},
	};
}

// ---------------------------------------------------------------------------
// Plugin module export
// ---------------------------------------------------------------------------

export const manifest = {
	name: "github",
	slot: "scm" as const,
	description: "SCM plugin: GitHub PRs, CI checks, reviews, merge readiness",
	version: "0.1.0",
};

export function create(): SCM {
	return createGitHubSCM();
}

export default { manifest, create } satisfies PluginModule<SCM>;

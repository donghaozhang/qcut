import type {
	AutomatedComment,
	PRInfo,
	ReviewComment,
	ReviewDecision,
	SCM,
} from "./types.js";

export interface PRFeedbackActionItem {
	id: string;
	source: "review_decision" | "human_comment" | "automated_comment";
	summary: string;
	url?: string;
	path?: string;
	line?: number;
	severity?: "error" | "warning" | "info";
}

export interface PRFeedbackSweepResult {
	reviewDecision: ReviewDecision;
	pendingComments: ReviewComment[];
	automatedComments: AutomatedComment[];
	actionableHumanComments: ReviewComment[];
	actionableAutomatedComments: AutomatedComment[];
	actionableItems: PRFeedbackActionItem[];
	actionableCount: number;
	hasBlockingFeedback: boolean;
}

function toAutomatedSummary({ comment }: { comment: AutomatedComment }): string {
	const location =
		comment.path && comment.line != null
			? `${comment.path}:${String(comment.line)}`
			: comment.path ?? "repository";
	return `${comment.botName} (${comment.severity}) at ${location}`;
}

function toHumanSummary({ comment }: { comment: ReviewComment }): string {
	const location =
		comment.path && comment.line != null
			? `${comment.path}:${String(comment.line)}`
			: comment.path ?? "general";
	return `${comment.author} at ${location}`;
}

export async function collectPRFeedbackSweep({
	scm,
	pr,
}: {
	scm: Pick<
		SCM,
		"getReviewDecision" | "getPendingComments" | "getAutomatedComments"
	>;
	pr: PRInfo;
}): Promise<PRFeedbackSweepResult> {
	try {
		const [reviewDecision, pendingComments, automatedComments] =
			await Promise.all([
				scm.getReviewDecision(pr),
				scm.getPendingComments(pr),
				scm.getAutomatedComments(pr),
			]);

		const actionableHumanComments = pendingComments.filter(
			(comment) => !comment.isResolved
		);
		const actionableAutomatedComments = automatedComments.filter(
			(comment) => comment.severity !== "info"
		);

		const actionableItems: PRFeedbackActionItem[] = [];
		if (reviewDecision === "changes_requested") {
			actionableItems.push({
				id: "review-decision",
				source: "review_decision",
				summary: "Review decision is CHANGES_REQUESTED",
			});
		}

		for (const comment of actionableHumanComments) {
			actionableItems.push({
				id: comment.id,
				source: "human_comment",
				summary: toHumanSummary({ comment }),
				url: comment.url,
				path: comment.path,
				line: comment.line,
			});
		}

		for (const comment of actionableAutomatedComments) {
			actionableItems.push({
				id: comment.id,
				source: "automated_comment",
				summary: toAutomatedSummary({ comment }),
				url: comment.url,
				path: comment.path,
				line: comment.line,
				severity: comment.severity,
			});
		}

		const actionableCount = actionableItems.length;
		const hasBlockingFeedback = actionableCount > 0;

		return {
			reviewDecision,
			pendingComments,
			automatedComments,
			actionableHumanComments,
			actionableAutomatedComments,
			actionableItems,
			actionableCount,
			hasBlockingFeedback,
		};
	} catch (error) {
		throw new Error(
			`Failed to collect PR feedback sweep for PR #${String(pr.number)}: ${error}`,
			{ cause: error }
		);
	}
}

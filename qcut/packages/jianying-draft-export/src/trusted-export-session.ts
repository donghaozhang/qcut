import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import {
	buildJianyingDraft,
	type JianyingDraftIssue,
} from "@qcut/editor-core/jianying-draft";
import { normalizeCommitRequest } from "./commit-runtime-validation.js";
import type { NormalizedStandaloneJianyingDraftPlanRequest } from "./runtime-validation.js";
import { createJianyingDraftIssueFingerprint } from "./writer.js";

const DEFAULT_MAX_STORED_PLANS = 128;
const DEFAULT_PLAN_TTL_MILLISECONDS = 5 * 60 * 1000;
const MAX_PLAN_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface TrustedJianyingDraftExportPlan {
	blockerFingerprints: readonly string[];
	canCommit: boolean;
	expiresAtUnixMilliseconds: number;
	issueSetFingerprint: string;
	issues: readonly Readonly<JianyingDraftIssue>[];
	planToken: string;
	requestFingerprint: string;
	warningFingerprints: readonly string[];
}

export class StandaloneJianyingDraftPlanNotFoundError extends Error {
	constructor() {
		super("JianYing export plan was not found.");
		this.name = "StandaloneJianyingDraftPlanNotFoundError";
	}
}

export class StandaloneJianyingDraftPlanExpiredError extends Error {
	constructor() {
		super("JianYing export plan has expired.");
		this.name = "StandaloneJianyingDraftPlanExpiredError";
	}
}

export class StandaloneJianyingDraftPlanConsumedError extends Error {
	constructor() {
		super("JianYing export plan has already been consumed.");
		this.name = "StandaloneJianyingDraftPlanConsumedError";
	}
}

export class StandaloneJianyingDraftPlanBlockedError extends Error {
	readonly blockerFingerprints: readonly string[];

	constructor({ blockerFingerprints }: { blockerFingerprints: string[] }) {
		super("JianYing export plan contains blocking issues.");
		this.name = "StandaloneJianyingDraftPlanBlockedError";
		this.blockerFingerprints = Object.freeze([...blockerFingerprints]);
	}
}

export class StandaloneJianyingDraftWarningAcceptanceError extends Error {
	readonly requiredWarningFingerprints: readonly string[];

	constructor({
		requiredWarningFingerprints,
	}: {
		requiredWarningFingerprints: string[];
	}) {
		super("JianYing export requires exact acceptance of the planned warnings.");
		this.name = "StandaloneJianyingDraftWarningAcceptanceError";
		this.requiredWarningFingerprints = Object.freeze([
			...requiredWarningFingerprints,
		]);
	}
}

export class StandaloneJianyingDraftPlanStateChangedError extends Error {
	constructor() {
		super("JianYing export plan no longer matches its immutable preflight.");
		this.name = "StandaloneJianyingDraftPlanStateChangedError";
	}
}

interface StoredPlan {
	blockerFingerprints: string[];
	expiresAtUnixMilliseconds: number;
	issueSetFingerprint: string;
	normalizedRequest: NormalizedStandaloneJianyingDraftPlanRequest;
	requestFingerprint: string;
	status: "consumed" | "ready";
	warningFingerprints: string[];
}

interface TrustedJianyingDraftExportSessionCoreOptions<Result> {
	maxStoredPlans?: number;
	normalizePlanRequest: ({
		input,
		nowUnixMilliseconds,
	}: {
		input: unknown;
		nowUnixMilliseconds: number;
	}) => Promise<NormalizedStandaloneJianyingDraftPlanRequest>;
	planTtlMilliseconds?: number;
	trustedBinding: Readonly<Record<string, unknown>>;
	write: ({
		acceptedWarningFingerprints,
		request,
	}: {
		acceptedWarningFingerprints: readonly string[];
		request: NormalizedStandaloneJianyingDraftPlanRequest;
	}) => Promise<Result>;
}

function createSha256({ value }: { value: string }): string {
	return createHash("sha256").update(value).digest("hex");
}

function createRequestFingerprint({
	request,
	trustedBinding,
}: {
	request: NormalizedStandaloneJianyingDraftPlanRequest;
	trustedBinding: Readonly<Record<string, unknown>>;
}): string {
	return createSha256({
		value: JSON.stringify({ request, trustedBinding }),
	});
}

function getIssueFingerprints({
	issues,
	severity,
}: {
	issues: JianyingDraftIssue[];
	severity: JianyingDraftIssue["severity"];
}): string[] {
	return issues
		.filter((issue) => issue.severity === severity)
		.map((issue) => createJianyingDraftIssueFingerprint({ issue }))
		.sort();
}

function createIssueSetFingerprint({
	issues,
}: {
	issues: JianyingDraftIssue[];
}): string {
	const identities = issues
		.map(
			(issue) =>
				`${issue.severity}\u001e${createJianyingDraftIssueFingerprint({
					issue,
				})}`
		)
		.sort();
	return createSha256({ value: identities.join("\u001d") });
}

function cloneIssues({
	issues,
}: {
	issues: JianyingDraftIssue[];
}): readonly Readonly<JianyingDraftIssue>[] {
	return Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
}

function arraysEqual({
	left,
	right,
}: {
	left: readonly string[];
	right: readonly string[];
}): boolean {
	if (left.length !== right.length) return false;
	return left.every((value, index) => value === right[index]);
}

function validateSessionLimits({
	maxStoredPlans,
	planTtlMilliseconds,
}: {
	maxStoredPlans: number;
	planTtlMilliseconds: number;
}): void {
	if (
		!Number.isSafeInteger(maxStoredPlans) ||
		maxStoredPlans < 1 ||
		maxStoredPlans > 10_000
	) {
		throw new Error(
			"JianYing maxStoredPlans must be an integer between 1 and 10000."
		);
	}
	if (
		!Number.isSafeInteger(planTtlMilliseconds) ||
		planTtlMilliseconds < 1 ||
		planTtlMilliseconds > MAX_PLAN_TTL_MILLISECONDS
	) {
		throw new Error(
			`JianYing planTtlMilliseconds must be an integer between 1 and ${MAX_PLAN_TTL_MILLISECONDS}.`
		);
	}
}

export class TrustedJianyingDraftExportSessionCore<Result> {
	readonly #maxStoredPlans: number;
	readonly #normalizePlanRequest: TrustedJianyingDraftExportSessionCoreOptions<Result>["normalizePlanRequest"];
	readonly #plans = new Map<string, StoredPlan>();
	readonly #planTtlMilliseconds: number;
	readonly #trustedBinding: Readonly<Record<string, unknown>>;
	readonly #write: TrustedJianyingDraftExportSessionCoreOptions<Result>["write"];

	constructor({
		maxStoredPlans = DEFAULT_MAX_STORED_PLANS,
		normalizePlanRequest,
		planTtlMilliseconds = DEFAULT_PLAN_TTL_MILLISECONDS,
		trustedBinding,
		write,
	}: TrustedJianyingDraftExportSessionCoreOptions<Result>) {
		validateSessionLimits({ maxStoredPlans, planTtlMilliseconds });
		this.#maxStoredPlans = maxStoredPlans;
		this.#normalizePlanRequest = normalizePlanRequest;
		this.#planTtlMilliseconds = planTtlMilliseconds;
		this.#trustedBinding = Object.freeze({ ...trustedBinding });
		this.#write = write;
	}

	#prunePlans({ nowUnixMilliseconds }: { nowUnixMilliseconds: number }): void {
		for (const [token, plan] of this.#plans) {
			if (plan.expiresAtUnixMilliseconds <= nowUnixMilliseconds) {
				this.#plans.delete(token);
			}
		}
		while (this.#plans.size >= this.#maxStoredPlans) {
			const consumedToken = [...this.#plans.entries()].find(
				([, plan]) => plan.status === "consumed"
			)?.[0];
			if (!consumedToken) {
				throw new Error(
					"JianYing export session has too many outstanding plans."
				);
			}
			this.#plans.delete(consumedToken);
		}
	}

	#createPlanToken(): string {
		let token = randomBytes(32).toString("base64url");
		while (this.#plans.has(token)) {
			token = randomBytes(32).toString("base64url");
		}
		return token;
	}

	async plan({
		input,
	}: {
		input: unknown;
	}): Promise<TrustedJianyingDraftExportPlan> {
		const nowUnixMilliseconds = Date.now();
		this.#prunePlans({ nowUnixMilliseconds });
		const normalizedRequest = await this.#normalizePlanRequest({
			input,
			nowUnixMilliseconds,
		});
		const requestFingerprint = createRequestFingerprint({
			request: normalizedRequest,
			trustedBinding: this.#trustedBinding,
		});
		const preflight = buildJianyingDraft({
			createdAtUnixSeconds: normalizedRequest.createdAtUnixSeconds,
			draftOutputDirectory: join(
				normalizedRequest.outputParentDirectory,
				`.qcut-jianying-plan-${requestFingerprint.slice(0, 16)}`
			),
			snapshot: normalizedRequest.snapshot,
			targetPlatform: normalizedRequest.targetPlatform,
		});
		const warningFingerprints = getIssueFingerprints({
			issues: preflight.issues,
			severity: "warning",
		});
		const blockerFingerprints = getIssueFingerprints({
			issues: preflight.issues,
			severity: "error",
		});
		const issueSetFingerprint = createIssueSetFingerprint({
			issues: preflight.issues,
		});
		const plannedAtUnixMilliseconds = Date.now();
		const expiresAtUnixMilliseconds =
			plannedAtUnixMilliseconds + this.#planTtlMilliseconds;
		this.#prunePlans({ nowUnixMilliseconds: plannedAtUnixMilliseconds });
		const planToken = this.#createPlanToken();
		this.#plans.set(planToken, {
			blockerFingerprints,
			expiresAtUnixMilliseconds,
			issueSetFingerprint,
			normalizedRequest,
			requestFingerprint,
			status: "ready",
			warningFingerprints,
		});
		return Object.freeze({
			blockerFingerprints: Object.freeze([...blockerFingerprints]),
			canCommit: blockerFingerprints.length === 0,
			expiresAtUnixMilliseconds,
			issueSetFingerprint,
			issues: cloneIssues({ issues: preflight.issues }),
			planToken,
			requestFingerprint,
			warningFingerprints: Object.freeze([...warningFingerprints]),
		});
	}

	async commit({ input }: { input: unknown }): Promise<Result> {
		const commitRequest = normalizeCommitRequest({ input });
		const plan = this.#plans.get(commitRequest.planToken);
		if (!plan) {
			throw new StandaloneJianyingDraftPlanNotFoundError();
		}
		const nowUnixMilliseconds = Date.now();
		if (plan.expiresAtUnixMilliseconds <= nowUnixMilliseconds) {
			this.#plans.delete(commitRequest.planToken);
			throw new StandaloneJianyingDraftPlanExpiredError();
		}
		if (plan.status === "consumed") {
			throw new StandaloneJianyingDraftPlanConsumedError();
		}
		plan.status = "consumed";

		const preflight = buildJianyingDraft({
			createdAtUnixSeconds: plan.normalizedRequest.createdAtUnixSeconds,
			draftOutputDirectory: join(
				plan.normalizedRequest.outputParentDirectory,
				`.qcut-jianying-plan-${plan.requestFingerprint.slice(0, 16)}`
			),
			snapshot: plan.normalizedRequest.snapshot,
			targetPlatform: plan.normalizedRequest.targetPlatform,
		});
		const currentIssueSetFingerprint = createIssueSetFingerprint({
			issues: preflight.issues,
		});
		if (currentIssueSetFingerprint !== plan.issueSetFingerprint) {
			throw new StandaloneJianyingDraftPlanStateChangedError();
		}
		if (plan.blockerFingerprints.length > 0) {
			throw new StandaloneJianyingDraftPlanBlockedError({
				blockerFingerprints: plan.blockerFingerprints,
			});
		}
		if (
			!arraysEqual({
				left: commitRequest.acceptedWarningFingerprints,
				right: plan.warningFingerprints,
			})
		) {
			throw new StandaloneJianyingDraftWarningAcceptanceError({
				requiredWarningFingerprints: plan.warningFingerprints,
			});
		}

		return this.#write({
			acceptedWarningFingerprints: Object.freeze([...plan.warningFingerprints]),
			request: plan.normalizedRequest,
		});
	}

	dispose(): void {
		this.#plans.clear();
	}
}

/**
 * Private import plan store (JYI-007).
 *
 * In-memory, main-process-only store keyed by plan token. Consumption is
 * compare-and-swap: a token commits at most once, replays throw, expired
 * and build-mismatched plans are refused fail-closed, and capacity is
 * bounded (consumed plans are evicted first; a full store of live plans
 * rejects new ones instead of evicting silently).
 *
 * @module @qcut/jianying-draft-import/import-plan-store
 */

import {
	type ImportPlanArtifactV1,
	type ImportPlanBuildIdentity,
	validateImportPlanArtifact,
} from "./import-plan-artifact.js";

const DEFAULT_MAX_STORED_PLANS = 128;
const MAX_STORED_PLANS_LIMIT = 10_000;

export class ImportPlanNotFoundError extends Error {
	constructor() {
		super("Import plan was not found.");
		this.name = "ImportPlanNotFoundError";
	}
}

export class ImportPlanExpiredError extends Error {
	constructor() {
		super("Import plan has expired.");
		this.name = "ImportPlanExpiredError";
	}
}

export class ImportPlanConsumedError extends Error {
	constructor() {
		super("Import plan has already been consumed.");
		this.name = "ImportPlanConsumedError";
	}
}

export class ImportPlanBuildMismatchError extends Error {
	readonly reasons: readonly string[];

	constructor({ reasons }: { reasons: readonly string[] }) {
		super("Import plan no longer matches this build.");
		this.name = "ImportPlanBuildMismatchError";
		this.reasons = Object.freeze([...reasons]);
	}
}

export class ImportPlanStoreFullError extends Error {
	constructor() {
		super("Import plan store has too many outstanding plans.");
		this.name = "ImportPlanStoreFullError";
	}
}

interface StoredImportPlan {
	artifact: ImportPlanArtifactV1;
	status: "ready" | "consumed";
}

export class ImportPlanStore {
	readonly #buildIdentity: ImportPlanBuildIdentity;
	readonly #maxStoredPlans: number;
	readonly #now: () => number;
	readonly #plans = new Map<string, StoredImportPlan>();

	constructor({
		buildIdentity,
		maxStoredPlans = DEFAULT_MAX_STORED_PLANS,
		now = Date.now,
	}: {
		buildIdentity: ImportPlanBuildIdentity;
		maxStoredPlans?: number;
		/** Injectable clock for TTL tests. */
		now?: () => number;
	}) {
		if (
			!Number.isSafeInteger(maxStoredPlans) ||
			maxStoredPlans < 1 ||
			maxStoredPlans > MAX_STORED_PLANS_LIMIT
		) {
			throw new Error(
				`Import maxStoredPlans must be an integer between 1 and ${MAX_STORED_PLANS_LIMIT}.`
			);
		}
		this.#buildIdentity = { ...buildIdentity };
		this.#maxStoredPlans = maxStoredPlans;
		this.#now = now;
	}

	#purgeExpired({
		nowUnixMilliseconds,
	}: {
		nowUnixMilliseconds: number;
	}): void {
		for (const [token, stored] of this.#plans) {
			if (stored.artifact.expiresAtUnixMilliseconds <= nowUnixMilliseconds) {
				this.#plans.delete(token);
			}
		}
	}

	/** Stores a freshly created artifact. Throws when the store is full. */
	put({ artifact }: { artifact: ImportPlanArtifactV1 }): void {
		const nowUnixMilliseconds = this.#now();
		this.#purgeExpired({ nowUnixMilliseconds });
		if (this.#plans.has(artifact.planToken)) {
			throw new Error("Import plan token is already stored.");
		}
		while (this.#plans.size >= this.#maxStoredPlans) {
			const consumedToken = [...this.#plans.entries()].find(
				([, stored]) => stored.status === "consumed"
			)?.[0];
			if (consumedToken === undefined) {
				throw new ImportPlanStoreFullError();
			}
			this.#plans.delete(consumedToken);
		}
		this.#plans.set(artifact.planToken, { artifact, status: "ready" });
	}

	#getValidated({ planToken }: { planToken: string }): StoredImportPlan {
		const stored = this.#plans.get(planToken);
		if (stored === undefined) {
			throw new ImportPlanNotFoundError();
		}
		const nowUnixMilliseconds = this.#now();
		const reasons = validateImportPlanArtifact({
			artifact: stored.artifact,
			buildIdentity: this.#buildIdentity,
			nowUnixMilliseconds,
		});
		if (reasons.includes("expired")) {
			this.#plans.delete(planToken);
			throw new ImportPlanExpiredError();
		}
		if (reasons.length > 0) {
			this.#plans.delete(planToken);
			throw new ImportPlanBuildMismatchError({ reasons });
		}
		return stored;
	}

	/** Read-only peek; never changes plan state. */
	get({ planToken }: { planToken: string }): ImportPlanArtifactV1 {
		return this.#getValidated({ planToken }).artifact;
	}

	/**
	 * Single-shot CAS consume: the first caller receives the artifact, every
	 * later (or concurrent) caller gets ImportPlanConsumedError.
	 */
	consume({ planToken }: { planToken: string }): ImportPlanArtifactV1 {
		const stored = this.#getValidated({ planToken });
		if (stored.status === "consumed") {
			throw new ImportPlanConsumedError();
		}
		stored.status = "consumed";
		return stored.artifact;
	}

	/** Number of live (unexpired) plans currently stored. */
	get size(): number {
		this.#purgeExpired({ nowUnixMilliseconds: this.#now() });
		return this.#plans.size;
	}

	dispose(): void {
		this.#plans.clear();
	}
}

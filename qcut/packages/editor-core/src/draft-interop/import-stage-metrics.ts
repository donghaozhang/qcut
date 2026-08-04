export const IMPORT_PLAN_STAGE_IDS = [
	"request-validation",
	"source-discovery",
	"snapshot-read",
	"profile-detection",
	"document-normalization",
	"asset-resolution",
	"timeline-mapping",
	"bundle-validation",
	"plan-persistence",
] as const;

export const IMPORT_RENDERER_STAGE_IDS = [
	"bundle-validation",
	"digest-verification",
	"envelope-validation",
	"quota-check",
	"project-identity",
	"journal-begin",
	"media-staging",
	"timeline-staging",
	"staged-verification",
	"envelope-persistence",
	"project-publish",
	"rollback",
] as const;

export type ImportPlanStageId = (typeof IMPORT_PLAN_STAGE_IDS)[number];
export type ImportRendererStageId = (typeof IMPORT_RENDERER_STAGE_IDS)[number];
export type ImportStageMetricsPhase = "runtime-plan" | "renderer-commit";

export interface ImportStageMeasurementV1 {
	durationMilliseconds: number;
	invocationCount: number;
}

export interface ImportStageMetricsV1<TStage extends string = string> {
	schemaVersion: 1;
	phase: ImportStageMetricsPhase;
	measuredDurationMilliseconds: number;
	stages: Partial<Record<TStage, ImportStageMeasurementV1>>;
}

function boundedDuration({
	endedAt,
	startedAt,
}: {
	endedAt: number;
	startedAt: number;
}): number {
	const elapsed = endedAt - startedAt;
	if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
	return Math.min(Number.MAX_SAFE_INTEGER, Math.round(elapsed * 1000) / 1000);
}

export class ImportStageMetricsRecorder<TStage extends string> {
	readonly #now: () => number;
	readonly #phase: ImportStageMetricsPhase;
	readonly #stages = new Map<TStage, ImportStageMeasurementV1>();

	constructor({
		now,
		phase,
	}: {
		now: () => number;
		phase: ImportStageMetricsPhase;
	}) {
		this.#now = now;
		this.#phase = phase;
	}

	measureSync<TResult>({
		run,
		stage,
	}: {
		run: () => TResult;
		stage: TStage;
	}): TResult {
		const startedAt = this.#now();
		try {
			return run();
		} finally {
			this.#record({ endedAt: this.#now(), stage, startedAt });
		}
	}

	async measure<TResult>({
		run,
		stage,
	}: {
		run: () => Promise<TResult>;
		stage: TStage;
	}): Promise<TResult> {
		const startedAt = this.#now();
		try {
			return await run();
		} finally {
			this.#record({ endedAt: this.#now(), stage, startedAt });
		}
	}

	snapshot(): ImportStageMetricsV1<TStage> {
		const stages: Partial<Record<TStage, ImportStageMeasurementV1>> = {};
		let measuredDurationMilliseconds = 0;
		for (const [stage, measurement] of this.#stages) {
			stages[stage] = { ...measurement };
			measuredDurationMilliseconds = Math.min(
				Number.MAX_SAFE_INTEGER,
				measuredDurationMilliseconds + measurement.durationMilliseconds
			);
		}
		return {
			schemaVersion: 1,
			phase: this.#phase,
			measuredDurationMilliseconds,
			stages,
		};
	}

	#record({
		endedAt,
		stage,
		startedAt,
	}: {
		endedAt: number;
		stage: TStage;
		startedAt: number;
	}): void {
		const durationMilliseconds = boundedDuration({ endedAt, startedAt });
		const previous = this.#stages.get(stage);
		this.#stages.set(stage, {
			durationMilliseconds: Math.min(
				Number.MAX_SAFE_INTEGER,
				(previous?.durationMilliseconds ?? 0) + durationMilliseconds
			),
			invocationCount: Math.min(
				Number.MAX_SAFE_INTEGER,
				(previous?.invocationCount ?? 0) + 1
			),
		});
	}
}

import { isAbsolute, resolve } from "node:path";
import {
	normalizeStandaloneJianyingDraftPlanRequest,
	type NormalizedStandaloneJianyingDraftPlanRequest,
} from "./runtime-validation.js";
import {
	StandaloneJianyingDraftPlanBlockedError,
	StandaloneJianyingDraftPlanConsumedError,
	StandaloneJianyingDraftPlanExpiredError,
	StandaloneJianyingDraftPlanNotFoundError,
	StandaloneJianyingDraftPlanStateChangedError,
	StandaloneJianyingDraftWarningAcceptanceError,
	TrustedJianyingDraftExportSessionCore,
	type TrustedJianyingDraftExportPlan,
} from "./trusted-export-session.js";
import {
	type StandaloneJianyingDraftWriteResult,
	writeStandaloneJianyingDraft,
} from "./writer.js";

export interface StandaloneJianyingDraftExportSessionOptions {
	/** Main-owned executable path; never accept it from renderer IPC. */
	ffprobePath: string;
	ffprobeTimeoutMilliseconds?: number;
	maxStoredPlans?: number;
	planTtlMilliseconds?: number;
}

export type StandaloneJianyingDraftExportPlan = TrustedJianyingDraftExportPlan;

export {
	StandaloneJianyingDraftPlanBlockedError,
	StandaloneJianyingDraftPlanConsumedError,
	StandaloneJianyingDraftPlanExpiredError,
	StandaloneJianyingDraftPlanNotFoundError,
	StandaloneJianyingDraftPlanStateChangedError,
	StandaloneJianyingDraftWarningAcceptanceError,
};

interface BoundWriterOptions {
	ffprobePath: string;
	ffprobeTimeoutMilliseconds?: number;
}

function validateWriterOptions({
	writerOptions,
}: {
	writerOptions: BoundWriterOptions;
}): void {
	if (
		typeof writerOptions.ffprobePath !== "string" ||
		writerOptions.ffprobePath.trim().length === 0
	) {
		throw new Error("Standalone JianYing ffprobePath must not be empty.");
	}
	if (!isAbsolute(writerOptions.ffprobePath)) {
		throw new Error("Standalone JianYing ffprobePath must be absolute.");
	}
	if (
		writerOptions.ffprobeTimeoutMilliseconds !== undefined &&
		(!Number.isFinite(writerOptions.ffprobeTimeoutMilliseconds) ||
			writerOptions.ffprobeTimeoutMilliseconds <= 0 ||
			writerOptions.ffprobeTimeoutMilliseconds > 120_000)
	) {
		throw new Error(
			"Standalone JianYing ffprobeTimeoutMilliseconds must be between 1 and 120000."
		);
	}
}

function writeStandaloneExport({
	acceptedWarningFingerprints,
	request,
	writerOptions,
}: {
	acceptedWarningFingerprints: readonly string[];
	request: NormalizedStandaloneJianyingDraftPlanRequest;
	writerOptions: BoundWriterOptions;
}): Promise<StandaloneJianyingDraftWriteResult> {
	return writeStandaloneJianyingDraft({
		acceptedWarningFingerprints: [...acceptedWarningFingerprints],
		createdAtUnixSeconds: request.createdAtUnixSeconds,
		draftName: request.draftName,
		outputParentDirectory: request.outputParentDirectory,
		snapshot: request.snapshot,
		targetPlatform: request.targetPlatform,
		...writerOptions,
	});
}

export class StandaloneJianyingDraftExportSession {
	readonly #core: TrustedJianyingDraftExportSessionCore<StandaloneJianyingDraftWriteResult>;

	constructor(options: StandaloneJianyingDraftExportSessionOptions);
	constructor(
		{
			ffprobePath,
			ffprobeTimeoutMilliseconds,
			maxStoredPlans,
			planTtlMilliseconds,
		}: StandaloneJianyingDraftExportSessionOptions = {
			ffprobePath: "",
		}
	) {
		validateWriterOptions({
			writerOptions: {
				ffprobePath,
				...(ffprobeTimeoutMilliseconds === undefined
					? {}
					: { ffprobeTimeoutMilliseconds }),
			},
		});
		const writerOptions: BoundWriterOptions = Object.freeze({
			ffprobePath: resolve(ffprobePath),
			...(ffprobeTimeoutMilliseconds === undefined
				? {}
				: { ffprobeTimeoutMilliseconds }),
		});
		this.#core = new TrustedJianyingDraftExportSessionCore({
			...(maxStoredPlans === undefined ? {} : { maxStoredPlans }),
			normalizePlanRequest: normalizeStandaloneJianyingDraftPlanRequest,
			...(planTtlMilliseconds === undefined ? {} : { planTtlMilliseconds }),
			trustedBinding: Object.freeze({
				exportKind: "standalone",
				writerOptions,
			}),
			write: ({ acceptedWarningFingerprints, request }) =>
				writeStandaloneExport({
					acceptedWarningFingerprints,
					request,
					writerOptions,
				}),
		});
	}

	plan({
		input,
	}: {
		input: unknown;
	}): Promise<StandaloneJianyingDraftExportPlan> {
		return this.#core.plan({ input });
	}

	commit({
		input,
	}: {
		input: unknown;
	}): Promise<StandaloneJianyingDraftWriteResult> {
		return this.#core.commit({ input });
	}

	dispose(): void {
		this.#core.dispose();
	}
}

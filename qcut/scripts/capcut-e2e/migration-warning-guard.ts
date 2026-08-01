import type { ExpectedMigrationWarning } from "./migration-case-builder.js";
import type { MigrationExportPlan } from "./migration-api-contract.js";

function createWarningIdentity({
	warning,
}: {
	warning: ExpectedMigrationWarning;
}): string {
	return JSON.stringify({
		code: warning.code,
		elementId: warning.elementId ?? null,
		mediaId: warning.mediaId ?? null,
		message: warning.message,
		trackId: warning.trackId ?? null,
	});
}

export function assertPlanMatchesWarningAllowlist({
	allowedWarnings,
	caseId,
	plan,
}: {
	allowedWarnings: readonly ExpectedMigrationWarning[];
	caseId: string;
	plan: MigrationExportPlan;
}): void {
	const errors = plan.issues.filter(({ severity }) => severity === "error");
	if (
		errors.length > 0 ||
		!plan.canCommit ||
		plan.blockerFingerprints.length > 0
	) {
		throw new Error(
			`${caseId} migration plan is blocked: ${errors
				.map(({ code, message }) => `${code}: ${message}`)
				.join(" | ")}`
		);
	}
	const actualWarningIdentities = plan.issues
		.filter(({ severity }) => severity === "warning")
		.map((warning) => createWarningIdentity({ warning }))
		.sort();
	const expectedWarningIdentities = allowedWarnings
		.map((warning) => createWarningIdentity({ warning }))
		.sort();
	if (
		JSON.stringify(actualWarningIdentities) !==
		JSON.stringify(expectedWarningIdentities)
	) {
		throw new Error(
			`${caseId} warning allowlist changed; expected ${JSON.stringify(expectedWarningIdentities)}, received ${JSON.stringify(actualWarningIdentities)}.`
		);
	}
	if (plan.warningFingerprints.length !== actualWarningIdentities.length) {
		throw new Error(
			`${caseId} warning fingerprints do not match its warnings.`
		);
	}
}

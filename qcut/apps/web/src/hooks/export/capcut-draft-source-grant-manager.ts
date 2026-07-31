import { cleanupCapCutDraftSourceGrants } from "@/lib/jianying-draft/capcut-draft-source-staging";
import type { CapCutDraftSourceGrant } from "@/lib/jianying-draft/capcut-draft-source-staging";
import type { ElectronAPI } from "@/types/electron/electron-api";
import type { JianyingDraftIssueDto } from "@/types/electron/api-jianying-draft-export";

type MediaImportAPI = NonNullable<ElectronAPI["mediaImport"]>;

export class CapCutDraftSourceGrantManager {
	readonly #deferredCleanupOperationIds = new Set<number>();
	readonly #grantsByOperation = new Map<number, CapCutDraftSourceGrant[]>();
	#commitOperationId: number | null = null;

	beginCommit({ operationId }: { operationId: number }): boolean {
		if (this.#commitOperationId !== null) return false;
		this.#commitOperationId = operationId;
		return true;
	}

	hasCommitInFlight(): boolean {
		return this.#commitOperationId !== null;
	}

	retain({
		grants,
		operationId,
	}: {
		grants: readonly CapCutDraftSourceGrant[];
		operationId: number;
	}): void {
		if (grants.length === 0) return;
		const existing = this.#grantsByOperation.get(operationId) ?? [];
		this.#grantsByOperation.set(operationId, [...existing, ...grants]);
	}

	async cleanupOperation({
		mediaImport,
		operationId,
	}: {
		mediaImport: MediaImportAPI | undefined;
		operationId: number;
	}): Promise<JianyingDraftIssueDto[]> {
		const grants = this.#grantsByOperation.get(operationId) ?? [];
		this.#grantsByOperation.delete(operationId);
		if (grants.length === 0) return [];
		if (!mediaImport) {
			this.retain({ grants, operationId });
			return grants.map(({ grantMediaId, mediaId }) => ({
				code: "SOURCE_STAGING_CLEANUP_FAILED",
				mediaId,
				message: `Temporary export source ${grantMediaId} could not be removed because media import is unavailable.`,
				severity: "warning" as const,
			}));
		}
		const issues = await cleanupCapCutDraftSourceGrants({
			grants,
			mediaImport,
		});
		if (issues.length > 0) {
			this.retain({ grants, operationId });
		}
		return issues;
	}

	async cleanupKnown({
		maximumOperationId,
		mediaImport,
	}: {
		maximumOperationId: number;
		mediaImport: MediaImportAPI | undefined;
	}): Promise<JianyingDraftIssueDto[]> {
		const operationIds = [...this.#grantsByOperation.keys()].filter(
			(operationId) => operationId <= maximumOperationId
		);
		const issueGroups = await Promise.all(
			operationIds.map((operationId) =>
				this.requestCleanup({ mediaImport, operationId })
			)
		);
		return issueGroups.flat();
	}

	async finishCommit({
		mediaImport,
		operationId,
	}: {
		mediaImport: MediaImportAPI | undefined;
		operationId: number;
	}): Promise<JianyingDraftIssueDto[]> {
		if (this.#commitOperationId !== operationId) return [];
		this.#commitOperationId = null;
		if (!this.#deferredCleanupOperationIds.delete(operationId)) return [];
		return this.cleanupOperation({ mediaImport, operationId });
	}

	private async requestCleanup({
		mediaImport,
		operationId,
	}: {
		mediaImport: MediaImportAPI | undefined;
		operationId: number;
	}): Promise<JianyingDraftIssueDto[]> {
		if (this.#commitOperationId === operationId) {
			this.#deferredCleanupOperationIds.add(operationId);
			return [];
		}
		return this.cleanupOperation({ mediaImport, operationId });
	}
}

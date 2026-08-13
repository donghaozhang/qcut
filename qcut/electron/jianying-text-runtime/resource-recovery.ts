import os from "node:os";
import path from "node:path";
import type { JianyingTextRuntimeDependencyRole } from "../jianying-text-runtime-contract.js";
import {
	findJianyingTextResourceCatalogCandidates,
	type JianyingTextResourceCatalogCandidate,
} from "./resource-catalog.js";
import {
	extractValidatedJianyingResourceArchive,
	installJianyingTextCatalogCandidate,
	isTrustedJianyingResourceUrl,
	type JianyingTextResourceRecoveryResult,
	type ResourceArchiveExtractor,
	type ResourceFetcher,
	validateJianyingRecoveryArchiveEntry,
} from "./resource-recovery-installer.js";

export {
	extractValidatedJianyingResourceArchive,
	isTrustedJianyingResourceUrl,
	validateJianyingRecoveryArchiveEntry,
};
export type { JianyingTextResourceRecoveryResult };

export interface JianyingTextResourceRecoveryRequest {
	resourceId: string;
	role: JianyingTextRuntimeDependencyRole;
	expectedPackageHash?: string;
}

const pendingRecoveries = new Map<
	string,
	Promise<JianyingTextResourceRecoveryResult>
>();

export function getJianyingTextRecoveryCacheRoot() {
	return (
		process.env.QCUT_JIANYING_TEXT_RECOVERY_ROOT ??
		path.join(
			os.homedir(),
			"Library",
			"Caches",
			"QCut",
			"jianying-text-runtime",
			"recovered-resources"
		)
	);
}

async function recoverResourceFromCatalog({
	candidates,
	fetchResource,
	extractArchive,
	recoveryRoot,
	request,
}: {
	candidates: JianyingTextResourceCatalogCandidate[];
	fetchResource: ResourceFetcher;
	extractArchive: ResourceArchiveExtractor;
	recoveryRoot: string;
	request: JianyingTextResourceRecoveryRequest;
}) {
	const matchingCandidates = candidates.filter(
		({ packageHash }) =>
			!request.expectedPackageHash ||
			packageHash === request.expectedPackageHash.toLowerCase()
	);
	if (matchingCandidates.length === 0) {
		return {
			resourceId: request.resourceId,
			state: "unavailable",
			reason:
				candidates.length > 0 && request.expectedPackageHash
					? "hash-mismatch"
					: "catalog-missing",
		} satisfies JianyingTextResourceRecoveryResult;
	}
	let reason: NonNullable<JianyingTextResourceRecoveryResult["reason"]> =
		"download-failed";
	for (const candidate of matchingCandidates) {
		const result = await installJianyingTextCatalogCandidate({
			candidate,
			fetchResource,
			extractArchive,
			recoveryRoot,
			role: request.role,
		});
		if (result.state !== "unavailable") return result;
		if (result.reason === "package-invalid") reason = "package-invalid";
		if (result.reason === "hash-mismatch" && reason === "download-failed") {
			reason = "hash-mismatch";
		}
	}
	return {
		resourceId: request.resourceId,
		state: "unavailable",
		reason,
	} satisfies JianyingTextResourceRecoveryResult;
}

function recoveryKey({
	recoveryRoot,
	request,
}: {
	recoveryRoot: string;
	request: JianyingTextResourceRecoveryRequest;
}) {
	return [
		recoveryRoot,
		request.role,
		request.resourceId,
		request.expectedPackageHash?.toLowerCase() ?? "latest",
	].join("\0");
}

export async function recoverJianyingTextResources({
	databaseRoot,
	extractArchive = extractValidatedJianyingResourceArchive,
	fetchResource = fetch,
	recoveryRoot = getJianyingTextRecoveryCacheRoot(),
	requests,
}: {
	databaseRoot: string;
	extractArchive?: ResourceArchiveExtractor;
	fetchResource?: ResourceFetcher;
	recoveryRoot?: string;
	requests: JianyingTextResourceRecoveryRequest[];
}) {
	if (requests.length === 0) return [];
	const requestsNeedingCatalog = requests.filter(
		(request) => !pendingRecoveries.has(recoveryKey({ recoveryRoot, request }))
	);
	const catalog = await findJianyingTextResourceCatalogCandidates({
		resourceIds: requestsNeedingCatalog.map(({ resourceId }) => resourceId),
		databaseRoot,
	});
	return Promise.all(
		requests.map((request) => {
			const key = recoveryKey({ recoveryRoot, request });
			const pending = pendingRecoveries.get(key);
			if (pending) return pending;
			const recovery = recoverResourceFromCatalog({
				candidates: catalog.get(request.resourceId) ?? [],
				fetchResource,
				extractArchive,
				recoveryRoot,
				request,
			}).finally(() => pendingRecoveries.delete(key));
			pendingRecoveries.set(key, recovery);
			return recovery;
		})
	);
}

export function recoverJianyingTextResource({
	databaseRoot,
	expectedPackageHash,
	fetchResource = fetch,
	extractArchive = extractValidatedJianyingResourceArchive,
	recoveryRoot = getJianyingTextRecoveryCacheRoot(),
	resourceId,
	role,
}: {
	databaseRoot: string;
	expectedPackageHash?: string;
	fetchResource?: ResourceFetcher;
	extractArchive?: ResourceArchiveExtractor;
	recoveryRoot?: string;
	resourceId: string;
	role: JianyingTextRuntimeDependencyRole;
}) {
	return recoverJianyingTextResources({
		databaseRoot,
		fetchResource,
		extractArchive,
		recoveryRoot,
		requests: [{ resourceId, role, expectedPackageHash }],
	}).then(([result]) => {
		if (!result) {
			throw new Error("Jianying resource recovery returned no result");
		}
		return result;
	});
}

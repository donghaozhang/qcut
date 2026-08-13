import os from "node:os";
import path from "node:path";
import type { JianyingTextRuntimeDependencyRole } from "../jianying-text-runtime-contract.js";
import { findJianyingCachedFontPackageHashes } from "./font-alias-index.js";
import { findJianyingLocalPackagesByHash } from "./local-package-index.js";
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
	sourceCacheRoots,
}: {
	candidates: JianyingTextResourceCatalogCandidate[];
	fetchResource: ResourceFetcher;
	extractArchive: ResourceArchiveExtractor;
	recoveryRoot: string;
	request: JianyingTextResourceRecoveryRequest;
	sourceCacheRoots: string[];
}) {
	const matchingCandidates = candidates.filter(
		({ packageHash }) =>
			!request.expectedPackageHash ||
			packageHash === request.expectedPackageHash.toLowerCase()
	);
	const localFontHashes =
		request.role === "font"
			? await findJianyingCachedFontPackageHashes({
					cacheRoots: sourceCacheRoots,
					resourceId: request.resourceId,
				})
			: [];
	const candidateHashes = new Set(
		matchingCandidates.map(({ packageHash }) => packageHash)
	);
	const localFontCandidates = localFontHashes.flatMap((packageHash) =>
		candidateHashes.has(packageHash) ||
		(request.expectedPackageHash &&
			packageHash !== request.expectedPackageHash.toLowerCase())
			? []
			: [
					{
						resourceId: request.resourceId,
						packageHash,
						downloadUrls: [],
						timestamp: "local-cache-metadata",
					} satisfies JianyingTextResourceCatalogCandidate,
				]
	);
	const recoveryCandidates = [...matchingCandidates, ...localFontCandidates];
	if (recoveryCandidates.length === 0) {
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
	for (const candidate of recoveryCandidates) {
		const sourcePackagePaths = await localCatalogPackagePaths({
			candidate,
			role: request.role,
			sourceCacheRoots,
		});
		const result = await installJianyingTextCatalogCandidate({
			candidate,
			fetchResource,
			extractArchive,
			recoveryRoot,
			role: request.role,
			sourcePackagePaths,
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

async function localCatalogPackagePaths({
	candidate,
	role,
	sourceCacheRoots,
}: {
	candidate: JianyingTextResourceCatalogCandidate;
	role: JianyingTextRuntimeDependencyRole;
	sourceCacheRoots: string[];
}) {
	const resourceIds = Array.from(
		new Set([candidate.catalogResourceId, candidate.resourceId].filter(Boolean))
	) as string[];
	const containers =
		role === "animation"
			? ["effect"]
			: role === "effect-style"
				? ["artistEffect", "effect"]
				: role === "font"
					? ["artistEffect", "effect"]
					: ["effect", "artistEffect"];
	const directPaths = sourceCacheRoots.flatMap((cacheRoot) =>
		containers.flatMap((container) =>
			resourceIds.map((resourceId) =>
				path.join(cacheRoot, container, resourceId, candidate.packageHash)
			)
		)
	);
	const aliasedPaths = await findJianyingLocalPackagesByHash({
		cacheRoots: sourceCacheRoots,
		containers,
		packageHash: candidate.packageHash,
	});
	return Array.from(new Set([...directPaths, ...aliasedPaths]));
}

function recoveryKey({
	recoveryRoot,
	request,
	sourceCacheRoots,
}: {
	recoveryRoot: string;
	request: JianyingTextResourceRecoveryRequest;
	sourceCacheRoots: string[];
}) {
	return [
		recoveryRoot,
		...sourceCacheRoots.slice().sort(),
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
	sourceCacheRoots = [],
}: {
	databaseRoot: string;
	extractArchive?: ResourceArchiveExtractor;
	fetchResource?: ResourceFetcher;
	recoveryRoot?: string;
	requests: JianyingTextResourceRecoveryRequest[];
	sourceCacheRoots?: string[];
}) {
	if (requests.length === 0) return [];
	const requestsNeedingCatalog = requests.filter(
		(request) =>
			!pendingRecoveries.has(
				recoveryKey({ recoveryRoot, request, sourceCacheRoots })
			)
	);
	const catalog = await findJianyingTextResourceCatalogCandidates({
		resourceIds: requestsNeedingCatalog.map(({ resourceId }) => resourceId),
		databaseRoot,
	});
	return Promise.all(
		requests.map((request) => {
			const key = recoveryKey({ recoveryRoot, request, sourceCacheRoots });
			const pending = pendingRecoveries.get(key);
			if (pending) return pending;
			const recovery = recoverResourceFromCatalog({
				candidates: catalog.get(request.resourceId) ?? [],
				fetchResource,
				extractArchive,
				recoveryRoot,
				request,
				sourceCacheRoots,
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
	sourceCacheRoots = [],
}: {
	databaseRoot: string;
	expectedPackageHash?: string;
	fetchResource?: ResourceFetcher;
	extractArchive?: ResourceArchiveExtractor;
	recoveryRoot?: string;
	resourceId: string;
	role: JianyingTextRuntimeDependencyRole;
	sourceCacheRoots?: string[];
}) {
	return recoverJianyingTextResources({
		databaseRoot,
		fetchResource,
		extractArchive,
		recoveryRoot,
		requests: [{ resourceId, role, expectedPackageHash }],
		sourceCacheRoots,
	}).then(([result]) => {
		if (!result) {
			throw new Error("Jianying resource recovery returned no result");
		}
		return result;
	});
}

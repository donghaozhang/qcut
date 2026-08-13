import path from "node:path";
import type { JianyingEffectStyleInspection } from "../jianying-text-effect-style-contract.js";
import { parseJianyingEffectStylePackage } from "../jianying-text-effect-style-parser.js";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import {
	JianyingTextAnimationPackageError,
	resolveJianyingTextAnimations,
	type ResolvedJianyingTextAnimations,
} from "./animation-package-resolver.js";
import {
	recoverJianyingTextResource,
	recoverJianyingTextResources,
} from "./resource-recovery.js";
import {
	resolveJianyingScriptResources,
	type ResolvedJianyingScriptResources,
} from "./script-dependencies.js";

export function automaticJianyingTextRecoveryEnabled() {
	return process.env.QCUT_JIANYING_TEXT_AUTO_RECOVER !== "0";
}

export function getJianyingTextResourceDatabaseRoot({
	cacheRoot,
}: {
	cacheRoot: string;
}) {
	return (
		process.env.QCUT_JIANYING_TEXT_RESOURCE_DATABASE_ROOT ??
		path.join(cacheRoot, "ressdk_db")
	);
}

export async function recoverJianyingTextRootPackage({
	cacheRoot,
	recoveryRoot,
	reference,
}: {
	cacheRoot: string;
	recoveryRoot: string;
	reference: JianyingTextRuntimeReference;
}) {
	if (!automaticJianyingTextRecoveryEnabled()) return null;
	const recovered = await recoverJianyingTextResource({
		resourceId: reference.resourceId,
		role: reference.packageKind === "TextStyle" ? "effect-style" : "sticker",
		expectedPackageHash: reference.packageHash,
		databaseRoot: getJianyingTextResourceDatabaseRoot({ cacheRoot }),
		recoveryRoot,
	});
	return recovered.packagePath ?? null;
}

async function recoverScriptDependencies({
	cacheRoot,
	recoveryRoot,
	resources,
}: {
	cacheRoot: string;
	recoveryRoot: string;
	resources: ResolvedJianyingScriptResources;
}) {
	if (
		!automaticJianyingTextRecoveryEnabled() ||
		(resources.missing.length === 0 && resources.degraded.length === 0)
	) {
		return false;
	}
	const results = await recoverJianyingTextResources({
		databaseRoot: getJianyingTextResourceDatabaseRoot({ cacheRoot }),
		recoveryRoot,
		requests: [...resources.missing, ...resources.degraded],
	});
	return results.some(({ state }) => state !== "unavailable");
}

export async function resolveJianyingScriptResourcesWithRecovery({
	cacheRoot,
	packagePath,
	recoveryRoot,
}: {
	cacheRoot: string;
	packagePath: string;
	recoveryRoot: string;
}) {
	let resources = await resolveJianyingScriptResources({
		packagePath,
		cacheRoot,
		additionalCacheRoots: [recoveryRoot],
	});
	if (await recoverScriptDependencies({ cacheRoot, recoveryRoot, resources })) {
		resources = await resolveJianyingScriptResources({
			packagePath,
			cacheRoot,
			additionalCacheRoots: [recoveryRoot],
		});
	}
	return resources;
}

function directAnimationReference({
	reference,
	resourceId,
}: {
	reference: JianyingTextRuntimeReference;
	resourceId: string;
}) {
	return Object.values(reference.animations ?? {}).find(
		(animation) => animation.resourceId === resourceId
	);
}

export async function resolveJianyingTextAnimationsWithRecovery({
	attemptedResourceIds = new Set<string>(),
	cacheRoot,
	recoveryRoot,
	reference,
}: {
	attemptedResourceIds?: Set<string>;
	cacheRoot: string;
	recoveryRoot: string;
	reference: JianyingTextRuntimeReference;
}): Promise<ResolvedJianyingTextAnimations> {
	try {
		return await resolveJianyingTextAnimations({
			animations: reference.animations,
			cacheRoot,
			additionalCacheRoots: [recoveryRoot],
		});
	} catch (cause) {
		if (
			!(cause instanceof JianyingTextAnimationPackageError) ||
			cause.code !== "dependency-missing" ||
			!automaticJianyingTextRecoveryEnabled() ||
			attemptedResourceIds.has(cause.dependency.resourceId)
		) {
			throw cause;
		}
		const animation = directAnimationReference({
			reference,
			resourceId: cause.dependency.resourceId,
		});
		if (!animation) throw cause;
		attemptedResourceIds.add(cause.dependency.resourceId);
		const recovered = await recoverJianyingTextResource({
			resourceId: cause.dependency.resourceId,
			role: "animation",
			expectedPackageHash: animation.packageHash,
			databaseRoot: getJianyingTextResourceDatabaseRoot({ cacheRoot }),
			recoveryRoot,
		});
		if (recovered.state === "unavailable") throw cause;
		return resolveJianyingTextAnimationsWithRecovery({
			attemptedResourceIds,
			cacheRoot,
			recoveryRoot,
			reference,
		});
	}
}

function missingTextureCount({
	inspection,
}: {
	inspection: JianyingEffectStyleInspection;
}) {
	return (
		inspection.manifest?.textures.filter(({ state }) => state === "missing")
			.length ?? 0
	);
}

function shouldRecoverEffectStyle({
	inspection,
}: {
	inspection: JianyingEffectStyleInspection;
}) {
	return (
		!inspection.manifest ||
		inspection.diagnostics.some(
			({ code }) => code === "effect-style-texture-missing"
		)
	);
}

export async function resolveJianyingEffectStyleWithRecovery({
	cacheRoot,
	packagePath,
	recoverRootPackage = recoverJianyingTextRootPackage,
	recoveryRoot,
	reference,
}: {
	cacheRoot: string;
	packagePath: string;
	recoverRootPackage?: typeof recoverJianyingTextRootPackage;
	recoveryRoot: string;
	reference: JianyingTextRuntimeReference;
}) {
	const sourceInspection = await parseJianyingEffectStylePackage({
		packagePath,
		resourceId: reference.resourceId,
	});
	if (
		!automaticJianyingTextRecoveryEnabled() ||
		!shouldRecoverEffectStyle({ inspection: sourceInspection })
	) {
		return { packagePath, inspection: sourceInspection };
	}
	const recoveredPath = await recoverRootPackage({
		cacheRoot,
		recoveryRoot,
		reference,
	});
	if (!recoveredPath || recoveredPath === packagePath) {
		return { packagePath, inspection: sourceInspection };
	}
	const recoveredInspection = await parseJianyingEffectStylePackage({
		packagePath: recoveredPath,
		resourceId: reference.resourceId,
	});
	const recoveredIsBetter =
		Boolean(recoveredInspection.manifest) &&
		(!sourceInspection.manifest ||
			missingTextureCount({ inspection: recoveredInspection }) <
				missingTextureCount({ inspection: sourceInspection }));
	return recoveredIsBetter
		? { packagePath: recoveredPath, inspection: recoveredInspection }
		: { packagePath, inspection: sourceInspection };
}

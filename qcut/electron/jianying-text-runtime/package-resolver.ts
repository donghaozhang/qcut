import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingTextEffectCapabilities,
	JianyingTextRuntimeDiagnostic,
	JianyingTextRuntimePackageKind,
	JianyingTextRuntimeReference,
} from "../jianying-text-runtime-contract.js";
import type { JianyingEffectStyleManifest } from "../jianying-text-effect-style-contract.js";
import {
	detectJianyingTextPackageKind,
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
	readJianyingTextTemplateDuration,
} from "../jianying-text-package-metadata.js";
import {
	createJianyingRuntimePackageCapabilities,
	mergeJianyingTextEffectCapabilities,
} from "../jianying-text-effect-capabilities.js";
import { jianyingEffectCacheRoot } from "../native-pipeline/filters/filter-lab-lut.js";
import {
	JianyingTextAnimationPackageError,
	type ResolvedJianyingTextAnimations,
} from "./animation-package-resolver.js";
import {
	inspectJianyingTextComponentPackage,
	type JianyingTextComponentManifest,
} from "./component-package-inspector.js";
import {
	recoverJianyingTextRootPackage,
	resolveJianyingEffectStyleWithRecovery,
	resolveJianyingScriptResourcesWithRecovery,
	resolveJianyingTextAnimationsWithRecovery,
} from "./package-recovery.js";
import { getJianyingTextRecoveryCacheRoot } from "./resource-recovery.js";
import { type ResolvedJianyingScriptResources } from "./script-dependencies.js";

export type JianyingTextPackageErrorCode =
	| "package-missing"
	| "package-invalid"
	| "dependency-missing";

export class JianyingTextPackageError extends Error {
	readonly code: JianyingTextPackageErrorCode;
	readonly missingDependencies?: ResolvedJianyingScriptResources["missing"];

	constructor({
		code,
		message,
		missingDependencies,
	}: {
		code: JianyingTextPackageErrorCode;
		message: string;
		missingDependencies?: ResolvedJianyingScriptResources["missing"];
	}) {
		super(message);
		this.name = "JianyingTextPackageError";
		this.code = code;
		this.missingDependencies = missingDependencies;
	}
}

export interface ResolvedJianyingTextPackage {
	packagePath: string;
	packageKind: JianyingTextRuntimePackageKind;
	resourceId: string;
	packageHash: string;
	templateDuration: number;
	capabilities: JianyingTextEffectCapabilities;
	diagnostics: JianyingTextRuntimeDiagnostic[];
	resourceFingerprint: string;
	animationResources: ResolvedJianyingTextAnimations;
	componentManifest?: JianyingTextComponentManifest;
	effectStyle?: JianyingEffectStyleManifest;
	scriptResources?: ResolvedJianyingScriptResources;
}

function packageRoot() {
	return (
		process.env.QCUT_JIANYING_TEXT_PACKAGE_ROOT ?? jianyingEffectCacheRoot()
	);
}

async function isReadableDirectory({ directory }: { directory: string }) {
	try {
		const [, metadata] = await Promise.all([
			access(directory, constants.R_OK),
			stat(directory),
		]);
		return metadata.isDirectory();
	} catch {
		return false;
	}
}

async function resolvePackageWithinRoot({
	candidate,
	root,
}: {
	candidate: string;
	root: string;
}) {
	if (!(await isReadableDirectory({ directory: candidate }))) return null;
	const [resolvedRoot, packagePath] = await Promise.all([
		realpath(root),
		realpath(candidate),
	]);
	if (
		packagePath !== resolvedRoot &&
		!packagePath.startsWith(`${resolvedRoot}${path.sep}`)
	) {
		throw new JianyingTextPackageError({
			code: "package-invalid",
			message: "剪映花字缓存路径越过了允许的资源目录。",
		});
	}
	return packagePath;
}

async function resolveRootPackage({
	cacheRoot,
	recoveryRoot,
	reference,
	root,
}: {
	cacheRoot: string;
	recoveryRoot: string;
	reference: JianyingTextRuntimeReference;
	root: string;
}) {
	const candidate = path.join(
		root,
		reference.resourceId,
		reference.packageHash.toLowerCase()
	);
	const localPackage = await resolvePackageWithinRoot({ candidate, root });
	if (localPackage) return localPackage;
	const recovered = await recoverJianyingTextRootPackage({
		cacheRoot,
		recoveryRoot,
		reference,
	});
	if (recovered) return recovered;
	throw new JianyingTextPackageError({
		code: "package-missing",
		message: "本机剪映花字缓存缺失，自动恢复不可用，请在剪映中重新下载该花字。",
	});
}

export async function resolveJianyingTextPackage({
	reference,
}: {
	reference: JianyingTextRuntimeReference;
}): Promise<ResolvedJianyingTextPackage> {
	if (
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(reference.resourceId) ||
		!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(reference.packageHash)
	) {
		throw new JianyingTextPackageError({
			code: "package-invalid",
			message: "剪映花字资源引用格式无效。",
		});
	}
	const root = packageRoot();
	const cacheRoot = process.env.QCUT_JIANYING_CACHE_ROOT ?? path.dirname(root);
	const recoveryRoot = getJianyingTextRecoveryCacheRoot();
	let packagePath = await resolveRootPackage({
		cacheRoot,
		recoveryRoot,
		reference,
		root,
	});
	let config: unknown;
	try {
		config = await readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "config.json"),
		});
	} catch {
		throw new JianyingTextPackageError({
			code: "package-invalid",
			message: "剪映花字 config.json 缺失或损坏。",
		});
	}
	const packageKind = detectJianyingTextPackageKind({ config });
	if (packageKind !== reference.packageKind) {
		throw new JianyingTextPackageError({
			code: "package-invalid",
			message: "剪映花字缓存类型与项目引用不一致。",
		});
	}
	let componentManifest: JianyingTextComponentManifest | undefined;
	if (packageKind !== "TextStyle") {
		try {
			componentManifest = await inspectJianyingTextComponentPackage({
				config,
				packagePath,
			});
		} catch {
			throw new JianyingTextPackageError({
				code: "package-invalid",
				message: "剪映花字主组件目录无效或包含不安全路径。",
			});
		}
	}
	let templateDuration: number;
	try {
		templateDuration = await readJianyingTextTemplateDuration({
			packagePath,
			packageKind,
		});
	} catch {
		throw new JianyingTextPackageError({
			code: "package-invalid",
			message: "剪映脚本花字 content.json 缺失或损坏。",
		});
	}
	const scriptResources =
		packageKind === "ScriptInfoSticker"
			? await resolveJianyingScriptResourcesWithRecovery({
					packagePath,
					cacheRoot,
					recoveryRoot,
				})
			: undefined;
	const effectStyleResolution =
		packageKind === "TextStyle"
			? await resolveJianyingEffectStyleWithRecovery({
					cacheRoot,
					packagePath,
					recoveryRoot,
					reference,
				})
			: undefined;
	if (effectStyleResolution) packagePath = effectStyleResolution.packagePath;
	const effectStyleInspection = effectStyleResolution?.inspection;
	if (packageKind === "TextStyle" && !effectStyleInspection?.manifest) {
		throw new JianyingTextPackageError({
			code: "package-invalid",
			message:
				effectStyleInspection?.diagnostics[0]?.message ??
				"剪映花字 effectStyle.json 缺失或损坏。",
		});
	}
	let animationResources: ResolvedJianyingTextAnimations;
	try {
		animationResources = await resolveJianyingTextAnimationsWithRecovery({
			cacheRoot,
			recoveryRoot,
			reference,
		});
	} catch (cause) {
		if (!(cause instanceof JianyingTextAnimationPackageError)) throw cause;
		throw new JianyingTextPackageError({
			code: cause.code,
			message: cause.message,
			...(cause.code === "dependency-missing"
				? { missingDependencies: [cause.dependency] }
				: {}),
		});
	}
	const blockingDependencies = scriptResources?.missing.filter(
		({ role }) => role !== "effect-style"
	);
	if (blockingDependencies && blockingDependencies.length > 0) {
		const dependencySummary = blockingDependencies
			.slice(0, 3)
			.map(({ resourceId, role }) => `${role}:${resourceId}`)
			.join("、");
		const remaining = blockingDependencies.length - 3;
		throw new JianyingTextPackageError({
			code: "dependency-missing",
			message: `本机剪映花字缺少动态依赖 ${dependencySummary}${remaining > 0 ? ` 等 ${blockingDependencies.length} 项` : ""}，请在剪映中重新预览或下载该花字。`,
			missingDependencies: blockingDependencies,
		});
	}
	const packageCapabilities =
		scriptResources?.capabilities ??
		createJianyingRuntimePackageCapabilities({
			animationComponents: packageKind === "InfoSticker",
			effectStyles: effectStyleInspection?.manifest
				? [effectStyleInspection.manifest]
				: [],
			scriptInfoSticker: false,
		});
	const capabilities = mergeJianyingTextEffectCapabilities({
		values: [
			packageCapabilities,
			animationResources.capabilities,
			...(componentManifest ? [componentManifest.capabilities] : []),
		],
	});
	const diagnostics =
		scriptResources?.diagnostics ?? effectStyleInspection?.diagnostics ?? [];
	const resourceFingerprint = createHash("sha256")
		.update(
			JSON.stringify({
				packageHash: reference.packageHash.toLowerCase(),
				packageFingerprint:
					scriptResources?.fingerprint ??
					effectStyleInspection?.fingerprint ??
					null,
				animationFingerprint: animationResources.fingerprint,
				componentFingerprint: componentManifest?.fingerprint ?? null,
			})
		)
		.digest("hex");
	return {
		packagePath,
		packageKind,
		resourceId: reference.resourceId,
		packageHash: reference.packageHash.toLowerCase(),
		templateDuration,
		capabilities,
		diagnostics,
		resourceFingerprint,
		animationResources,
		...(componentManifest ? { componentManifest } : {}),
		...(effectStyleInspection?.manifest
			? { effectStyle: effectStyleInspection.manifest }
			: {}),
		...(scriptResources ? { scriptResources } : {}),
	};
}

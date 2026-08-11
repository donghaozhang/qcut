import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingTextRuntimePackageKind,
	JianyingTextRuntimeReference,
} from "../jianying-text-runtime-contract.js";
import {
	detectJianyingTextPackageKind,
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
	readJianyingTextTemplateDuration,
} from "../jianying-text-package-metadata.js";
import { jianyingEffectCacheRoot } from "../native-pipeline/filters/filter-lab-lut.js";
import {
	resolveJianyingScriptResources,
	type ResolvedJianyingScriptResources,
} from "./script-dependencies.js";

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
	const candidate = path.join(
		root,
		reference.resourceId,
		reference.packageHash.toLowerCase()
	);
	if (!(await isReadableDirectory({ directory: candidate }))) {
		throw new JianyingTextPackageError({
			code: "package-missing",
			message: "本机剪映花字缓存缺失，请在剪映中重新下载该花字。",
		});
	}
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
			? await resolveJianyingScriptResources({
					packagePath,
					cacheRoot: process.env.QCUT_JIANYING_CACHE_ROOT ?? path.dirname(root),
				})
			: undefined;
	if (scriptResources && scriptResources.missing.length > 0) {
		throw new JianyingTextPackageError({
			code: "dependency-missing",
			message: `本机剪映花字缺少 ${scriptResources.missing.length} 个动态依赖，请在剪映中重新预览或下载该花字。`,
			missingDependencies: scriptResources.missing,
		});
	}
	return {
		packagePath,
		packageKind,
		resourceId: reference.resourceId,
		packageHash: reference.packageHash.toLowerCase(),
		templateDuration,
		...(scriptResources ? { scriptResources } : {}),
	};
}

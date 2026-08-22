import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReferenceEffectVerdict } from "./catalog-parsing.js";
import {
	isKnownHiddenAlgorithmPackage,
	isVerifiedAlgorithmPackage,
} from "./verified-algorithm-packages.js";

const PLAIN_NODE_TYPES = new Set(["blit", "texture_blit"]);
const MAX_ALGORITHM_CONFIG_BYTES = 2 * 1024 * 1024;

export interface EffectPackageAlgorithmInspection {
	configurationFound: boolean;
	valid: boolean;
	nodeTypes: string[];
	requiresAlgorithm: boolean;
	remoteGeneration: boolean;
}

export interface EffectSupportDecision {
	supported: boolean;
	requiresAlgorithm: boolean;
	unsupportedReason?: string;
}

function fileErrorCode({ cause }: { cause: unknown }): string | undefined {
	return cause && typeof cause === "object" && "code" in cause
		? String((cause as { code?: unknown }).code)
		: undefined;
}

async function readPackageJson({
	packagePath,
	fileName,
}: {
	packagePath: string;
	fileName: string;
}): Promise<unknown> {
	try {
		const content = await readFile(path.join(packagePath, fileName), "utf8");
		if (Buffer.byteLength(content) > MAX_ALGORITHM_CONFIG_BYTES) return null;
		return JSON.parse(content) as unknown;
	} catch {
		return null;
	}
}

function isRemoteGenerationPackage({
	algorithmConfig,
	config,
	extra,
}: {
	algorithmConfig: unknown;
	config: unknown;
	extra: unknown;
}): boolean {
	const links = (config as { effect?: { Link?: unknown } } | null)?.effect
		?.Link;
	const setting = (extra as { setting?: { is_local?: unknown } } | null)
		?.setting;
	const nodes = (algorithmConfig as { nodes?: unknown } | null)?.nodes;
	const outputs = (algorithmConfig as { extra?: { output?: unknown } } | null)
		?.extra?.output;
	return (
		Array.isArray(links) &&
		links.length === 0 &&
		setting?.is_local === false &&
		Array.isArray(nodes) &&
		nodes.some(
			(node) =>
				node !== null &&
				typeof node === "object" &&
				(node as { type?: unknown }).type === "script"
		) &&
		Array.isArray(outputs) &&
		outputs.some(
			(output) =>
				output !== null &&
				typeof output === "object" &&
				(output as { usage?: unknown }).usage === "VECache"
		)
	);
}

export async function inspectEffectPackageAlgorithm({
	packagePath,
}: {
	packagePath: string;
}): Promise<EffectPackageAlgorithmInspection> {
	let content: string;
	try {
		content = await readFile(
			path.join(packagePath, "algorithmConfig.json"),
			"utf8"
		);
	} catch (cause) {
		if (fileErrorCode({ cause }) === "ENOENT") {
			return {
				configurationFound: false,
				valid: true,
				nodeTypes: [],
				requiresAlgorithm: false,
				remoteGeneration: false,
			};
		}
		return {
			configurationFound: true,
			valid: false,
			nodeTypes: [],
			requiresAlgorithm: true,
			remoteGeneration: false,
		};
	}

	if (Buffer.byteLength(content) > MAX_ALGORITHM_CONFIG_BYTES) {
		return {
			configurationFound: true,
			valid: false,
			nodeTypes: [],
			requiresAlgorithm: true,
			remoteGeneration: false,
		};
	}

	try {
		const parsed: unknown = JSON.parse(content);
		if (!parsed || typeof parsed !== "object")
			throw new Error("invalid config");
		const nodes = (parsed as { nodes?: unknown }).nodes;
		if (!Array.isArray(nodes)) throw new Error("invalid nodes");
		const nodeTypes = [
			...new Set(
				nodes.flatMap((node) => {
					if (!node || typeof node !== "object") return [];
					const value = (node as { type?: unknown }).type;
					return typeof value === "string" && value.trim().length > 0
						? [value.trim().toLowerCase()]
						: [];
				})
			),
		].sort();
		const [config, extra] = await Promise.all([
			readPackageJson({ packagePath, fileName: "config.json" }),
			readPackageJson({ packagePath, fileName: "extra.json" }),
		]);
		return {
			configurationFound: true,
			valid: true,
			nodeTypes,
			requiresAlgorithm: nodeTypes.some((type) => !PLAIN_NODE_TYPES.has(type)),
			remoteGeneration: isRemoteGenerationPackage({
				algorithmConfig: parsed,
				config,
				extra,
			}),
		};
	} catch {
		return {
			configurationFound: true,
			valid: false,
			nodeTypes: [],
			requiresAlgorithm: true,
			remoteGeneration: false,
		};
	}
}

function matchingVerdict({
	packageHash,
	verdict,
}: {
	packageHash: string;
	verdict: ReferenceEffectVerdict | undefined;
}): ReferenceEffectVerdict | undefined {
	return verdict?.packageHash === packageHash.toLowerCase()
		? verdict
		: undefined;
}

export function resolveEffectSupport({
	effectId,
	packageHash,
	unsupportedRequirements,
	packageInspection,
	localVerdict,
}: {
	effectId: string;
	packageHash: string;
	unsupportedRequirements: string[];
	packageInspection?: EffectPackageAlgorithmInspection;
	localVerdict?: ReferenceEffectVerdict;
}): EffectSupportDecision {
	const exactVerdict = matchingVerdict({ packageHash, verdict: localVerdict });
	const knownHiddenAlgorithm = isKnownHiddenAlgorithmPackage({
		effectId,
		packageHash,
	});
	const requiresAlgorithm =
		unsupportedRequirements.length > 0 ||
		knownHiddenAlgorithm ||
		packageInspection?.requiresAlgorithm === true;

	if (packageInspection?.remoteGeneration) {
		return {
			supported: false,
			requiresAlgorithm: true,
			unsupportedReason: "远程 AI 写真生成，不属于本机视频特效",
		};
	}

	if (packageInspection?.valid === false) {
		return {
			supported: false,
			requiresAlgorithm: true,
			unsupportedReason: "特效包算法配置无法安全读取",
		};
	}
	if (exactVerdict?.ok === false) {
		return {
			supported: false,
			requiresAlgorithm,
			unsupportedReason: "本机渲染验证未通过",
		};
	}
	if (!requiresAlgorithm) return { supported: true, requiresAlgorithm: false };

	const verified =
		isVerifiedAlgorithmPackage({ effectId, packageHash }) ||
		(exactVerdict?.ok === true && exactVerdict.algorithmIsolated);
	if (verified) return { supported: true, requiresAlgorithm: true };

	const capabilities = [
		...new Set([
			...unsupportedRequirements,
			...(packageInspection?.nodeTypes.filter(
				(type) => !PLAIN_NODE_TYPES.has(type)
			) ?? []),
		]),
	];
	return {
		supported: false,
		requiresAlgorithm: true,
		unsupportedReason:
			capabilities.length > 0
				? `算法能力尚未验证：${capabilities.join("、")}`
				: "该算法特效尚未通过隔离验证",
	};
}

import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
	createEmptyJianyingTextEffectCapabilities,
	mergeJianyingTextEffectCapabilities,
} from "../jianying-text-effect-capabilities.js";
import type {
	JianyingTextAnimationReference,
	JianyingTextAnimationReferences,
	JianyingTextAnimationSlot,
	JianyingTextEffectCapabilities,
	JianyingTextResourceRecoveryFailureReason,
	JianyingTextRuntimeDependencyRole,
} from "../jianying-text-runtime-contract.js";
import {
	asJianyingRecord,
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
} from "../jianying-text-package-metadata.js";
import {
	inspectJianyingTextComponentPackage,
	type JianyingTextComponentManifest,
} from "./component-package-inspector.js";

const ANIMATION_SLOTS = [
	["entrance", 1],
	["exit", 2],
	["loop", 3],
] as const satisfies ReadonlyArray<
	readonly [JianyingTextAnimationSlot, 1 | 2 | 3]
>;

export type JianyingTextAnimationManifest = JianyingTextComponentManifest;

export interface ResolvedJianyingTextAnimation {
	slot: JianyingTextAnimationSlot;
	animationType: 1 | 2 | 3;
	packagePath: string;
	resourceId: string;
	packageHash: string;
	duration: number;
	manifest: JianyingTextAnimationManifest;
}

export interface ResolvedJianyingTextAnimations {
	values: ResolvedJianyingTextAnimation[];
	capabilities: JianyingTextEffectCapabilities;
	fingerprint: string;
}

export class JianyingTextAnimationPackageError extends Error {
	readonly code: "dependency-missing" | "package-invalid";
	readonly dependency: {
		resourceId: string;
		role: JianyingTextRuntimeDependencyRole;
	};
	readonly recoveryReason?: JianyingTextResourceRecoveryFailureReason;

	constructor({
		code,
		message,
		recoveryReason,
		resourceId,
	}: {
		code: "dependency-missing" | "package-invalid";
		message: string;
		recoveryReason?: JianyingTextResourceRecoveryFailureReason;
		resourceId: string;
	}) {
		super(message);
		this.name = "JianyingTextAnimationPackageError";
		this.code = code;
		this.dependency = { resourceId, role: "animation" };
		this.recoveryReason = recoveryReason;
	}
}

function isWithinRoot({
	root,
	candidate,
}: {
	root: string;
	candidate: string;
}) {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function animationLinkTypes({ config }: { config: unknown }) {
	const links = asJianyingRecord(asJianyingRecord(config)?.effect)?.Link;
	if (!Array.isArray(links)) return [];
	return links.flatMap((link) => {
		const type = asJianyingRecord(link)?.type;
		return typeof type === "string" ? [type] : [];
	});
}

async function resolveAnimation({
	animation,
	animationType,
	effectRoots,
	slot,
}: {
	animation: JianyingTextAnimationReference;
	animationType: 1 | 2 | 3;
	effectRoots: string[];
	slot: JianyingTextAnimationSlot;
}): Promise<ResolvedJianyingTextAnimation> {
	if (
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(animation.resourceId) ||
		!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(animation.packageHash)
	) {
		throw new JianyingTextAnimationPackageError({
			code: "package-invalid",
			message: `剪映${slot}文字动画引用格式无效。`,
			resourceId: animation.resourceId,
		});
	}
	const candidates = await Promise.all(
		effectRoots.map(async (effectRoot) => {
			const candidate = path.join(
				effectRoot,
				animation.resourceId,
				animation.packageHash.toLowerCase()
			);
			const [resolvedRoot, packagePath] = await Promise.all([
				realpath(effectRoot).catch(() => null),
				realpath(candidate).catch(() => null),
			]);
			if (!resolvedRoot || !packagePath) return null;
			if (!isWithinRoot({ root: resolvedRoot, candidate: packagePath })) {
				throw new JianyingTextAnimationPackageError({
					code: "package-invalid",
					message: `剪映${slot}文字动画路径越过了允许的缓存目录。`,
					resourceId: animation.resourceId,
				});
			}
			const metadata = await stat(packagePath).catch(() => null);
			return metadata?.isDirectory() ? packagePath : null;
		})
	);
	const packagePath = candidates.find(
		(candidate): candidate is string => candidate !== null
	);
	if (!packagePath) {
		throw new JianyingTextAnimationPackageError({
			code: "dependency-missing",
			message: `本机缺少剪映${slot}文字动画 ${animation.resourceId}，请先在剪映中预览或下载。`,
			resourceId: animation.resourceId,
		});
	}
	let config: unknown;
	try {
		config = await readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "config.json"),
		});
	} catch {
		throw new JianyingTextAnimationPackageError({
			code: "package-invalid",
			message: `剪映${slot}文字动画 ${animation.resourceId} 的 config.json 缺失或损坏。`,
			resourceId: animation.resourceId,
		});
	}
	const linkTypes = animationLinkTypes({ config });
	if (
		!(linkTypes.includes("InfoSticker") || linkTypes.includes("TextAnimation"))
	) {
		throw new JianyingTextAnimationPackageError({
			code: "package-invalid",
			message: `剪映${slot}文字动画 ${animation.resourceId} 不是可加载的动画包。`,
			resourceId: animation.resourceId,
		});
	}
	let manifest: JianyingTextAnimationManifest;
	try {
		manifest = await inspectJianyingTextComponentPackage({
			config,
			packagePath,
		});
	} catch {
		throw new JianyingTextAnimationPackageError({
			code: "package-invalid",
			message: `剪映${slot}文字动画 ${animation.resourceId} 的组件目录无效。`,
			resourceId: animation.resourceId,
		});
	}
	return {
		slot,
		animationType,
		packagePath,
		resourceId: animation.resourceId,
		packageHash: animation.packageHash.toLowerCase(),
		duration: animation.duration,
		manifest,
	};
}

export async function resolveJianyingTextAnimations({
	additionalCacheRoots = [],
	animations,
	cacheRoot,
}: {
	additionalCacheRoots?: string[];
	animations: JianyingTextAnimationReferences | undefined;
	cacheRoot: string;
}): Promise<ResolvedJianyingTextAnimations> {
	const requested = ANIMATION_SLOTS.flatMap(([slot, animationType]) => {
		const animation = animations?.[slot];
		return animation ? [{ animation, animationType, slot }] : [];
	});
	if (requested.length === 0) {
		return {
			values: [],
			capabilities: createEmptyJianyingTextEffectCapabilities(),
			fingerprint: createHash("sha256").update("no-animations").digest("hex"),
		};
	}
	const effectRoots = Array.from(
		new Set([cacheRoot, ...additionalCacheRoots])
	).map((root) => path.join(root, "effect"));
	const values = await Promise.all(
		requested.map(({ animation, animationType, slot }) =>
			resolveAnimation({ animation, animationType, effectRoots, slot })
		)
	);
	const capabilities = mergeJianyingTextEffectCapabilities({
		values: values.map(({ manifest }) => manifest.capabilities),
	});
	const fingerprint = createHash("sha256")
		.update(
			JSON.stringify(
				values.map(({ slot, resourceId, packageHash, duration, manifest }) => ({
					slot,
					resourceId,
					packageHash,
					duration,
					manifestFingerprint: manifest.fingerprint,
				}))
			)
		)
		.digest("hex");
	return { values, capabilities, fingerprint };
}

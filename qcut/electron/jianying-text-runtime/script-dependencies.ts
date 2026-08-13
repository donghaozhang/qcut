import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
	createJianyingRuntimePackageCapabilities,
	mergeJianyingTextEffectCapabilities,
} from "../jianying-text-effect-capabilities.js";
import type {
	JianyingEffectStyleInspection,
	JianyingEffectStyleManifest,
} from "../jianying-text-effect-style-contract.js";
import { parseJianyingEffectStylePackage } from "../jianying-text-effect-style-parser.js";
import type {
	JianyingTextEffectCapabilities,
	JianyingTextRuntimeDiagnostic,
} from "../jianying-text-runtime-contract.js";
import {
	detectJianyingTextPackageKind,
	readBoundedJianyingTextJson,
} from "../jianying-text-package-metadata.js";
import {
	inspectJianyingTextComponentPackage,
	type JianyingTextComponentManifest,
} from "./component-package-inspector.js";
import {
	canDegradeJianyingScriptResource,
	collectJianyingAnimationOwnerTypes,
	collectJianyingScriptResourceReferences,
	jianyingResourceContainers,
	readJianyingScriptDependencyDescriptors,
	type JianyingScriptDependencyDescriptor,
	type JianyingScriptResourceReference,
} from "./script-resource-policy.js";

export { collectJianyingScriptResourceReferences };
export type { JianyingScriptResourceReference };

export interface ResolvedJianyingScriptResources {
	resourcePaths: Readonly<Record<string, string>>;
	references: JianyingScriptResourceReference[];
	missing: JianyingScriptResourceReference[];
	degraded: JianyingScriptResourceReference[];
	effectStyles: JianyingEffectStyleManifest[];
	components: JianyingScriptComponentResource[];
	capabilities: JianyingTextEffectCapabilities;
	diagnostics: JianyingTextRuntimeDiagnostic[];
	fingerprint: string;
}

export interface JianyingScriptComponentResource
	extends JianyingScriptResourceReference {
	manifest: JianyingTextComponentManifest;
}

interface ResourcePackageCandidate {
	path: string;
	modifiedAt: number;
}

interface ResourceResolution {
	reference: JianyingScriptResourceReference;
	packagePath?: string;
	effectStyle?: JianyingEffectStyleManifest;
	effectStyleInspection?: JianyingEffectStyleInspection;
	componentManifest?: JianyingTextComponentManifest;
	diagnostics?: JianyingTextRuntimeDiagnostic[];
}

async function isReadableFile({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return true;
	} catch {
		return false;
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

async function listResourcePackageCandidates({
	containerRoot,
	resourceId,
}: {
	containerRoot: string;
	resourceId: string;
}) {
	const resourceRoot = path.join(containerRoot, resourceId);
	const entries = await readdir(resourceRoot, { withFileTypes: true }).catch(
		() => []
	);
	const resolvedContainerRoot = await realpath(containerRoot).catch(() => null);
	if (!resolvedContainerRoot) return [];
	const candidates = await Promise.all(
		entries.flatMap((entry) =>
			entry.isDirectory()
				? [
						(async (): Promise<ResourcePackageCandidate | null> => {
							const candidate = path.join(resourceRoot, entry.name);
							const resolved = await realpath(candidate).catch(() => null);
							if (
								!resolved ||
								!isWithinRoot({
									root: resolvedContainerRoot,
									candidate: resolved,
								}) ||
								!(await isReadableFile({
									filePath: path.join(resolved, "config.json"),
								}))
							) {
								return null;
							}
							const metadata = await stat(resolved).catch(() => null);
							return metadata?.isDirectory()
								? { path: resolved, modifiedAt: metadata.mtimeMs }
								: null;
						})(),
					]
				: []
		)
	);
	return candidates.filter(
		(candidate): candidate is ResourcePackageCandidate => candidate !== null
	);
}

async function resolveResourcePackageCandidates({
	additionalCacheRoots,
	cacheRoot,
	reference,
	descriptor,
}: {
	additionalCacheRoots: string[];
	cacheRoot: string;
	reference: JianyingScriptResourceReference;
	descriptor?: JianyingScriptDependencyDescriptor;
}) {
	const cacheRoots = Array.from(new Set([cacheRoot, ...additionalCacheRoots]));
	const candidatesByRoot = await Promise.all(
		cacheRoots.map(async (root) => {
			const candidatesByContainer = await Promise.all(
				jianyingResourceContainers({ reference, descriptor }).map((container) =>
					listResourcePackageCandidates({
						containerRoot: path.join(root, container),
						resourceId: reference.resourceId,
					})
				)
			);
			return candidatesByContainer
				.flat()
				.sort(
					(left, right) =>
						right.modifiedAt - left.modifiedAt ||
						left.path.localeCompare(right.path)
				);
		})
	);
	return candidatesByRoot.flat();
}

function missingEffectStyleDiagnostic({
	resourceId,
}: {
	resourceId: string;
}): JianyingTextRuntimeDiagnostic {
	return {
		code: "effect-style-package-missing",
		severity: "error",
		message: `花字外观资源 ${resourceId} 未下载，将使用普通文字外观继续渲染。`,
		resourceId,
	};
}

function unresolvedRuntimeDependencyDiagnostic({
	resourceId,
}: {
	resourceId: string;
}): JianyingTextRuntimeDiagnostic {
	return {
		code: "runtime-dependency-unresolved",
		severity: "warning",
		message: `形状动画资源 ${resourceId} 无法恢复，将移除受影响的形状层并继续渲染其余内容。`,
		resourceId,
	};
}

function runtimeComponentEffectStyleDiagnostic({
	resourceId,
}: {
	resourceId: string;
}): JianyingTextRuntimeDiagnostic {
	return {
		code: "effect-style-runtime-component",
		severity: "warning",
		message: `花字外观资源 ${resourceId} 使用剪映运行时组件，将由本机私有运行时渲染。`,
		resourceId,
	};
}

async function inspectRuntimeComponentEffectStyle({
	packagePath,
}: {
	packagePath: string;
}) {
	const config = await readBoundedJianyingTextJson({
		filePath: path.join(packagePath, "config.json"),
	}).catch(() => null);
	const packageKind = detectJianyingTextPackageKind({ config });
	if (packageKind !== "InfoSticker" && packageKind !== "AmazingFeature") {
		return null;
	}
	return inspectJianyingTextComponentPackage({ config, packagePath }).catch(
		() => null
	);
}

async function resolveResourceReference({
	additionalCacheRoots,
	cacheRoot,
	descriptor,
	reference,
}: {
	additionalCacheRoots: string[];
	cacheRoot: string;
	descriptor?: JianyingScriptDependencyDescriptor;
	reference: JianyingScriptResourceReference;
}): Promise<ResourceResolution> {
	const candidates = await resolveResourcePackageCandidates({
		additionalCacheRoots,
		cacheRoot,
		reference,
		descriptor,
	});
	if (reference.role !== "effect-style") {
		const packagePath = candidates[0]?.path;
		if (!packagePath) return { reference };
		return {
			reference,
			packagePath,
			componentManifest: await inspectJianyingTextComponentPackage({
				packagePath,
			}),
		};
	}
	if (candidates.length === 0) {
		return { reference };
	}
	const inspections = await Promise.all(
		candidates.map(async ({ path: candidatePath }) => ({
			candidatePath,
			inspection: await parseJianyingEffectStylePackage({
				packagePath: candidatePath,
				resourceId: reference.resourceId,
			}),
			componentManifest: await inspectRuntimeComponentEffectStyle({
				packagePath: candidatePath,
			}),
		}))
	);
	const selected = inspections.find(
		({ componentManifest, inspection }) =>
			(inspection.canHydrate && Boolean(inspection.manifest)) ||
			Boolean(componentManifest)
	);
	if (!selected) {
		return {
			reference,
			effectStyle: inspections[0].inspection.manifest,
			effectStyleInspection: inspections[0].inspection,
		};
	}
	if (selected.componentManifest) {
		return {
			reference,
			packagePath: selected.candidatePath,
			componentManifest: selected.componentManifest,
			diagnostics: [
				runtimeComponentEffectStyleDiagnostic({
					resourceId: reference.resourceId,
				}),
			],
		};
	}
	return {
		reference,
		packagePath: selected.candidatePath,
		effectStyle: selected.inspection.manifest,
		effectStyleInspection: selected.inspection,
	};
}

export async function resolveJianyingScriptResources({
	additionalCacheRoots = [],
	packagePath,
	cacheRoot,
}: {
	additionalCacheRoots?: string[];
	packagePath: string;
	cacheRoot: string;
}): Promise<ResolvedJianyingScriptResources> {
	const [content, extra] = await Promise.all([
		readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "content.json"),
		}),
		readBoundedJianyingTextJson({
			filePath: path.join(packagePath, "extra.json"),
		}).catch(() => null),
	]);
	const references = collectJianyingScriptResourceReferences({
		value: content,
	});
	const descriptors = readJianyingScriptDependencyDescriptors({ value: extra });
	const animationOwnerTypes = collectJianyingAnimationOwnerTypes({
		value: content,
	});
	const resolutions = await Promise.all(
		references.map((reference) =>
			resolveResourceReference({
				additionalCacheRoots,
				cacheRoot,
				reference,
				descriptor: descriptors.get(reference.resourceId),
			})
		)
	);
	const resourcePaths: Record<string, string> = {};
	const missing: JianyingScriptResourceReference[] = [];
	const degraded: JianyingScriptResourceReference[] = [];
	const effectStyles: JianyingEffectStyleManifest[] = [];
	const components: JianyingScriptComponentResource[] = [];
	const diagnostics: JianyingTextRuntimeDiagnostic[] = [];
	for (const resolution of resolutions) {
		diagnostics.push(...(resolution.diagnostics ?? []));
		if (resolution.effectStyle) effectStyles.push(resolution.effectStyle);
		if (resolution.componentManifest) {
			components.push({
				...resolution.reference,
				manifest: resolution.componentManifest,
			});
		}
		if (resolution.packagePath) {
			resourcePaths[resolution.reference.resourceId] = resolution.packagePath;
			if (resolution.effectStyleInspection) {
				diagnostics.push(...resolution.effectStyleInspection.diagnostics);
			}
		} else {
			const descriptor = descriptors.get(resolution.reference.resourceId);
			if (
				canDegradeJianyingScriptResource({
					descriptor,
					ownerTypes: animationOwnerTypes,
					reference: resolution.reference,
				})
			) {
				degraded.push(resolution.reference);
				diagnostics.push(
					unresolvedRuntimeDependencyDiagnostic({
						resourceId: resolution.reference.resourceId,
					})
				);
			} else {
				missing.push(resolution.reference);
			}
			if (resolution.reference.role === "effect-style") {
				diagnostics.push(
					...(resolution.effectStyleInspection?.diagnostics ?? [
						missingEffectStyleDiagnostic({
							resourceId: resolution.reference.resourceId,
						}),
					])
				);
			}
		}
	}
	const capabilities = mergeJianyingTextEffectCapabilities({
		values: [
			createJianyingRuntimePackageCapabilities({
				animationComponents: references.some(
					({ role }) => role === "animation" || role === "sticker"
				),
				effectStyles,
				scriptInfoSticker: true,
			}),
			...components.map(({ manifest }) => manifest.capabilities),
		],
	});
	const fingerprint = createHash("sha256")
		.update(
			JSON.stringify(
				resolutions.map(
					({
						reference,
						packagePath: resolvedPath,
						effectStyle,
						componentManifest,
					}) => ({
						...reference,
						path: resolvedPath ?? null,
						effectStyleFingerprint: effectStyle?.fingerprint ?? null,
						componentFingerprint: componentManifest?.fingerprint ?? null,
					})
				)
			)
		)
		.digest("hex");
	return {
		resourcePaths,
		references,
		missing,
		degraded,
		effectStyles,
		components,
		capabilities,
		diagnostics,
		fingerprint,
	};
}

import type {
	JianyingPortraitAdjustmentGroup,
	JianyingPortraitAdjustmentRenderRequest,
	JianyingPortraitAdjustmentRuntimePackage,
} from "../jianying-portrait-adjustment-contract.js";
import {
	buildJianyingPortraitFeatureParameters,
	JIANYING_PORTRAIT_PACKAGE_IDENTITIES,
	JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER,
	jianyingPortraitRuntimePackageForControl,
	JIANYING_PORTRAIT_ADJUSTMENT_CATALOG,
} from "./catalog.js";
import {
	buildJianyingDynamicMakeupParameters,
	buildJianyingStandaloneMakeupParameters,
	JIANYING_PORTRAIT_MAKEUP_CARDS,
} from "./makeup-catalog.js";
import type { JianyingPortraitMakeupCardResolution } from "./makeup-resolver.js";
import type { JianyingPortraitPackageResolution } from "./package-resolver.js";

export interface JianyingPortraitRenderStage {
	id: string;
	group: JianyingPortraitAdjustmentGroup;
	runtimePackage: JianyingPortraitAdjustmentRuntimePackage;
	packagePath: string;
	featureParameters: string;
}

interface PortraitFacePlanEntry {
	id: number;
	values: JianyingPortraitAdjustmentRenderRequest["adjustments"]["values"];
	makeup: JianyingPortraitAdjustmentRenderRequest["adjustments"]["makeup"];
}

/**
 * The render plan is one entry per targeted face. The legacy values layer
 * KEEPS its faceTarget-derived id even when per-face entries are present —
 * a writer adding faces[] can never silently retarget a single-face project
 * to all faces. On an id collision the faces entry wins, matching native
 * getValue() where an id-matched vector element beats the -1 fallback.
 */
function buildPortraitFacePlan({
	request,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
}): PortraitFacePlanEntry[] {
	const baseId =
		request.adjustments.faceTarget?.mode === "single"
			? (request.adjustments.faceTarget.faceId ?? -1)
			: -1;
	const plan = new Map<number, PortraitFacePlanEntry>();
	plan.set(baseId, {
		id: baseId,
		values: request.adjustments.values,
		makeup: request.adjustments.makeup,
	});
	for (const face of request.adjustments.faces ?? []) {
		plan.set(face.trackId, {
			id: face.trackId,
			values: face.values,
			makeup: face.makeup,
		});
	}
	return [...plan.values()];
}

function packagePathForRuntime({
	packages,
	runtimePackage,
}: {
	packages: JianyingPortraitPackageResolution[];
	runtimePackage: JianyingPortraitAdjustmentRuntimePackage;
}) {
	const resolved = packages.find(
		(candidate) => candidate.runtimePackage === runtimePackage
	);
	if (!resolved?.packagePath) {
		throw new Error(`剪映美颜美体效果包缺失: ${runtimePackage}`);
	}
	return resolved.packagePath;
}

function activeNumericPackages({ plan }: { plan: PortraitFacePlanEntry[] }) {
	const active = new Set<JianyingPortraitAdjustmentRuntimePackage>();
	for (const control of JIANYING_PORTRAIT_ADJUSTMENT_CATALOG) {
		if (plan.some((entry) => (entry.values[control.key] ?? 0) !== 0)) {
			active.add(jianyingPortraitRuntimePackageForControl({ control }));
		}
	}
	return active;
}

function selectedMakeupCards({
	request,
	plan,
	makeupCards,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
	plan: PortraitFacePlanEntry[];
	makeupCards: JianyingPortraitMakeupCardResolution[];
}) {
	const resolutionById = new Map(
		makeupCards.map((resolution) => [resolution.card.id, resolution])
	);
	const baseId =
		request.adjustments.faceTarget?.mode === "single"
			? (request.adjustments.faceTarget.faceId ?? -1)
			: -1;
	return JIANYING_PORTRAIT_MAKEUP_CARDS.flatMap((card) => {
		const selection = request.adjustments.makeup?.[card.category];
		const baseSelected =
			selection?.cardId === card.id && selection.intensity > 0;
		const faceEntries = plan
			.filter((entry) => entry.id !== baseId)
			.flatMap((entry) => {
				const faceSelection = entry.makeup?.[card.category];
				return faceSelection?.cardId === card.id && faceSelection.intensity > 0
					? [{ id: entry.id, intensity: faceSelection.intensity }]
					: [];
			});
		if (!baseSelected && faceEntries.length === 0) return [];
		const resolution = resolutionById.get(card.id);
		if (!resolution?.packagePath) {
			throw new Error(`剪映美妆卡片尚未缓存: ${card.titleZh}`);
		}
		return [
			{
				card,
				// 基础层未选该卡而仅逐脸选中时，基础条目强度为 0（对 -1 生效面
				// 保持无效果），真正的强度全部由逐脸条目携带。
				intensity: baseSelected ? selection.intensity : 0,
				packagePath: resolution.packagePath,
				...(faceEntries.length > 0 ? { faceEntries } : {}),
			},
		];
	});
}

function staticStage({
	request,
	packages,
	runtimePackage,
	plan,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
	packages: JianyingPortraitPackageResolution[];
	runtimePackage: JianyingPortraitAdjustmentRuntimePackage;
	plan: PortraitFacePlanEntry[];
}): JianyingPortraitRenderStage {
	const [baseEntry, ...faceEntries] = plan;
	if (!baseEntry) throw new Error("剪映美颜美体渲染计划为空");
	return {
		id: `package:${runtimePackage}`,
		group: JIANYING_PORTRAIT_PACKAGE_IDENTITIES[runtimePackage].group,
		runtimePackage,
		packagePath: packagePathForRuntime({ packages, runtimePackage }),
		featureParameters: buildJianyingPortraitFeatureParameters({
			runtimePackage,
			values: baseEntry.values,
			targetFaceId: baseEntry.id,
			...(faceEntries.length > 0
				? {
						faceEntries: faceEntries.map((entry) => ({
							id: entry.id,
							values: entry.values,
						})),
					}
				: {}),
		}),
	};
}

export function buildJianyingPortraitRenderStages({
	request,
	packages,
	makeupCards,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
	packages: JianyingPortraitPackageResolution[];
	makeupCards: JianyingPortraitMakeupCardResolution[];
}) {
	const plan = buildPortraitFacePlan({ request });
	const numericPackages = activeNumericPackages({ plan });
	const baseFaceId = plan[0]?.id ?? -1;
	const selectedCards = selectedMakeupCards({ request, plan, makeupCards });
	const standaloneCards = selectedCards.filter(
		({ card }) => card.kind === "standalone"
	);
	const dynamicCards = selectedCards.filter(
		({ card }) => card.kind === "dynamic"
	);
	const stages: JianyingPortraitRenderStage[] = [];
	for (const runtimePackage of JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER) {
		if (runtimePackage !== "makeup" && numericPackages.has(runtimePackage)) {
			stages.push(
				staticStage({
					request,
					packages,
					runtimePackage,
					plan,
				})
			);
		}
		if (runtimePackage !== "makeup") continue;
		for (const selection of standaloneCards) {
			stages.push({
				id: `makeup-card:${selection.card.id}`,
				group: "face",
				runtimePackage: "makeup",
				packagePath: selection.packagePath,
				featureParameters: buildJianyingStandaloneMakeupParameters({
					card: selection.card,
					intensity: selection.intensity,
					targetFaceId: baseFaceId,
					...(selection.faceEntries
						? { faceEntries: selection.faceEntries }
						: {}),
				}),
			});
		}
		if (dynamicCards.length > 0) {
			const cardSignature = dynamicCards
				.map(({ card }) => card.id)
				.sort()
				.join(",");
			stages.push({
				id: `makeup-dynamic:${cardSignature}`,
				group: "face",
				runtimePackage: "makeup",
				packagePath: packagePathForRuntime({
					packages,
					runtimePackage: "makeup",
				}),
				featureParameters: buildJianyingDynamicMakeupParameters({
					selections: dynamicCards,
					targetFaceId: baseFaceId,
				}),
			});
		}
	}
	return stages;
}

export function activeJianyingPortraitGroups({
	stages,
}: {
	stages: JianyingPortraitRenderStage[];
}) {
	const groups = new Set(stages.map(({ group }) => group));
	return (["face", "body"] as const).filter((group) => groups.has(group));
}

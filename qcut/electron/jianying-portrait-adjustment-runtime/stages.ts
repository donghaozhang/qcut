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

function targetFaceId({
	request,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
}) {
	return request.adjustments.faceTarget?.mode === "single"
		? (request.adjustments.faceTarget.faceId ?? -1)
		: -1;
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

function activeNumericPackages({
	request,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
}) {
	const active = new Set<JianyingPortraitAdjustmentRuntimePackage>();
	for (const control of JIANYING_PORTRAIT_ADJUSTMENT_CATALOG) {
		if ((request.adjustments.values[control.key] ?? 0) !== 0) {
			active.add(jianyingPortraitRuntimePackageForControl({ control }));
		}
	}
	return active;
}

function selectedMakeupCards({
	request,
	makeupCards,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
	makeupCards: JianyingPortraitMakeupCardResolution[];
}) {
	const resolutionById = new Map(
		makeupCards.map((resolution) => [resolution.card.id, resolution])
	);
	return JIANYING_PORTRAIT_MAKEUP_CARDS.flatMap((card) => {
		const selection = request.adjustments.makeup?.[card.category];
		if (selection?.cardId !== card.id || selection.intensity <= 0) return [];
		const resolution = resolutionById.get(card.id);
		if (!resolution?.packagePath) {
			throw new Error(`剪映美妆卡片尚未缓存: ${card.titleZh}`);
		}
		return [
			{
				card,
				intensity: selection.intensity,
				packagePath: resolution.packagePath,
			},
		];
	});
}

function staticStage({
	request,
	packages,
	runtimePackage,
	faceId,
}: {
	request: JianyingPortraitAdjustmentRenderRequest;
	packages: JianyingPortraitPackageResolution[];
	runtimePackage: JianyingPortraitAdjustmentRuntimePackage;
	faceId: number;
}): JianyingPortraitRenderStage {
	return {
		id: `package:${runtimePackage}`,
		group: JIANYING_PORTRAIT_PACKAGE_IDENTITIES[runtimePackage].group,
		runtimePackage,
		packagePath: packagePathForRuntime({ packages, runtimePackage }),
		featureParameters: buildJianyingPortraitFeatureParameters({
			runtimePackage,
			values: request.adjustments.values,
			targetFaceId: faceId,
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
	const numericPackages = activeNumericPackages({ request });
	const faceId = targetFaceId({ request });
	const selectedCards = selectedMakeupCards({ request, makeupCards });
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
					faceId,
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
					targetFaceId: faceId,
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
					targetFaceId: faceId,
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

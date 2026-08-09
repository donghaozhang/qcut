import {
	JIANYING_TRANSITIONS,
	type JianyingTransitionDefinition,
} from "../../../../../../../../electron/jianying-transition-catalog";
import {
	defineTransitionPreset,
	type TransitionPreset,
} from "./transition-preset-types";

export const JIANYING_LOCAL_TRANSITION_PRESETS: TransitionPreset[] =
	JIANYING_TRANSITIONS.map((transitionValue, index) => {
		const transition: JianyingTransitionDefinition = transitionValue;
		return defineTransitionPreset({
			id: transition.id,
			name: transition.name,
			localizedName: transition.localizedName,
			category: "lab",
			type: transition.preview.type,
			clipType: transition.preview.clipType,
			direction: transition.preview.direction,
			maskShape: transition.preview.maskShape,
			tuning: transition.preview.tuning,
			defaultDuration: transition.defaultDuration,
			backend: "jianying-local",
			jianyingGroup: transition.group,
			description:
				transition.runtimeKind === "ai-generation"
					? `${transition.localizedName}使用 QCut AI 首尾帧生成，不会把剪映生成配置当成本机转场包。`
					: `${transition.localizedName}由本机剪映运行时渲染，QCut 不内置或上传剪映效果文件。`,
			tags: [
				transition.resourceId,
				transition.family,
				transition.runtimeKind,
				transition.overlap ? "overlap" : "non-overlap",
			],
			premium: transition.access === "vip",
			popular: index < 6,
			latest: true,
		});
	});

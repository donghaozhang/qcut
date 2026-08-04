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
			category: "jianying-local",
			type: transition.preview.type,
			clipType: transition.preview.clipType,
			direction: transition.preview.direction,
			maskShape: transition.preview.maskShape,
			tuning: transition.preview.tuning,
			defaultDuration: transition.defaultDuration,
			backend: "jianying-local",
			jianyingGroup: transition.group,
			description: `${transition.localizedName}由本机剪映运行时渲染，QCut 不内置或上传剪映效果文件。`,
			tags: [
				transition.resourceId,
				transition.family,
				transition.overlap ? "overlap" : "non-overlap",
			],
			popular: index < 6,
			latest: true,
		});
	});

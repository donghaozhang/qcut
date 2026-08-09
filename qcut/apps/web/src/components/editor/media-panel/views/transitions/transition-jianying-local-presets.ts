import {
	JIANYING_TRANSITION_GROUPS,
	JIANYING_TRANSITIONS,
	type JianyingTransitionDefinition,
} from "../../../../../../../../electron/jianying-transition-catalog";
import {
	defineTransitionPreset,
	type TransitionPreset,
} from "./transition-preset-types";

const LOCAL_GROUP_LABELS = new Map(
	JIANYING_TRANSITION_GROUPS.map((group) => [group.id, group.label])
);

export const JIANYING_LOCAL_TRANSITION_PRESETS: TransitionPreset[] =
	JIANYING_TRANSITIONS.filter(
		(transition) => transition.runtimeKind === "transition-segment"
	).map((transitionValue, index) => {
		const transition: JianyingTransitionDefinition = transitionValue;
		const groupLabel =
			LOCAL_GROUP_LABELS.get(transition.group) ?? transition.group;
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
			jianyingGroupLabel: groupLabel,
			packageHash: transition.metadataMd5,
			description: `${transition.localizedName}由本机剪映运行时渲染，QCut 不内置或上传剪映效果文件。`,
			tags: [
				transition.resourceId,
				transition.metadataMd5,
				transition.family,
				groupLabel,
				transition.runtimeKind,
				transition.overlap ? "overlap" : "non-overlap",
			],
			premium: transition.access === "vip",
			popular: index < 6,
			latest: true,
		});
	});

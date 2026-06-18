import { CONSISTENCY_CATEGORIES, type ConsistencyLanguage } from "./types.js";

export interface ConsistencyPromptSet {
	language: ConsistencyLanguage;
	system: string;
}

const categoryList = CONSISTENCY_CATEGORIES.map(
	(category) => `- ${category}`
).join("\n");

const zhPrompt = `你是角色一致性检查员。输入图片按顺序排列：前面的 REFERENCE 图片定义角色的标准身份、脸、服装、发型、肢体结构和大致比例；后续 FRAME 图片来自同一个视频的关键帧，每张都带有帧号和时间标注。

只报告普通观众在正常播放下也会明显察觉的角色一致性问题。不确定就不要报告。明确忽略由机位距离、焦段、镜头角度、裁切、遮挡、姿势、透视或动作阶段造成的合理差异。

允许分类：
${categoryList}

严重程度只能是 low、medium、high。默认保守，只有真正明显的问题才使用 high。

只输出 JSON 数组，不要 markdown，不要解释。数组元素必须是：
{"frameNumber": 123, "category": "proportion/height", "severity": "high", "comment": "说明问题", "fix": "修改建议"}

如果没有明显问题，输出 []。`;

const enPrompt = `You are a character-consistency checker. The input images are ordered: the REFERENCE image(s) define the character's canonical identity, face, clothing, hair, limb structure, and approximate proportions; each following FRAME image is a keyframe from the same video and is labeled with frame number and timestamp.

Only report character consistency issues that an ordinary viewer would clearly notice during normal playback. When uncertain, report nothing. Explicitly ignore reasonable differences caused by camera distance, lens, angle, crop, occlusion, pose, perspective, or motion phase.

Allowed categories:
${categoryList}

Severity must be low, medium, or high. Be conservative by default; use high only for truly obvious issues.

Output only a JSON array, no markdown and no commentary. Each item must be:
{"frameNumber": 123, "category": "proportion/height", "severity": "high", "comment": "problem description", "fix": "recommended fix"}

If there are no obvious issues, output [].`;

export function getConsistencyPromptSet({
	language,
}: {
	language?: string;
}): ConsistencyPromptSet {
	return language === "en"
		? { language: "en", system: enPrompt }
		: { language: "zh", system: zhPrompt };
}

import type { TransitionPreset } from "./transition-presets";
import type { TransitionVisualSignals } from "./transition-content-analysis";

export interface TransitionRecommendation {
	duration: number;
	presetId: string;
	reason: string;
	score: number;
}

interface RecommendationSignal {
	reason: string;
	score: number;
}

const MOTION_PATTERN =
	/action|sport|move|motion|run|dance|drive|pan|动作|运动|奔跑|舞蹈|驾驶|甩镜/i;
const TECHNOLOGY_PATTERN =
	/tech|digital|screen|game|cyber|code|科技|数字|屏幕|游戏|赛博|代码/i;
const LIGHT_PATTERN = /sun|light|bright|flash|night|灯|光|太阳|夜景|闪光/i;
const DIALOGUE_PATTERN =
	/interview|talk|speech|portrait|person|dialogue|采访|口播|人物|对话|演讲/i;

function isContinuityPreset({ preset }: { preset: TransitionPreset }) {
	return preset.category === "dissolve" || preset.category === "natural";
}

function isGentlePreset({ preset }: { preset: TransitionPreset }) {
	return isContinuityPreset({ preset }) || preset.category === "blur";
}

function scoreLightOrContinuity({
	continuityScore,
	lightScore,
	preset,
}: {
	continuityScore: number;
	lightScore: number;
	preset: TransitionPreset;
}) {
	if (preset.category === "light") return lightScore;
	if (isContinuityPreset({ preset })) return continuityScore;
	return 0;
}

function scoreContinuityOrBlur({
	blurScore,
	continuityScore,
	preset,
}: {
	blurScore: number;
	continuityScore: number;
	preset: TransitionPreset;
}) {
	if (isContinuityPreset({ preset })) return continuityScore;
	if (preset.category === "blur") return blurScore;
	return 0;
}

function closestBeatDistance({
	beatTimes,
	cutTime,
}: {
	beatTimes: number[];
	cutTime: number;
}) {
	let closest = Number.POSITIVE_INFINITY;
	for (const beatTime of beatTimes) {
		closest = Math.min(closest, Math.abs(beatTime - cutTime));
	}
	return closest;
}

function scorePreset({
	beatDistance,
	combinedName,
	pace,
	preset,
	visualSignals,
}: {
	beatDistance: number;
	combinedName: string;
	pace: number;
	preset: TransitionPreset;
	visualSignals?: TransitionVisualSignals;
}): RecommendationSignal {
	const signals: RecommendationSignal[] = [
		{
			reason: "通用自然衔接",
			score:
				preset.id === "dissolve" ? 2 : isContinuityPreset({ preset }) ? 1 : 0,
		},
	];
	if (beatDistance <= 0.12) {
		const beatScore =
			preset.type === "flash"
				? 7
				: preset.category === "camera" || preset.category === "mg"
					? 6
					: preset.category === "split"
						? 3
						: 1;
		signals.push({ reason: "贴合强节拍", score: beatScore });
	}
	if (pace <= 1.5) {
		const paceScore =
			preset.category === "camera" || preset.category === "mg"
				? 5
				: preset.category === "glitch" || preset.category === "split"
					? 4
					: 0;
		signals.push({ reason: "适合快切节奏", score: paceScore });
	}
	if (pace >= 5) {
		signals.push({
			reason: "适合舒缓镜头",
			score: isGentlePreset({ preset }) ? 5 : 0,
		});
	}
	if (MOTION_PATTERN.test(combinedName)) {
		signals.push({
			reason: "匹配运动方向",
			score:
				preset.category === "camera" || preset.category === "split" ? 6 : 0,
		});
	}
	if (TECHNOLOGY_PATTERN.test(combinedName)) {
		signals.push({
			reason: "匹配科技画面",
			score:
				preset.category === "glitch" ? 7 : preset.category === "mg" ? 3 : 0,
		});
	}
	if (LIGHT_PATTERN.test(combinedName)) {
		signals.push({
			reason: "匹配明暗变化",
			score: scoreLightOrContinuity({
				continuityScore: 2,
				lightScore: 7,
				preset,
			}),
		});
	}
	if (DIALOGUE_PATTERN.test(combinedName)) {
		signals.push({
			reason: "保持人物叙事连续",
			score: scoreContinuityOrBlur({
				blurScore: 2,
				continuityScore: 7,
				preset,
			}),
		});
	}
	if (visualSignals && visualSignals.brightnessDelta >= 0.28) {
		signals.push({
			reason: "匹配真实明暗变化",
			score: scoreLightOrContinuity({
				continuityScore: 1,
				lightScore: 10,
				preset,
			}),
		});
	}
	if (visualSignals && visualSignals.colorDistance >= 0.35) {
		signals.push({
			reason: "缓和镜头色差",
			score: scoreContinuityOrBlur({
				blurScore: 4,
				continuityScore: 6,
				preset,
			}),
		});
	}
	if (visualSignals && visualSignals.visualSimilarity >= 0.88) {
		signals.push({
			reason: "保持相近镜头连续",
			score: isContinuityPreset({ preset }) ? 5 : 0,
		});
	}
	if (visualSignals && visualSignals.meanSaturation >= 0.55) {
		signals.push({
			reason: "匹配高饱和画面",
			score:
				preset.category === "light" || preset.category === "glitch" ? 3 : 0,
		});
	}

	const strongestSignal = signals.reduce((strongest, signal) =>
		signal.score > strongest.score ? signal : strongest
	);
	return {
		reason: strongestSignal.reason,
		score: signals.reduce((total, signal) => total + signal.score, 0),
	};
}

export function recommendTransitions({
	beatTimes,
	cutTime,
	fromDuration,
	fromName,
	maxDuration,
	presets,
	toDuration,
	toName,
	visualSignals,
}: {
	beatTimes: number[];
	cutTime: number;
	fromDuration: number;
	fromName: string;
	maxDuration: number;
	presets: TransitionPreset[];
	toDuration: number;
	toName: string;
	visualSignals?: TransitionVisualSignals;
}): TransitionRecommendation[] {
	if (maxDuration <= 0) return [];
	const pace = Math.min(fromDuration, toDuration);
	const beatDistance = closestBeatDistance({ beatTimes, cutTime });
	const combinedName = `${fromName} ${toName}`;
	return presets
		.map((preset, index) => {
			const signal = scorePreset({
				beatDistance,
				combinedName,
				pace,
				preset,
				visualSignals,
			});
			const beatDuration = beatDistance <= 0.12 ? 0.35 : preset.defaultDuration;
			return {
				duration: Math.min(maxDuration, beatDuration),
				presetId: preset.id,
				reason: signal.reason,
				score: signal.score - index / 10_000,
			};
		})
		.sort((left, right) => right.score - left.score)
		.slice(0, 3);
}

import type { JianyingEffectStyleManifest } from "./jianying-text-effect-style-contract.js";
import type { JianyingTextEffectCapabilities } from "./jianying-text-runtime-contract.js";

const EMPTY_EFFECT_CAPABILITIES: JianyingTextEffectCapabilities = {
	staticTexture: false,
	multipleStrokes: false,
	animationComponents: false,
	scriptInfoSticker: false,
	shaderComponents: false,
	threeDimensional: false,
	feedbackComponents: false,
};

export function createEmptyJianyingTextEffectCapabilities() {
	return { ...EMPTY_EFFECT_CAPABILITIES };
}

export function mergeJianyingTextEffectCapabilities({
	values,
}: {
	values: JianyingTextEffectCapabilities[];
}): JianyingTextEffectCapabilities {
	return values.reduce<JianyingTextEffectCapabilities>(
		(merged, current) => ({
			staticTexture: merged.staticTexture || current.staticTexture,
			multipleStrokes: merged.multipleStrokes || current.multipleStrokes,
			animationComponents:
				merged.animationComponents || current.animationComponents,
			scriptInfoSticker: merged.scriptInfoSticker || current.scriptInfoSticker,
			shaderComponents: merged.shaderComponents || current.shaderComponents,
			threeDimensional: merged.threeDimensional || current.threeDimensional,
			feedbackComponents:
				merged.feedbackComponents || current.feedbackComponents,
		}),
		createEmptyJianyingTextEffectCapabilities()
	);
}

export function createJianyingRuntimePackageCapabilities({
	animationComponents,
	feedbackComponents = false,
	effectStyles,
	shaderComponents = false,
	scriptInfoSticker,
	threeDimensional = false,
}: {
	animationComponents: boolean;
	feedbackComponents?: boolean;
	effectStyles: JianyingEffectStyleManifest[];
	shaderComponents?: boolean;
	scriptInfoSticker: boolean;
	threeDimensional?: boolean;
}) {
	return mergeJianyingTextEffectCapabilities({
		values: [
			...effectStyles.map(({ capabilities }) => capabilities),
			{
				...EMPTY_EFFECT_CAPABILITIES,
				animationComponents,
				feedbackComponents,
				shaderComponents,
				scriptInfoSticker,
				threeDimensional,
			},
		],
	});
}

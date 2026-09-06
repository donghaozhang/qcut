import { normalizeJianyingTextRuntimeReference } from "../assets/jianying-text-reference.js";
import type {
	TextFontAssetReference,
	JianyingTextStyleReference,
} from "../types/timeline.js";

export function assertCoverNativeText({
	fontAsset,
	jianyingTextStyle,
	nativeFrameTime,
	nativeUseEffectDefaultColor,
}: {
	fontAsset?: TextFontAssetReference;
	jianyingTextStyle?: JianyingTextStyleReference;
	nativeFrameTime?: number;
	nativeUseEffectDefaultColor?: boolean;
}): void {
	if (fontAsset !== undefined) {
		if (
			!fontAsset ||
			typeof fontAsset !== "object" ||
			fontAsset.kind !== "local-font" ||
			fontAsset.source !== "jianying-cache" ||
			typeof fontAsset.assetId !== "string" ||
			!/^sha256:[a-f0-9]{64}$/.test(fontAsset.assetId) ||
			fontAsset.cssFamily !== `QCutLocal_${fontAsset.assetId.slice(7, 27)}` ||
			![
				fontAsset.familyName,
				fontAsset.fullName,
				fontAsset.postscriptName,
			].every((value) => typeof value === "string" && value.length <= 256)
		)
			throw new Error("Invalid cover font asset");
	}
	if (
		jianyingTextStyle !== undefined &&
		!normalizeJianyingTextRuntimeReference({ value: jianyingTextStyle })
	)
		throw new Error("Invalid cover word-art reference");
	if (
		nativeUseEffectDefaultColor !== undefined &&
		(!jianyingTextStyle || typeof nativeUseEffectDefaultColor !== "boolean")
	)
		throw new Error("Invalid cover word-art color mode");
	if (
		nativeFrameTime !== undefined &&
		(!jianyingTextStyle ||
			typeof nativeFrameTime !== "number" ||
			!Number.isFinite(nativeFrameTime) ||
			nativeFrameTime < 0 ||
			nativeFrameTime >= jianyingTextStyle.templateDuration)
	)
		throw new Error("Invalid cover word-art frame time");
}

import {
	buildJianyingFontCatalog,
	readVerifiedJianyingFontBytes,
} from "../../jianying-font-lab-catalog.js";
import { loadTextLabCatalogDefault } from "../cli/text-lab-cli-process.js";
import type { JianyingTextRuntimeReference } from "../../jianying-text-runtime-contract.js";
import { resolveStyleFromCLI } from "../subtitle/style-presets.js";
import type { ComposePatchOperation } from "./compose-protocol.js";

export interface ComposeTextBinding {
	properties: Record<string, unknown>;
	captionStyle?: ReturnType<typeof resolveStyleFromCLI>;
	richCaption: boolean;
}

export async function resolveComposeText({
	operation,
	dependencies = {
		fonts: buildJianyingFontCatalog,
		text: loadTextLabCatalogDefault,
		readFont: readVerifiedJianyingFontBytes,
	},
}: {
	operation: Extract<
		ComposePatchOperation,
		{ kind: "add-caption" | "add-text-overlay" }
	>;
	dependencies?: {
		fonts: typeof buildJianyingFontCatalog;
		text: typeof loadTextLabCatalogDefault;
		readFont: typeof readVerifiedJianyingFontBytes;
	};
}): Promise<ComposeTextBinding> {
	const richCaption = Boolean(
		operation.asset ||
			operation.font ||
			operation.fancyWord ||
			operation.textAnimation ||
			operation.textTemplateId
	);
	const properties: Record<string, unknown> = {};
	const captionStyle =
		operation.kind === "add-caption" && operation.stylePresetId
			? resolveStyleFromCLI(operation.stylePresetId)
			: undefined;
	if (captionStyle && richCaption) {
		Object.assign(properties, {
			fontFamily: captionStyle.fontFamily,
			fontSize: captionStyle.fontSize,
			color: captionStyle.fontColor,
			fontWeight: captionStyle.bold ? "bold" : "normal",
			strokeColor: captionStyle.outlineColor,
			strokeWidth: captionStyle.outlineWidth,
			backgroundColor: captionStyle.backgroundColor,
			backgroundOpacity: captionStyle.bgOpacity,
			x: captionStyle.position.x / 100,
			y: captionStyle.position.y / 100,
		});
	}
	if (operation.kind === "add-text-overlay" && operation.stylePresetId)
		properties.stylePresetId = operation.stylePresetId;
	if (operation.font) {
		if (
			operation.font.assetType !== "font" ||
			operation.font.provider !== "local"
		)
			throw new Error("Compose font must reference the local Font Lab.");
		const catalog = await dependencies.fonts();
		const font = catalog.entries.find(
			(entry) => entry.fontId === operation.font?.assetId
		);
		if (!font)
			throw new Error(`Compose font not found: ${operation.font.assetId}`);
		await dependencies.readFont({ entry: font });
		properties.fontFamily = font.cssFamily;
		properties.fontAsset = {
			kind: "local-font",
			source: "jianying-cache",
			assetId: font.fontId,
			cssFamily: font.cssFamily,
			familyName: font.familyName,
			fullName: font.fullName,
			postscriptName: font.postscriptName,
		};
	}
	if (operation.fancyWord && operation.asset)
		throw new Error(
			"Choose one native text template or fancy-word style per text element."
		);
	const selectedStyle = operation.fancyWord ?? operation.asset;
	let reference: JianyingTextRuntimeReference | undefined;
	if (selectedStyle || operation.textAnimation) {
		const catalog = await dependencies.text();
		if (selectedStyle) {
			if (
				selectedStyle.provider !== "local" ||
				!["text-template", "fancy-word"].includes(selectedStyle.assetType)
			)
				throw new Error("Compose text must reference the local Text Lab.");
			const style = catalog.styles.styles.find(
				(item) => item.styleId === selectedStyle.assetId
			);
			if (!style || style.compatibility === "preview-only")
				throw new Error(
					`Compose text style unavailable: ${selectedStyle.assetId}`
				);
			if (style.approximation) {
				const { version: _version, ...visualProperties } = style.approximation;
				Object.assign(properties, visualProperties);
			}
			reference = style.runtimeReference
				? structuredClone(style.runtimeReference)
				: undefined;
			if (!reference && !style.approximation)
				throw new Error(
					`Compose text style has no renderable binding: ${selectedStyle.assetId}`
				);
		}
		if (operation.textAnimation) {
			if (
				operation.textAnimation.assetType !== "text-animation" ||
				operation.textAnimation.provider !== "local"
			)
				throw new Error("Compose animation must reference the local Text Lab.");
			const animation = catalog.animations.animations.find(
				(item) => item.animationId === operation.textAnimation?.assetId
			);
			if (!animation || !reference)
				throw new Error(
					"Jianying text animation requires a runtime text template and a cached animation."
				);
			reference.animations = {
				...reference.animations,
				[animation.slot]: {
					source: "jianying-cache",
					resourceId: animation.resourceId,
					packageHash: animation.packageHash,
					duration: Math.min(operation.duration, animation.duration),
				},
			};
		}
	}
	if (reference) properties.jianyingTextStyle = reference;
	if (operation.textTemplateId && !operation.asset && !operation.fancyWord)
		properties.textTemplateId = operation.textTemplateId;
	return { properties, captionStyle, richCaption };
}

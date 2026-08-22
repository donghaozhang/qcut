import { existsSync } from "node:fs";
import path from "node:path";
import type { ResolvedJianyingTextPackage } from "./package-resolver.js";
import type { ResolvedJianyingTextAnimation } from "./animation-package-resolver.js";

const STUDIO_SCRIPT_ROOT_CANDIDATES = [
	["Models", "app-bundle", "SegmentJS"],
	["Resources", "models", "SegmentJS"],
] as const;

const ANIMATION_TYPES = {
	1: "in",
	2: "out",
	3: "loop",
} as const;
const STUDIO_FONT_SIZE_RATIO = 0.4;

function escapeRichTextAttribute({ value }: { value: string }) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeRichTextSlot({ content }: { content: string }) {
	const escaped = content
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\[/g, "［")
		.replace(/\]/g, "］");
	return escaped || " ";
}

function buildStudioRichText({
	content,
	fontPath,
	fontSize,
	packagePath,
	resourceId,
}: {
	content: string;
	fontPath?: string;
	fontSize: number;
	packagePath: string;
	resourceId: string;
}) {
	const studioFontSize =
		Math.round(fontSize * STUDIO_FONT_SIZE_RATIO * 1000) / 1000;
	const textSlot = `<size=${studioFontSize}>[${escapeRichTextSlot({ content })}]</size>`;
	const styledText = fontPath
		? `<font path="${escapeRichTextAttribute({ value: fontPath })}">${textSlot}</font>`
		: textSlot;
	return `<effectStyle id="${escapeRichTextAttribute({ value: resourceId })}" path="${escapeRichTextAttribute({ value: packagePath })}">${styledText}</effectStyle>`;
}

export function resolveJianyingStudioScriptRoot({
	runtimeRoot,
}: {
	runtimeRoot: string;
}) {
	for (const segments of STUDIO_SCRIPT_ROOT_CANDIDATES) {
		const candidate = path.join(runtimeRoot, ...segments);
		if (existsSync(path.join(candidate, "template", "template.js"))) {
			return candidate;
		}
	}
	throw new Error(
		"剪映文字运行时缺少 SegmentJS，无法渲染 StudioAnim 文字动画。"
	);
}

function studioAnimationParameters({
	animations,
	timelineDuration,
}: {
	animations: ResolvedJianyingTextAnimation[];
	timelineDuration: number;
}) {
	const timelineSeconds = timelineDuration / 1_000_000;
	return animations
		.filter(({ loader }) => loader === "studio")
		.map(({ animationType, duration, packagePath, resourceId }) => {
			const clampedDuration = Math.min(timelineSeconds, duration);
			const isLoop = animationType === 3;
			return {
				anim_type: ANIMATION_TYPES[animationType],
				anim_script_type: "js",
				anim_resource_id: resourceId,
				anim_resource_path: packagePath,
				anim_start_time:
					animationType === 2 ? timelineSeconds - clampedDuration : 0,
				duration: isLoop ? timelineSeconds : clampedDuration,
				loop_duration: isLoop ? clampedDuration : 0,
			};
		});
}

export function buildJianyingStudioAnimationEnvironment({
	animations,
	content,
	fontPath,
	fontSize,
	packageKind,
	packagePath,
	resourceId,
	runtimeRoot,
	studioScriptRoot,
	timelineDuration,
}: {
	animations: ResolvedJianyingTextAnimation[];
	content: string;
	fontPath?: string;
	fontSize: number;
	packageKind: ResolvedJianyingTextPackage["packageKind"];
	packagePath: string;
	resourceId?: string;
	runtimeRoot: string;
	studioScriptRoot?: string;
	timelineDuration: number;
}): NodeJS.ProcessEnv {
	const anims = studioAnimationParameters({ animations, timelineDuration });
	if (anims.length === 0) return {};
	if (packageKind !== "TextStyle") {
		throw new Error(
			`${packageKind} 与外接 StudioAnim 的组合暂未支持，请改用 TextStyle 花字。`
		);
	}
	if (!resourceId) {
		throw new Error("TextStyle 缺少资源 ID，无法组合 StudioAnim 文字动画。");
	}
	if (!(Number.isFinite(fontSize) && fontSize > 0)) {
		throw new Error("TextStyle 字号无效，无法组合 StudioAnim 文字动画。");
	}
	const segmentJsPath =
		studioScriptRoot ?? resolveJianyingStudioScriptRoot({ runtimeRoot });
	return {
		JY_TEXT_SEGMENT_PAYLOAD: JSON.stringify({
			richText: buildStudioRichText({
				content,
				fontPath,
				fontSize,
				packagePath,
				resourceId,
			}),
			version: "2",
		}),
		JY_TEXT_STUDIO_SCRIPT_PARAMETERS: JSON.stringify({
			segment_js_path: segmentJsPath,
		}),
		JY_TEXT_STUDIO_ANIMATION_PARAMETERS: JSON.stringify({
			children: [{ name: "qcut-text", anims }],
		}),
	};
}

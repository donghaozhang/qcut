import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
	AnalysisResult,
	PromoTextAnimationPreset,
	SceneBreakdown,
} from "../core/types";

const DEFAULT_PROMO_PRESETS: PromoTextAnimationPreset[] = [
	{ phase: "entrance", presetId: "typewriter-cursor" },
	{ phase: "loop", presetId: "wave" },
	{ phase: "exit", presetId: "rotate-out" },
	{ phase: "entrance", presetId: "laser-etch" },
	{ phase: "loop", presetId: "shimmer" },
	{ phase: "exit", presetId: "typewriter-out" },
];

export function writePromoArtifacts({
	shotDir,
	analysis,
	breakdown,
	shotDuration,
	presets,
}: {
	shotDir: string;
	analysis: AnalysisResult;
	breakdown: SceneBreakdown;
	shotDuration: number;
	presets?: PromoTextAnimationPreset[];
}): void {
	const selectedPresets =
		presets && presets.length > 0 ? presets : DEFAULT_PROMO_PRESETS;
	const selectAllShortcut =
		process.platform === "darwin" ? "Meta+A" : "Control+A";
	const totalDuration = breakdown.scenes.length * shotDuration;
	const media = breakdown.scenes.map((scene) => ({
		alias: `shot-${scene.index}`,
		path: resolve(shotDir, `${scene.fileStem}.png`),
	}));
	const visualElements = breakdown.scenes.map((scene, index) => ({
		alias: `visual-${scene.index}`,
		type: "media",
		media: `shot-${scene.index}`,
		startTime: index * shotDuration,
		duration: shotDuration,
	}));
	const timeline = {
		replace: true,
		project: { width: 1920, height: 1080, fps: 30 },
		media,
		tracks: [
			{
				alias: "visuals",
				name: "Storyboard",
				type: "media",
				elements: visualElements,
			},
		],
	};
	const actions = [
		{
			action: "hide",
			label: "Start from a clean frame",
			chapter: "setup",
		},
		{
			action: "click",
			target: "panel.text",
			waitFor: "text.add",
			label: "Open the text library",
			chapter: "text-workflow",
		},
		...breakdown.scenes.flatMap((scene, index) => {
			const preset = selectedPresets[index % selectedPresets.length];
			const startTime = index * shotDuration;
			const seek =
				index === 0
					? []
					: [
							{
								action: "drag",
								from: "timeline.playhead",
								toTime: startTime,
								durationMs: 520,
								label: `Move to title ${index + 1}`,
								chapter: "text-workflow",
							},
						];
			return [
				...seek,
				{
					action: "click",
					target: "text.add",
					waitFor: "text.content",
					label: `Add title ${index + 1}`,
					chapter: "text-workflow",
				},
				{
					action: "click",
					target: "text.font-size",
					label: `Set title ${index + 1} size`,
					chapter: "text-workflow",
				},
				{
					action: "press",
					keys: [selectAllShortcut],
					chapter: "text-workflow",
				},
				{
					action: "type",
					text: "82",
					chapter: "text-workflow",
				},
				{
					action: "press",
					keys: ["Enter"],
					chapter: "text-workflow",
				},
				{
					action: "click",
					target: "text.content",
					label: `Edit title ${index + 1}`,
					chapter: "text-workflow",
				},
				{
					action: "press",
					keys: [selectAllShortcut],
					chapter: "text-workflow",
				},
				{
					action: "type",
					text: scene.title,
					intervalMs: 42,
					label: `Type "${scene.title}"`,
					chapter: "text-workflow",
				},
				{
					action: "click",
					target: "text.animation",
					waitFor: `text.animation.${preset.phase}`,
					label: "Open text animation controls",
					chapter: "animation-workflow",
				},
				{
					action: "click",
					target: `text.animation.${preset.phase}`,
					label: `Choose the ${preset.phase} phase`,
					chapter: "animation-workflow",
				},
				{
					action: "click",
					target: `text.animation.${preset.phase}.${preset.presetId}`,
					label: `Apply ${preset.presetId}`,
					chapter: "animation-workflow",
				},
				{
					action: "sleep",
					durationMs: 650,
					chapter: "animation-workflow",
				},
			];
		}),
		{
			action: "drag",
			from: "timeline.playhead",
			toTime: 0,
			durationMs: 600,
			label: "Return to the opening frame",
			chapter: "playback",
		},
		{
			action: "click",
			target: "timeline.play",
			waitFor: "preview.frame-ready",
			label: "Play the completed text sequence",
			chapter: "playback",
		},
		{
			action: "sleep",
			durationMs: totalDuration * 1000 + 200,
			label: "Capture the completed title reel",
			chapter: "showcase",
		},
		{
			action: "hide",
			label: "Hide pointer for the end frame",
			chapter: "outro",
		},
	];
	const demoPlan = {
		version: 2,
		name: `${analysis.title} Text Animation Promo`,
		project: { name: `${analysis.title} Text Animation Promo` },
		timeline: "@promo-timeline.json",
		replace: true,
		capture: {
			actions: "@promo-actions.json",
			record: "promo-editor-demo.mp4",
			prewarm: true,
			prerollMs: 700,
			postrollMs: 900,
			minimumWidth: 1920,
			minimumHeight: 1080,
		},
		export: {
			output: "promo-final.mp4",
			preset: "youtube-1080p",
			verifyFrames: [
				Math.min(1, totalDuration / 4),
				totalDuration / 2,
				Math.max(0, totalDuration - 0.5),
			],
		},
	};

	writeFileSync(
		join(shotDir, "promo-timeline.json"),
		`${JSON.stringify(timeline, null, 2)}\n`,
	);
	writeFileSync(
		join(shotDir, "promo-actions.json"),
		`${JSON.stringify(actions, null, 2)}\n`,
	);
	writeFileSync(
		join(shotDir, "promo-demo.json"),
		`${JSON.stringify(demoPlan, null, 2)}\n`,
	);
}

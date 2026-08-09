import { useEffect, useState } from "react";
import {
	buildClipTransitionContentStyle,
	buildClipTransitionCssFilter,
	buildClipTransitionCssTransform,
	buildClipTransitionMaskStyle,
	buildClipTransitionOverlayStyle,
	getClipTransitionLayerPresentation,
	type ClipTransitionRole,
} from "@/lib/transitions/clip-transition-presentation";
import type { ClipTransition } from "@/types/timeline";
import { getClipTransitionPresetConfig } from "./transition-presets";
import type { TransitionPreset } from "./transition-preset-types";
import { getTransitionLabRecipe } from "./transition-lab-presets";
import { ShaderTransitionPreview } from "./shader-transition-preview";

export interface TransitionPreviewSources {
	from?: string;
	to?: string;
}

function previewTransition({
	preset,
}: {
	preset: TransitionPreset;
}): ClipTransition {
	const config = getClipTransitionPresetConfig({ preset });
	return {
		id: `preview-${preset.id}`,
		fromElementId: "preview-from",
		toElementId: "preview-to",
		presetId: preset.id,
		type: config?.type ?? "dissolve",
		direction: config?.direction,
		tuning: config?.tuning,
		maskShape: config?.maskShape,
		duration: preset.defaultDuration,
		easing: config?.easing ?? "easeInOut",
	};
}

function PreviewLayer({
	layerRole,
	transition,
	progress,
	source,
}: {
	layerRole: ClipTransitionRole;
	transition: ClipTransition;
	progress: number;
	source: string;
}) {
	const presentation = getClipTransitionLayerPresentation({
		transition,
		role: layerRole,
		progress,
		canvasWidth: 240,
		canvasHeight: 135,
	});
	const overlayStyle = buildClipTransitionOverlayStyle({ presentation });

	return (
		<div
			className="absolute inset-0 overflow-hidden bg-black"
			style={{
				opacity: presentation.opacity,
				backgroundColor: presentation.backgroundColor,
				clipPath: presentation.clipPath,
				filter: buildClipTransitionCssFilter({ presentation }),
				transform: buildClipTransitionCssTransform({ presentation }),
				transformOrigin: presentation.transformOrigin ?? "center",
				...buildClipTransitionMaskStyle({ presentation }),
			}}
		>
			<img
				src={source}
				alt=""
				className="h-full w-full object-cover"
				style={buildClipTransitionContentStyle({ presentation })}
				draggable={false}
			/>
			{overlayStyle ? <div aria-hidden="true" style={overlayStyle} /> : null}
		</div>
	);
}

function CssTransitionPreview({
	preset,
	isPlaying,
	sources,
}: {
	preset: TransitionPreset;
	isPlaying: boolean;
	sources?: TransitionPreviewSources;
}) {
	const [progress, setProgress] = useState(0);
	const transition = previewTransition({ preset });
	const fromSource = sources?.from || preset.preview.from;
	const toSource = sources?.to || preset.preview.to;

	useEffect(() => {
		if (!isPlaying) {
			setProgress(0);
			return;
		}

		let animationFrame = 0;
		let startedAt: number | null = null;
		const durationMs = Math.max(400, preset.defaultDuration * 1_000);
		const tick = (timestamp: number) => {
			startedAt ??= timestamp;
			setProgress(((timestamp - startedAt) % durationMs) / durationMs);
			animationFrame = requestAnimationFrame(tick);
		};
		animationFrame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(animationFrame);
	}, [isPlaying, preset.defaultDuration]);

	return (
		<div className="relative h-full w-full overflow-hidden bg-neutral-950">
			<PreviewLayer
				layerRole="from"
				transition={transition}
				progress={progress}
				source={fromSource}
			/>
			<PreviewLayer
				layerRole="to"
				transition={transition}
				progress={progress}
				source={toSource}
			/>
			<div className="absolute inset-x-2 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-white/25">
				<div
					className="h-full rounded-full bg-white/85"
					data-testid="transition-preview-progress"
					style={{ width: `${progress * 100}%` }}
				/>
			</div>
		</div>
	);
}

export function TransitionPreview({
	preset,
	isPlaying,
	sources,
}: {
	preset: TransitionPreset;
	isPlaying: boolean;
	sources?: TransitionPreviewSources;
}) {
	const recipe = getTransitionLabRecipe({ presetId: preset.id });
	if (!recipe) {
		return (
			<CssTransitionPreview
				preset={preset}
				isPlaying={isPlaying}
				sources={sources}
			/>
		);
	}

	const fromSource = sources?.from || preset.preview.from;
	const toSource = sources?.to || preset.preview.to;
	return (
		<ShaderTransitionPreview
			duration={preset.defaultDuration}
			fallback={
				<CssTransitionPreview
					preset={preset}
					isPlaying={isPlaying}
					sources={sources}
				/>
			}
			fromSource={fromSource}
			isPlaying={isPlaying}
			recipe={recipe}
			toSource={toSource}
		/>
	);
}

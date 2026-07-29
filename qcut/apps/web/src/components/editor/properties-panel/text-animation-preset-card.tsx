import type {
	TextAnimationDecorationState,
	TextAnimationLayout,
	TextAnimationMaskState,
	TextAnimationRect,
	TextAnimationVisualState,
} from "@qcut/editor-core/text-animation";
import { CircleOff, Heart } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import type { TextAnimationPresetDefinition } from "@/lib/text/text-animation-presets";
import {
	createTextAnimationPresetPreview,
	evaluateTextAnimationPresetPreview,
	TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
	type TextAnimationPresetPreview,
} from "@/lib/text/text-animation-preset-preview";
import { cn } from "@/lib/utils";
import { useTextAnimationPreview } from "./use-text-animation-preview";
import { TextAnimation3DPresetPreview } from "./text-animation-3d-preset-preview";

function maskClipPath({
	mask,
}: {
	mask: TextAnimationMaskState | undefined;
}): string | undefined {
	if (!mask) return;
	const hiddenPercent = (1 - mask.progress) * 100;
	if (mask.direction === "right") {
		return `inset(0 ${hiddenPercent}% 0 0)`;
	}
	if (mask.direction === "left") {
		return `inset(0 0 0 ${hiddenPercent}%)`;
	}
	if (mask.direction === "down") {
		return `inset(0 0 ${hiddenPercent}% 0)`;
	}
	return `inset(${hiddenPercent}% 0 0 0)`;
}

export function textAnimationVisualStyle({
	visual,
}: {
	visual: TextAnimationVisualState;
}): CSSProperties {
	const projection = visual.projection;
	const projectionRotationX =
		projection?.kind === "plane"
			? projection.groupRotationXDeg
			: (projection?.tiltXDeg ?? 0);
	const projectionRotationY =
		projection?.kind === "plane"
			? projection.groupRotationYDeg
			: (projection?.yawDeg ?? 0);
	const perspective = projection
		? `${Math.max(60, 180 / Math.tan((projection.cameraFovDeg * Math.PI) / 360))}px`
		: undefined;
	return {
		clipPath: maskClipPath({ mask: visual.mask }),
		filter: visual.blurPx > 0 ? `blur(${visual.blurPx}px)` : undefined,
		opacity: visual.opacity,
		transform: `${perspective ? `perspective(${perspective}) ` : ""}translate3d(${visual.translateX}px, ${visual.translateY}px, ${visual.translateZ}px) rotateX(${visual.rotationXDeg + projectionRotationX}deg) rotateY(${visual.rotationYDeg + projectionRotationY}deg) rotate(${visual.rotationDeg}deg) scale(${visual.scaleX}, ${visual.scaleY})`,
		transformStyle: projection ? "preserve-3d" : undefined,
		transformOrigin:
			visual.transformOrigin === "bottomCenter" ? "50% 100%" : undefined,
	};
}

function decorationKey({
	decoration,
}: {
	decoration: TextAnimationDecorationState;
}): string {
	if (decoration.kind === "cursor") {
		return `cursor:${decoration.afterGrapheme}`;
	}
	if (decoration.kind === "laser") {
		return `laser:${decoration.unitIndex}`;
	}
	return `heart:${decoration.id}`;
}

function cursorStyle({
	decoration,
	layout,
}: {
	decoration: Extract<TextAnimationDecorationState, { kind: "cursor" }>;
	layout: TextAnimationLayout;
}): CSSProperties {
	const previousGrapheme = layout.graphemes[decoration.afterGrapheme - 1];
	return {
		color: decoration.color,
		left: previousGrapheme
			? previousGrapheme.bounds.x + previousGrapheme.bounds.width
			: 0,
		opacity: decoration.opacity,
		top: 0,
	};
}

function laserStyle({
	decoration,
	preview,
}: {
	decoration: Extract<TextAnimationDecorationState, { kind: "laser" }>;
	preview: TextAnimationPresetPreview;
}): CSSProperties {
	const bounds = previewLaserBounds({
		preview,
		unitIndex: decoration.unitIndex,
	});
	const progress = Math.min(1, Math.max(0, decoration.progress));
	const isHorizontal =
		decoration.direction === "left" || decoration.direction === "right";
	const position =
		decoration.direction === "left" || decoration.direction === "up"
			? 1 - progress
			: progress;
	const thickness = Math.max(1, decoration.thicknessPx);

	return {
		backgroundColor: decoration.color,
		boxShadow: `0 0 ${decoration.glowPx}px ${decoration.color}`,
		height: isHorizontal ? bounds.height : thickness,
		left: isHorizontal ? bounds.x + bounds.width * position : bounds.x,
		top: isHorizontal ? bounds.y : bounds.y + bounds.height * position,
		width: isHorizontal ? thickness : bounds.width,
	};
}

function previewLaserBounds({
	preview,
	unitIndex,
}: {
	preview: TextAnimationPresetPreview;
	unitIndex: number;
}): TextAnimationRect {
	const unit = preview.compiled[preview.phase]?.units[unitIndex];
	const unitGraphemes = unit
		? preview.layout.graphemes.slice(unit.graphemeStart, unit.graphemeEnd)
		: [];
	if (unitGraphemes.length === 0) return preview.layout.bounds;
	const left = Math.min(...unitGraphemes.map(({ bounds }) => bounds.x));
	const top = Math.min(...unitGraphemes.map(({ bounds }) => bounds.y));
	const right = Math.max(
		...unitGraphemes.map(({ bounds }) => bounds.x + bounds.width)
	);
	const bottom = Math.max(
		...unitGraphemes.map(({ bounds }) => bounds.y + bounds.height)
	);
	return {
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
	};
}

function TextAnimationPreviewDecoration({
	decoration,
	preview,
}: {
	decoration: TextAnimationDecorationState;
	preview: TextAnimationPresetPreview;
}) {
	if (decoration.kind === "cursor") {
		return (
			<span
				className="absolute font-mono text-[15px] font-semibold leading-5"
				style={cursorStyle({ decoration, layout: preview.layout })}
			>
				{decoration.text}
			</span>
		);
	}
	if (decoration.kind === "laser") {
		return (
			<span
				className="pointer-events-none absolute"
				style={laserStyle({ decoration, preview })}
			/>
		);
	}
	return (
		<Heart
			className="pointer-events-none absolute size-2 fill-current"
			style={{
				color: decoration.color,
				left: decoration.x,
				opacity: decoration.opacity,
				top: decoration.y,
				transform: `translate(-50%, -50%) rotate(${decoration.rotationDeg}deg) scale(${decoration.scale})`,
			}}
		>
			<title>Heart particle</title>
		</Heart>
	);
}

function TextAnimationPresetPreviewContent({
	preview,
	progress,
}: {
	preview: TextAnimationPresetPreview;
	progress: number;
}) {
	const frameState = evaluateTextAnimationPresetPreview({ preview, progress });
	return (
		<div
			className="relative h-5 font-mono text-[15px] font-semibold leading-5 tracking-normal text-foreground"
			data-active-phases={frameState.activePhases.join(",")}
			style={{
				...textAnimationVisualStyle({ visual: frameState.container }),
				opacity: frameState.render ? frameState.container.opacity : 0,
				width: preview.layout.bounds.width,
			}}
		>
			{preview.graphemes.map((grapheme, index) => {
				const visual = frameState.units[index]?.visual;
				return (
					<span
						className="inline-block text-center"
						key={`${index}:${grapheme}`}
						style={{
							...(visual ? textAnimationVisualStyle({ visual }) : {}),
							width: TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
						}}
					>
						{grapheme}
					</span>
				);
			})}
			{frameState.decorations.map((decoration) => (
				<TextAnimationPreviewDecoration
					decoration={decoration}
					key={decorationKey({ decoration })}
					preview={preview}
				/>
			))}
		</div>
	);
}

function is3DPreview({
	preset,
}: {
	preset: TextAnimationPresetDefinition;
}): boolean {
	return (
		preset.previewKind === "flip-3d" ||
		preset.previewKind === "cylinder-3d" ||
		preset.previewKind === "jitter-3d"
	);
}

export function TextAnimationPresetCard({
	isPreviewing,
	name,
	preset,
}: {
	isPreviewing: boolean;
	name: string;
	preset: TextAnimationPresetDefinition;
}) {
	const progress = useTextAnimationPreview({
		active: isPreviewing,
		duration: preset.defaultDuration,
	});
	const preview = useMemo(
		() => createTextAnimationPresetPreview({ preset }),
		[preset]
	);

	return (
		<div className="flex min-w-0 flex-col">
			<div
				aria-hidden="true"
				className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-[5px] bg-muted/70"
				data-testid={`text-animation-preview-${preset.phase}-${preset.id}`}
				data-preview-progress={progress.toFixed(3)}
			>
				{preset.id === "none" ? (
					<CircleOff className="size-7 text-muted-foreground">
						<title>{name}</title>
					</CircleOff>
				) : is3DPreview({ preset }) ? (
					<TextAnimation3DPresetPreview preview={preview} progress={progress} />
				) : (
					<TextAnimationPresetPreviewContent
						preview={preview}
						progress={progress}
					/>
				)}
			</div>
			<div
				className={cn(
					"truncate border-t border-border/60 px-1.5 py-1 text-center text-[11px] font-medium text-foreground",
					preset.id === "none" && "text-muted-foreground"
				)}
				title={name}
			>
				{name}
			</div>
		</div>
	);
}

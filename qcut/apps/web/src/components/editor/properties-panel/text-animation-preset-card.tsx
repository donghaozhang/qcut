import type {
	TextAnimationDecorationState,
	TextAnimationLayout,
	TextAnimationMaskState,
	TextAnimationRect,
	TextAnimationVisualState,
} from "@qcut/editor-core/text-animation";
import { CircleOff, Heart } from "lucide-react";
import {
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from "react";
import type { TextAnimationPresetDefinition } from "@/lib/text/text-animation-presets";
import {
	createTextAnimationPresetPreview,
	evaluateTextAnimationPresetPreview,
	TEXT_ANIMATION_PREVIEW_GLYPH_WIDTH,
	type TextAnimationPresetPreview,
} from "@/lib/text/text-animation-preset-preview";
import { cn } from "@/lib/utils";
import { useTextAnimationPreview } from "./use-text-animation-preview";
import { TextAnimationProjectivePresetPreview } from "./text-animation-projective-preset-preview";

const PROJECTIVE_PRESET_IDS = new Set(["flip-3d", "cylinder-3d", "jitter-3d"]);

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
	// The DOM preview cannot displace raster tiles, so a shatter reads as a
	// blurred fade whose strength tracks the dissolve front. The real preview
	// and the export both go through the canvas tile pass.
	const shatterBlurPx = visual.shatter ? visual.shatter.progress * 3 : 0;
	const blurPx = Math.max(visual.blurPx, shatterBlurPx);
	const colorMix =
		visual.colorMix && visual.colorMix.amount > 0 ? visual.colorMix : undefined;
	const glow = visual.postProcess?.glow;
	return {
		clipPath: maskClipPath({ mask: visual.mask }),
		// The card inherits its text color, so the color channel blends the
		// animated tint against currentColor — same math as the canvas path.
		// Multiply-mode tints also use this blend: against the near-white
		// preview foreground a multiplicative filter and a replace blend are
		// visually identical.
		color: colorMix
			? `color-mix(in srgb, ${colorMix.color} ${Math.round(colorMix.amount * 100)}%, currentcolor)`
			: undefined,
		textShadow:
			glow && glow.intensity > 0
				? `0 0 ${glow.radiusPx}px color-mix(in srgb, ${glow.color} ${Math.round(glow.intensity * 100)}%, transparent)`
				: undefined,
		filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
		opacity: visual.shatter
			? visual.opacity * (1 - visual.shatter.progress * 0.85)
			: visual.opacity,
		// Bare 3D rotation channels (keyframe documents without a projective
		// pipeline) get real CSS rotations, which foreshorten like the canvas.
		transform: `translate3d(${visual.translateX}px, ${visual.translateY}px, 0) rotate(${visual.rotationDeg}deg) rotateX(${visual.rotationXDeg ?? 0}deg) rotateY(${visual.rotationYDeg ?? 0}deg) scale(${visual.scaleX}, ${visual.scaleY})`,
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
	if (decoration.kind === "particles") {
		return `particles:${decoration.shape}`;
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
	if (decoration.kind === "particles") {
		if (decoration.shape === "spark") {
			return (
				<>
					{decoration.items.map((item, index) => (
						<span
							className="pointer-events-none absolute origin-left"
							key={`spark:${index}`}
							style={{
								backgroundColor: "#fff7e6",
								height: 1.5,
								left:
									item.x -
									Math.sin((item.rotationDeg * Math.PI) / 180) * item.sizePx,
								opacity: item.opacity * 0.8,
								top:
									item.y +
									Math.cos((item.rotationDeg * Math.PI) / 180) * item.sizePx,
								transform: `rotate(${item.rotationDeg - 90}deg)`,
								width: item.sizePx,
							}}
						/>
					))}
				</>
			);
		}
		return (
			<>
				{decoration.items.map((item, index) => (
					<span
						className="pointer-events-none absolute"
						key={`${decoration.shape}:${index}`}
						style={{
							backgroundColor: decoration.palette[item.colorIndex] ?? "#f43f5e",
							borderRadius: decoration.shape === "coin" ? "50%" : 1,
							height:
								decoration.shape === "coin" ? item.sizePx : item.sizePx * 0.9,
							left: item.x,
							opacity: item.opacity,
							top: item.y,
							transform: `translate(-50%, -50%) rotate(${item.rotationDeg}deg)`,
							width:
								decoration.shape === "coin"
									? item.sizePx
									: item.sizePx * (decoration.shape === "ribbon" ? 0.38 : 0.7),
						}}
					/>
				))}
			</>
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
	fillScale,
	preview,
	progress,
}: {
	fillScale: number;
	preview: TextAnimationPresetPreview;
	progress: number;
}) {
	const frameState = evaluateTextAnimationPresetPreview({ preview, progress });
	const visualStyle = textAnimationVisualStyle({
		visual: frameState.container,
	});
	return (
		<div
			className="relative h-5 font-mono text-[15px] font-semibold leading-5 tracking-normal text-foreground"
			data-active-phases={frameState.activePhases.join(",")}
			style={{
				...visualStyle,
				opacity: frameState.render ? frameState.container.opacity : 0,
				// The evaluated layout is 54px wide; scaling it to the measured
				// card fills the thumbnail the way Jianying's do instead of
				// floating a small line in empty space. Scale composes with the
				// frame transform, so the animation math is untouched.
				transform: `scale(${fillScale}) ${visualStyle.transform ?? ""}`,
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

/**
 * Static pose per phase, chosen so every idle thumbnail stays legible the way
 * Jianying's do: entrances mostly arrived, exits only starting to leave, and
 * loops frozen mid-motion in their signature shape.
 */
const STATIC_PREVIEW_PROGRESS: Record<
	TextAnimationPresetDefinition["phase"],
	number
> = {
	entrance: 0.8,
	exit: 0.25,
	loop: 0.35,
};

/** Portion of the card width the preview line should span, like Jianying. */
const PREVIEW_FILL_RATIO = 0.84;

function usePreviewFillScale({ layoutWidth }: { layoutWidth: number }): {
	boxRef: React.RefObject<HTMLDivElement | null>;
	fillScale: number;
} {
	const boxRef = useRef<HTMLDivElement | null>(null);
	const [fillScale, setFillScale] = useState(1.5);

	useLayoutEffect(() => {
		const box = boxRef.current;
		if (!box || layoutWidth <= 0) return;
		const measure = () => {
			const width = box.clientWidth;
			if (width > 0) {
				setFillScale(Math.max(1, (width * PREVIEW_FILL_RATIO) / layoutWidth));
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(box);
		return () => observer.disconnect();
	}, [layoutWidth]);

	return { boxRef, fillScale };
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
		staticProgress: STATIC_PREVIEW_PROGRESS[preset.phase],
	});
	const preview = useMemo(
		() => createTextAnimationPresetPreview({ preset }),
		[preset]
	);
	const { boxRef, fillScale } = usePreviewFillScale({
		layoutWidth: preview.layout.bounds.width,
	});

	return (
		<div className="flex min-w-0 flex-col">
			<div
				aria-hidden="true"
				className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-t-[5px] bg-muted/70"
				data-testid={`text-animation-preview-${preset.phase}-${preset.id}`}
				data-preview-progress={progress.toFixed(3)}
				ref={boxRef}
			>
				{preset.id === "none" ? (
					<CircleOff className="size-7 text-muted-foreground">
						<title>{name}</title>
					</CircleOff>
				) : PROJECTIVE_PRESET_IDS.has(preset.id) ? (
					<TextAnimationProjectivePresetPreview
						preview={preview}
						progress={progress}
					/>
				) : (
					<TextAnimationPresetPreviewContent
						fillScale={fillScale}
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

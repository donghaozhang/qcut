import type { EffectParameters, EffectRenderProgram } from "@qcut/editor-core";
import { resolveEffectOverlayPreviewUrl } from "@/lib/effects/effect-overlay-resources";

const FIT_CLASS_NAMES = {
	contain: "object-contain",
	cover: "object-cover",
	stretch: "object-fill",
} as const;

/**
 * CSS radial-gradient vignette matching the FFmpeg `vignette` export. CSS has
 * no vignette filter, so darkened corners are drawn as an overlay in both the
 * catalog thumbnail and the live preview (export burns it in via unsharp/eq).
 */
function vignetteBackground({ strength }: { strength: number }): string {
	const alpha = Math.min(0.85, (strength / 100) * 0.85);
	const innerStop = Math.max(28, 62 - (strength / 100) * 34);
	return `radial-gradient(ellipse at center, transparent ${innerStop}%, rgba(0,0,0,${alpha.toFixed(3)}) 100%)`;
}

export function EffectOverlayLayers({
	program,
	parameters,
}: {
	program?: EffectRenderProgram;
	parameters?: EffectParameters;
}) {
	const stages =
		program?.stages.filter((stage) => stage.kind === "overlay") ?? [];
	const vignette = parameters?.vignette ?? 0;
	if (stages.length === 0 && vignette <= 0) return null;

	return (
		<div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
			{vignette > 0 ? (
				<div
					className="absolute inset-0 size-full"
					style={{ background: vignetteBackground({ strength: vignette }) }}
					data-effect-vignette={vignette}
				/>
			) : null}
			{stages.map((stage, index) => (
				<img
					key={`${stage.resourceId}-${index}`}
					src={resolveEffectOverlayPreviewUrl({
						resourceId: stage.resourceId,
					})}
					alt=""
					className={`absolute inset-0 size-full ${FIT_CLASS_NAMES[stage.fit]}`}
					style={{
						mixBlendMode: stage.blendMode,
						opacity: stage.opacity,
					}}
					data-effect-overlay-resource={stage.resourceId}
					draggable={false}
				/>
			))}
		</div>
	);
}

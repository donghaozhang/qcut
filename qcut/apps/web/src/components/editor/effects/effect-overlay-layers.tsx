import type { EffectRenderProgram } from "@qcut/editor-core";
import { resolveEffectOverlayPreviewUrl } from "@/lib/effects/effect-overlay-resources";

const FIT_CLASS_NAMES = {
	contain: "object-contain",
	cover: "object-cover",
	stretch: "object-fill",
} as const;

export function EffectOverlayLayers({
	program,
}: {
	program?: EffectRenderProgram;
}) {
	const stages =
		program?.stages.filter((stage) => stage.kind === "overlay") ?? [];
	if (stages.length === 0) return null;

	return (
		<div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
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

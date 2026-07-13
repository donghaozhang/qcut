import { useEffect, useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MediaItem } from "@/stores/media/media-store";
import type { MediaColorSettings } from "@/types/timeline";
import { captureMediaColorFrame } from "@/lib/color/color-analysis";
import { processColorImageData } from "@/lib/color/color-pixel-processor";
import { drawColorScope, type ColorScopeMode } from "@/lib/color/color-scopes";

const SCOPE_MODES: Array<{ value: ColorScopeMode; label: string }> = [
	{ value: "histogram", label: "直方图" },
	{ value: "waveform", label: "波形图" },
	{ value: "vectorscope", label: "矢量图" },
	{ value: "parade", label: "RGB" },
];

export function ColorScopesPanel({
	mediaItem,
	sourceTime,
	settings,
	frameSeed,
}: {
	mediaItem: MediaItem | undefined;
	sourceTime: number;
	settings: MediaColorSettings;
	frameSeed: number;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [mode, setMode] = useState<ColorScopeMode>("histogram");
	const [error, setError] = useState<string>();
	useEffect(() => {
		if (!mediaItem || !canvas.current) return;
		let cancelled = false;
		const render = async () => {
			try {
				const source = await captureMediaColorFrame({ mediaItem, sourceTime });
				if (cancelled || !canvas.current) return;
				const graded = processColorImageData({
					imageData: source,
					settings,
					frameSeed,
				});
				drawColorScope({ canvas: canvas.current, imageData: graded, mode });
				setError(undefined);
			} catch (caught) {
				if (!cancelled) {
					setError(caught instanceof Error ? caught.message : "示波器不可用");
				}
			}
		};
		void render();
		return () => {
			cancelled = true;
		};
	}, [frameSeed, mediaItem, mode, settings, sourceTime]);
	return (
		<div className="space-y-3" data-testid="color-scopes-panel">
			<ToggleGroup
				type="single"
				value={mode}
				onValueChange={(value) => {
					if (SCOPE_MODES.some((candidate) => candidate.value === value)) {
						setMode(value as ColorScopeMode);
					}
				}}
				className="grid grid-cols-4"
			>
				{SCOPE_MODES.map((scope) => (
					<ToggleGroupItem
						key={scope.value}
						value={scope.value}
						aria-label={scope.label}
					>
						{scope.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<div className="aspect-[12/7] overflow-hidden rounded border border-border bg-black">
				<canvas
					ref={canvas}
					className="size-full"
					aria-label={`${mode} scope`}
					role="img"
				/>
			</div>
			{error ? <p className="text-[10px] text-destructive">{error}</p> : null}
		</div>
	);
}

"use client";

import { useEffect, useRef } from "react";
import { drawColorScope, type ColorScopeMode } from "@/lib/color/color-scopes";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useScopeDockFrame } from "@/hooks/preview/use-scope-dock-frame";
import {
	SCOPE_DOCK_MAX_HEIGHT,
	SCOPE_DOCK_MIN_HEIGHT,
	SCOPE_DOCK_ORDER,
	usePreviewViewStore,
} from "@/stores/editor/preview-view-store";

const SCOPE_LABEL_KEYS: Record<ColorScopeMode, TranslationKey> = {
	parade: "editor.preview.scopeParade",
	waveform: "editor.preview.scopeWaveform",
	vectorscope: "editor.preview.scopeVectorscope",
	histogram: "editor.preview.scopeHistogram",
};

function ScopeTile({
	mode,
	imageData,
	label,
}: {
	mode: ColorScopeMode;
	imageData: ImageData | null;
	label: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !imageData) return;
		drawColorScope({ canvas, imageData, mode });
	}, [imageData, mode]);

	return (
		<div
			className="relative min-w-0 flex-1 overflow-hidden rounded border border-border/60 bg-[#090909]"
			data-testid={`scope-tile-${mode}`}
		>
			<canvas ref={canvasRef} className="size-full" />
			<span className="pointer-events-none absolute top-1 left-1.5 text-[10px] text-white/50">
				{label}
			</span>
		</div>
	);
}

/**
 * Height-adjustable dock under the player showing several color scopes at
 * once. Refreshes are throttled during playback and immediate after seeks.
 */
export function PreviewScopeDock() {
	const { t } = useTranslation();
	const scopesEnabled = usePreviewViewStore((state) => state.scopesEnabled);
	const visibleScopes = usePreviewViewStore((state) => state.visibleScopes);
	const dockHeight = usePreviewViewStore((state) => state.scopeDockHeight);
	const setScopeDockHeight = usePreviewViewStore(
		(state) => state.setScopeDockHeight
	);
	const visibleModes = SCOPE_DOCK_ORDER.filter((mode) => visibleScopes[mode]);
	const { imageData } = useScopeDockFrame({
		enabled: scopesEnabled && visibleModes.length > 0,
	});

	if (!scopesEnabled || visibleModes.length === 0) return null;

	const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		const startY = event.clientY;
		const startHeight = dockHeight;
		const handleMove = (moveEvent: PointerEvent) => {
			// Dragging up grows the dock (it sits below the handle).
			setScopeDockHeight(startHeight + (startY - moveEvent.clientY));
		};
		const handleUp = () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
		};
		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
	};

	return (
		<div className="shrink-0 border-t" data-testid="preview-scope-dock">
			<div
				role="separator"
				aria-orientation="horizontal"
				aria-label={t("editor.preview.scopes")}
				aria-valuemin={SCOPE_DOCK_MIN_HEIGHT}
				aria-valuemax={SCOPE_DOCK_MAX_HEIGHT}
				aria-valuenow={dockHeight}
				tabIndex={0}
				className="h-1.5 w-full cursor-row-resize bg-border/40 hover:bg-border"
				data-testid="scope-dock-resize-handle"
				onPointerDown={handleResizeStart}
				onKeyDown={(event) => {
					if (event.key === "ArrowUp") {
						event.preventDefault();
						setScopeDockHeight(dockHeight + 16);
					}
					if (event.key === "ArrowDown") {
						event.preventDefault();
						setScopeDockHeight(dockHeight - 16);
					}
				}}
			/>
			<div
				className="flex gap-2 p-2"
				style={{ height: dockHeight }}
				data-testid="scope-dock-tiles"
			>
				{visibleModes.map((mode) => (
					<ScopeTile
						key={mode}
						mode={mode}
						imageData={imageData}
						label={t(SCOPE_LABEL_KEYS[mode])}
					/>
				))}
			</div>
		</div>
	);
}

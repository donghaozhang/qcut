"use client";

import {
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from "react";
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
	const [tileSize, setTileSize] = useState<{
		width: number;
		height: number;
	} | null>(null);

	// Track the rendered tile size so the canvas backing store matches it —
	// a CSS-stretched fixed 360x210 buffer distorts the vectorscope circle.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const observer = new ResizeObserver(() => {
			setTileSize({
				width: canvas.clientWidth,
				height: canvas.clientHeight,
			});
		});
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !imageData) return;
		const ratio = window.devicePixelRatio || 1;
		drawColorScope({
			canvas,
			imageData,
			mode,
			width: Math.max(1, Math.round((tileSize?.width ?? 360) * ratio)),
			height: Math.max(1, Math.round((tileSize?.height ?? 210) * ratio)),
		});
	}, [imageData, mode, tileSize]);

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
	const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
	const visibleModes = SCOPE_DOCK_ORDER.filter((mode) => visibleScopes[mode]);
	const { imageData } = useScopeDockFrame({
		enabled: scopesEnabled && visibleModes.length > 0,
	});

	if (!scopesEnabled || visibleModes.length === 0) return null;

	const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		resizeStartRef.current = { y: event.clientY, height: dockHeight };
	};

	const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const start = resizeStartRef.current;
		if (!start) return;
		// Dragging up grows the dock (it sits below the handle).
		setScopeDockHeight(start.height + (start.y - event.clientY));
	};

	const handleResizeEnd = () => {
		resizeStartRef.current = null;
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
				onPointerMove={handleResizeMove}
				onPointerUp={handleResizeEnd}
				onPointerCancel={handleResizeEnd}
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

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import {
	CursorRenderer,
	type CursorRenderConfig,
} from "@/lib/screen-recording/cursor-renderer";

interface CursorOverlayProps {
	canvasWidth: number;
	canvasHeight: number;
	currentTimeMs: number;
	telemetry: CursorTelemetryData;
	config: CursorRenderConfig;
	visible: boolean;
}

/**
 * PixiJS cursor overlay positioned absolutely over the preview video area.
 * Renders a smooth, animated cursor driven by telemetry data.
 */
export function CursorOverlay({
	canvasWidth,
	canvasHeight,
	currentTimeMs,
	telemetry,
	config,
	visible,
}: CursorOverlayProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const appRef = useRef<PIXI.Application | null>(null);
	const rendererRef = useRef<CursorRenderer | null>(null);

	// Initialize PixiJS application
	// Include `visible` in deps so cleanup runs when toggled off and re-init when toggled on,
	// preventing orphaned canvas after visibility changes.
	useEffect(() => {
		if (
			!visible ||
			!containerRef.current ||
			canvasWidth <= 0 ||
			canvasHeight <= 0
		)
			return;

		const app = new PIXI.Application();
		let mounted = true;

		app
			.init({
				width: canvasWidth,
				height: canvasHeight,
				backgroundAlpha: 0,
				antialias: true,
				resolution: window.devicePixelRatio || 1,
				autoDensity: true,
			})
			.then(() => {
				if (!mounted || !containerRef.current) {
					app.destroy(true);
					return;
				}
				containerRef.current.appendChild(app.canvas as HTMLCanvasElement);
				appRef.current = app;

				const renderer = new CursorRenderer(app.stage, config);
				rendererRef.current = renderer;
			})
			.catch(() => {
				// PixiJS init failed — cursor overlay won't render
			});

		return () => {
			mounted = false;
			rendererRef.current?.destroy();
			rendererRef.current = null;
			if (appRef.current) {
				appRef.current.destroy(true);
				appRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [canvasWidth, canvasHeight, visible, config]);

	// Update cursor position on time change
	useEffect(() => {
		if (!rendererRef.current || !visible) return;
		rendererRef.current.update(
			currentTimeMs,
			telemetry,
			canvasWidth,
			canvasHeight
		);
		appRef.current?.render();
	}, [currentTimeMs, telemetry, canvasWidth, canvasHeight, visible]);

	// Update config when it changes
	useEffect(() => {
		rendererRef.current?.updateConfig(config);
	}, [config]);

	// Resize canvas when dimensions change
	useEffect(() => {
		if (appRef.current && canvasWidth > 0 && canvasHeight > 0) {
			appRef.current.renderer.resize(canvasWidth, canvasHeight);
		}
	}, [canvasWidth, canvasHeight]);

	if (!visible) return null;

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 pointer-events-none"
			style={{ zIndex: 10 }}
		/>
	);
}

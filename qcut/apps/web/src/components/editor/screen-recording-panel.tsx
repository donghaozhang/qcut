import { useCallback, useEffect } from "react";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { analyzeForZoomSuggestions } from "@/lib/screen-recording/auto-zoom-analyzer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./properties-panel/property-item";
import { CursorSettings } from "./screen-recording-panel/cursor-settings";
import { BackgroundSettings } from "./screen-recording-panel/background-settings";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import type { ZoomRegion } from "@/lib/screen-recording/zoom-region-utils";

const DEPTH_OPTIONS = [
	{ value: 1.5, label: "1.5x" },
	{ value: 2, label: "2x" },
	{ value: 3, label: "3x" },
];

function formatTime(ms: number): string {
	const totalSec = Math.max(0, ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = (totalSec % 60).toFixed(1);
	return `${min}:${sec.padStart(4, "0")}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || tag === "select";
}

export function ScreenRecordingPanel() {
	const cursorTelemetry = useScreenRecordingEnhancementStore(
		(s) => s.cursorTelemetry
	);
	const autoZoomConfig = useScreenRecordingEnhancementStore(
		(s) => s.autoZoomConfig
	);
	const zoomRegions = useScreenRecordingEnhancementStore((s) => s.zoomRegions);
	const setZoomRegions = useScreenRecordingEnhancementStore(
		(s) => s.setZoomRegions
	);
	const addZoomRegion = useScreenRecordingEnhancementStore(
		(s) => s.addZoomRegion
	);
	const removeZoomRegion = useScreenRecordingEnhancementStore(
		(s) => s.removeZoomRegion
	);
	const updateZoomRegion = useScreenRecordingEnhancementStore(
		(s) => s.updateZoomRegion
	);
	const setShowCursorOverlay = useScreenRecordingEnhancementStore(
		(s) => s.setShowCursorOverlay
	);
	const showCursorOverlay = useScreenRecordingEnhancementStore(
		(s) => s.showCursorOverlay
	);
	const currentTime = usePlaybackStore((s) => s.currentTime);

	const handleAutoGenerate = useCallback(() => {
		if (!cursorTelemetry) return;
		const suggestions = analyzeForZoomSuggestions(
			cursorTelemetry,
			autoZoomConfig
		);
		setZoomRegions(suggestions);
	}, [cursorTelemetry, autoZoomConfig, setZoomRegions]);

	const handleAddManual = useCallback(() => {
		const startMs = currentTime * 1000;
		const region: ZoomRegion = {
			id: `zoom-manual-${Date.now()}`,
			startMs,
			endMs: startMs + 3000,
			depth: 1.5,
			focus: { cx: 0.5, cy: 0.5 },
			auto: false,
		};
		addZoomRegion(region);
	}, [currentTime, addZoomRegion]);

	const handleClearAll = useCallback(() => {
		setZoomRegions([]);
	}, [setZoomRegions]);

	// Keyboard shortcuts: Ctrl/Cmd+Shift+C = toggle cursor, Ctrl/Cmd+Shift+G = auto-zoom
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const hasModifier = e.ctrlKey || e.metaKey;
			if (!hasModifier || !e.shiftKey || isEditableTarget(e.target)) return;

			const key = e.key.toLowerCase();
			if (key === "c") {
				e.preventDefault();
				setShowCursorOverlay(!showCursorOverlay);
			} else if (key === "g" && cursorTelemetry) {
				e.preventDefault();
				handleAutoGenerate();
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		setShowCursorOverlay,
		showCursorOverlay,
		cursorTelemetry,
		handleAutoGenerate,
	]);

	return (
		<ScrollArea className="h-full">
			<div className="p-4 space-y-4">
				<div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Screen Recording
				</div>

				<CursorSettings />
				<BackgroundSettings />

				{/* Zoom Settings */}
				<PropertyGroup title="Zoom Regions" defaultExpanded={true}>
					<div className="space-y-3">
						{/* Action buttons */}
						<div className="flex gap-2">
							<Button
								size="sm"
								variant="outline"
								className="flex-1 text-xs h-7"
								onClick={handleAutoGenerate}
								disabled={!cursorTelemetry}
								title="Auto-generate zoom regions from cursor activity (Ctrl+Shift+Z)"
							>
								<Sparkles className="size-3 mr-1" />
								Auto-generate
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="text-xs h-7"
								onClick={handleAddManual}
								title="Add zoom region at current time"
							>
								<Plus className="size-3" />
							</Button>
							{zoomRegions.length > 0 && (
								<Button
									size="sm"
									variant="outline"
									className="text-xs h-7 text-destructive hover:text-destructive"
									onClick={handleClearAll}
									title="Clear all zoom regions"
								>
									<Trash2 className="size-3" />
								</Button>
							)}
						</div>

						{/* Zoom regions list */}
						{zoomRegions.length === 0 ? (
							<p className="text-xs text-muted-foreground text-center py-2">
								No zoom regions. Use auto-generate or add manually.
							</p>
						) : (
							<div className="space-y-2 max-h-48 overflow-y-auto">
								{zoomRegions.map((region) => (
									<ZoomRegionItem
										key={region.id}
										region={region}
										onUpdate={(updates) => updateZoomRegion(region.id, updates)}
										onRemove={() => removeZoomRegion(region.id)}
									/>
								))}
							</div>
						)}
					</div>
				</PropertyGroup>
			</div>
		</ScrollArea>
	);
}

function ZoomRegionItem({
	region,
	onUpdate,
	onRemove,
}: {
	region: ZoomRegion;
	onUpdate: (updates: Partial<ZoomRegion>) => void;
	onRemove: () => void;
}) {
	return (
		<div className="bg-muted/50 rounded-md p-2 space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-xs font-mono">
					{formatTime(region.startMs)} – {formatTime(region.endMs)}
				</span>
				<button
					type="button"
					className="text-muted-foreground hover:text-destructive transition-colors"
					onClick={onRemove}
					aria-label="Remove zoom region"
				>
					<X className="size-3" />
				</button>
			</div>

			{/* Depth selector */}
			<PropertyItem>
				<PropertyItemLabel>Zoom</PropertyItemLabel>
				<PropertyItemValue>
					<div className="flex gap-1">
						{DEPTH_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								className={`flex-1 text-xs py-0.5 rounded border transition-colors ${
									region.depth === opt.value
										? "bg-primary text-primary-foreground border-primary"
										: "border-border hover:border-primary/50"
								}`}
								onClick={() => onUpdate({ depth: opt.value })}
							>
								{opt.label}
							</button>
						))}
					</div>
				</PropertyItemValue>
			</PropertyItem>

			{/* Time range slider (start) */}
			<PropertyItem>
				<PropertyItemLabel>Start</PropertyItemLabel>
				<PropertyItemValue>
					<Slider
						min={0}
						max={Math.max(region.endMs - 500, region.startMs)}
						step={100}
						value={[region.startMs]}
						onValueChange={([v]) => onUpdate({ startMs: v })}
					/>
				</PropertyItemValue>
			</PropertyItem>

			{/* Time range slider (end) */}
			<PropertyItem>
				<PropertyItemLabel>End</PropertyItemLabel>
				<PropertyItemValue>
					<Slider
						min={region.startMs + 500}
						max={region.endMs + 30000}
						step={100}
						value={[region.endMs]}
						onValueChange={([v]) => onUpdate({ endMs: v })}
					/>
				</PropertyItemValue>
			</PropertyItem>
		</div>
	);
}

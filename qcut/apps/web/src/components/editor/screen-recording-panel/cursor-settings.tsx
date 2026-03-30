import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "../properties-panel/property-item";
import type { CursorRenderConfig } from "@/lib/screen-recording/cursor-renderer";

const CURSOR_STYLES: {
	value: CursorRenderConfig["cursorStyle"];
	label: string;
}[] = [
	{ value: "dot", label: "Dot" },
	{ value: "macos-arrow", label: "Arrow" },
	{ value: "macos-pointer", label: "Pointer" },
	{ value: "hidden", label: "Hidden" },
];

const SMOOTHING_LABELS = ["Instant", "Natural", "Smooth"];

function smoothingLabel(value: number): string {
	if (value <= 0.06) return SMOOTHING_LABELS[0];
	if (value >= 1.5) return SMOOTHING_LABELS[2];
	return SMOOTHING_LABELS[1];
}

/** Convert 0xRRGGBB number to #rrggbb hex string */
function colorToHex(n: number): string {
	return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}

/** Convert #rrggbb hex string to 0xRRGGBB number */
function hexToColor(hex: string): number {
	return parseInt(hex.replace("#", ""), 16);
}

export function CursorSettings() {
	const cursorConfig = useScreenRecordingEnhancementStore(
		(s) => s.cursorConfig
	);
	const setCursorConfig = useScreenRecordingEnhancementStore(
		(s) => s.setCursorConfig
	);
	const showCursorOverlay = useScreenRecordingEnhancementStore(
		(s) => s.showCursorOverlay
	);
	const setShowCursorOverlay = useScreenRecordingEnhancementStore(
		(s) => s.setShowCursorOverlay
	);
	const cursorLoopMode = useScreenRecordingEnhancementStore(
		(s) => s.cursorLoopMode
	);
	const setCursorLoopMode = useScreenRecordingEnhancementStore(
		(s) => s.setCursorLoopMode
	);

	return (
		<PropertyGroup title="Cursor" defaultExpanded={true}>
			<div className="space-y-3">
				{/* Visibility toggle */}
				<PropertyItem>
					<PropertyItemLabel>Visible</PropertyItemLabel>
					<Switch
						checked={showCursorOverlay}
						onCheckedChange={setShowCursorOverlay}
						aria-label="Toggle cursor overlay"
					/>
				</PropertyItem>

				{/* Cursor style */}
				<PropertyItem direction="column">
					<PropertyItemLabel>Style</PropertyItemLabel>
					<ToggleGroup
						type="single"
						value={cursorConfig.cursorStyle}
						onValueChange={(v) => {
							if (v)
								setCursorConfig({
									cursorStyle: v as CursorRenderConfig["cursorStyle"],
								});
						}}
						size="sm"
						className="w-full"
					>
						{CURSOR_STYLES.map((s) => (
							<ToggleGroupItem
								key={s.value}
								value={s.value}
								className="flex-1 text-xs px-1"
								aria-label={s.label}
							>
								{s.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</PropertyItem>

				{/* Size */}
				<PropertyItem>
					<PropertyItemLabel>Size</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								min={12}
								max={60}
								step={1}
								value={[cursorConfig.dotRadius]}
								onValueChange={([v]) => setCursorConfig({ dotRadius: v })}
								className="flex-1"
							/>
							<span className="text-xs text-muted-foreground w-8 text-right">
								{cursorConfig.dotRadius}px
							</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Color */}
				<PropertyItem>
					<PropertyItemLabel>Color</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<input
								type="color"
								value={colorToHex(cursorConfig.dotColor)}
								onChange={(e) =>
									setCursorConfig({ dotColor: hexToColor(e.target.value) })
								}
								className="w-7 h-7 cursor-pointer rounded border p-0"
								aria-label="Cursor color"
							/>
							<span className="text-xs text-muted-foreground font-mono">
								{colorToHex(cursorConfig.dotColor)}
							</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Opacity */}
				<PropertyItem>
					<PropertyItemLabel>Opacity</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={1}
								step={0.05}
								value={[cursorConfig.dotAlpha]}
								onValueChange={([v]) => setCursorConfig({ dotAlpha: v })}
								className="flex-1"
							/>
							<span className="text-xs text-muted-foreground w-8 text-right">
								{Math.round(cursorConfig.dotAlpha * 100)}%
							</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Smoothing */}
				<PropertyItem>
					<PropertyItemLabel>Smoothing</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={2}
								step={0.01}
								value={[cursorConfig.smoothingFactor]}
								onValueChange={([v]) => setCursorConfig({ smoothingFactor: v })}
								className="flex-1"
							/>
							<span className="text-xs text-muted-foreground w-14 text-right">
								{smoothingLabel(cursorConfig.smoothingFactor)}
							</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Click bounce */}
				<PropertyItem>
					<PropertyItemLabel>Click bounce</PropertyItemLabel>
					<Switch
						checked={cursorConfig.clickBounce > 0}
						onCheckedChange={(on) =>
							setCursorConfig({ clickBounce: on ? 1 : 0 })
						}
						aria-label="Toggle click animation"
					/>
				</PropertyItem>

				{cursorConfig.clickBounce > 0 && (
					<PropertyItem>
						<PropertyItemLabel>Bounce strength</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex items-center gap-2">
								<Slider
									min={0.5}
									max={3}
									step={0.1}
									value={[cursorConfig.clickBounce]}
									onValueChange={([v]) => setCursorConfig({ clickBounce: v })}
									className="flex-1"
								/>
								<span className="text-xs text-muted-foreground w-8 text-right">
									{cursorConfig.clickBounce.toFixed(1)}x
								</span>
							</div>
						</PropertyItemValue>
					</PropertyItem>
				)}

				{/* Sway — natural wobble during movement */}
				<PropertyItem>
					<PropertyItemLabel>Sway</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={100}
								step={1}
								value={[Math.round(cursorConfig.sway * 50)]}
								onValueChange={([v]) =>
									setCursorConfig({ sway: v / 50 })
								}
								className="flex-1"
							/>
							<span className="text-xs text-muted-foreground w-8 text-right">
								{Math.round(cursorConfig.sway * 50)}%
							</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Motion blur — ghost trail on fast movement */}
				<PropertyItem>
					<PropertyItemLabel>Motion blur</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={100}
								step={1}
								value={[Math.round(cursorConfig.motionBlur * 100)]}
								onValueChange={([v]) =>
									setCursorConfig({ motionBlur: v / 100 })
								}
								className="flex-1"
							/>
							<span className="text-xs text-muted-foreground w-8 text-right">
								{Math.round(cursorConfig.motionBlur * 100)}%
							</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Loop cursor — smooth return for seamless loops */}
				<PropertyItem>
					<PropertyItemLabel>Loop cursor</PropertyItemLabel>
					<Switch
						checked={cursorLoopMode}
						onCheckedChange={setCursorLoopMode}
						aria-label="Toggle cursor loop mode"
					/>
				</PropertyItem>
			</div>
		</PropertyGroup>
	);
}

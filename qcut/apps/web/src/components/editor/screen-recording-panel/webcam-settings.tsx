import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "../properties-panel/property-item";
import {
	useWebcamOverlayStore,
	type WebcamPresetPosition,
} from "@/stores/webcam-overlay-store";
import { getVideoDevices } from "@/lib/screen-recording/webcam-capture";

const POSITION_PRESETS: WebcamPresetPosition[] = [
	"top-left",
	"top-center",
	"top-right",
	"center-left",
	"center",
	"center-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
];

const POSITION_LABELS: Record<WebcamPresetPosition, string> = {
	"top-left": "TL",
	"top-center": "TC",
	"top-right": "TR",
	"center-left": "CL",
	center: "C",
	"center-right": "CR",
	"bottom-left": "BL",
	"bottom-center": "BC",
	"bottom-right": "BR",
};

export function WebcamSettings() {
	const config = useWebcamOverlayStore((s) => s.config);
	const setConfig = useWebcamOverlayStore((s) => s.setConfig);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

	useEffect(() => {
		if (config.enabled) {
			getVideoDevices()
				.then(setDevices)
				.catch(() => setDevices([]));
		}
	}, [config.enabled]);

	const currentPosition =
		typeof config.position === "string" ? config.position : null;

	return (
		<PropertyGroup title="Webcam" defaultExpanded={false}>
			<div className="space-y-3">
				{/* Enable toggle */}
				<PropertyItem>
					<PropertyItemLabel>Enabled</PropertyItemLabel>
					<Switch
						checked={config.enabled}
						onCheckedChange={(enabled) => setConfig({ enabled })}
						aria-label="Toggle webcam overlay"
					/>
				</PropertyItem>

				{config.enabled && (
					<>
						{/* Device selector */}
						{devices.length > 0 && (
							<PropertyItem direction="column">
								<PropertyItemLabel>Camera</PropertyItemLabel>
								<select
									value={config.deviceId ?? ""}
									onChange={(e) =>
										setConfig({
											deviceId: e.target.value || null,
										})
									}
									className="w-full text-xs bg-secondary/50 rounded px-2 py-1 border border-border"
									aria-label="Select camera"
								>
									<option value="">Default</option>
									{devices.map((d) => (
										<option key={d.deviceId} value={d.deviceId}>
											{d.label || `Camera ${d.deviceId.slice(0, 8)}`}
										</option>
									))}
								</select>
							</PropertyItem>
						)}

						{/* Position grid 3×3 */}
						<PropertyItem direction="column">
							<PropertyItemLabel>Position</PropertyItemLabel>
							<div className="grid grid-cols-3 gap-1">
								{POSITION_PRESETS.map((pos) => (
									<button
										key={pos}
										type="button"
										className={`h-7 text-[10px] rounded border transition-colors cursor-pointer ${
											currentPosition === pos
												? "border-primary bg-primary/10 font-medium"
												: "border-border/50 hover:bg-muted/40"
										}`}
										onClick={() => setConfig({ position: pos })}
										aria-label={pos}
									>
										{POSITION_LABELS[pos]}
									</button>
								))}
							</div>
						</PropertyItem>

						{/* Size */}
						<PropertyItem>
							<PropertyItemLabel>Size</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										min={10}
										max={100}
										step={1}
										value={[config.size]}
										onValueChange={([v]) => setConfig({ size: v })}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{config.size}%
									</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						{/* Roundness */}
						<PropertyItem>
							<PropertyItemLabel>Roundness</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										min={0}
										max={160}
										step={1}
										value={[config.roundness]}
										onValueChange={([v]) => setConfig({ roundness: v })}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{config.roundness}px
									</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						{/* Shadow */}
						<PropertyItem>
							<PropertyItemLabel>Shadow</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										min={0}
										max={100}
										step={1}
										value={[config.shadow]}
										onValueChange={([v]) => setConfig({ shadow: v })}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{config.shadow}%
									</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						{/* Mirror */}
						<PropertyItem>
							<PropertyItemLabel>Mirror</PropertyItemLabel>
							<Switch
								checked={config.mirror}
								onCheckedChange={(mirror) => setConfig({ mirror })}
								aria-label="Toggle mirror"
							/>
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
										value={[config.opacity]}
										onValueChange={([v]) => setConfig({ opacity: v })}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{Math.round(config.opacity * 100)}%
									</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>
					</>
				)}
			</div>
		</PropertyGroup>
	);
}

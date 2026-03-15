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
import {
	GRADIENT_PRESETS,
	type BackgroundConfig,
} from "@/lib/screen-recording/wallpapers";

const BG_TYPES: { value: BackgroundConfig["type"]; label: string }[] = [
	{ value: "none", label: "None" },
	{ value: "gradient", label: "Gradient" },
	{ value: "solid", label: "Solid" },
];

export function BackgroundSettings() {
	const background = useScreenRecordingEnhancementStore((s) => s.background);
	const setBackground = useScreenRecordingEnhancementStore(
		(s) => s.setBackground
	);

	return (
		<PropertyGroup title="Background" defaultExpanded={true}>
			<div className="space-y-3">
				{/* Background type */}
				<PropertyItem direction="column">
					<PropertyItemLabel>Type</PropertyItemLabel>
					<ToggleGroup
						type="single"
						value={background.type}
						onValueChange={(v) => {
							if (v) setBackground({ type: v as BackgroundConfig["type"] });
						}}
						size="sm"
						className="w-full"
					>
						{BG_TYPES.map((t) => (
							<ToggleGroupItem
								key={t.value}
								value={t.value}
								className="flex-1 text-xs px-1"
								aria-label={t.label}
							>
								{t.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</PropertyItem>

				{/* Gradient presets */}
				{background.type === "gradient" && (
					<PropertyItem direction="column">
						<PropertyItemLabel>Preset</PropertyItemLabel>
						<div className="grid grid-cols-6 gap-1">
							{GRADIENT_PRESETS.map((g) => (
								<button
									key={g.id}
									type="button"
									className={`h-6 w-full rounded border-2 cursor-pointer transition-transform hover:scale-105 ${
										background.gradientId === g.id
											? "border-primary ring-1 ring-primary"
											: "border-transparent"
									}`}
									style={{
										background: `linear-gradient(135deg, ${g.colors[0]}, ${g.colors[1]})`,
									}}
									onClick={() =>
										setBackground({
											gradientId: g.id,
											gradientColors: g.colors,
										})
									}
									aria-label={g.label}
									title={g.label}
								/>
							))}
						</div>
					</PropertyItem>
				)}

				{/* Gradient custom colors */}
				{background.type === "gradient" && (
					<PropertyItem>
						<PropertyItemLabel>Colors</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex items-center gap-2">
								<input
									type="color"
									value={background.gradientColors?.[0] ?? "#ff6b6b"}
									onChange={(e) =>
										setBackground({
											gradientColors: [
												e.target.value,
												background.gradientColors?.[1] ?? "#ffa726",
											],
											gradientId: undefined,
										})
									}
									className="w-7 h-7 cursor-pointer rounded border p-0"
									aria-label="Gradient start color"
								/>
								<input
									type="color"
									value={background.gradientColors?.[1] ?? "#ffa726"}
									onChange={(e) =>
										setBackground({
											gradientColors: [
												background.gradientColors?.[0] ?? "#ff6b6b",
												e.target.value,
											],
											gradientId: undefined,
										})
									}
									className="w-7 h-7 cursor-pointer rounded border p-0"
									aria-label="Gradient end color"
								/>
							</div>
						</PropertyItemValue>
					</PropertyItem>
				)}

				{/* Gradient angle */}
				{background.type === "gradient" && (
					<PropertyItem>
						<PropertyItemLabel>Angle</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex items-center gap-2">
								<Slider
									min={0}
									max={360}
									step={1}
									value={[background.gradientAngle ?? 135]}
									onValueChange={([v]) => setBackground({ gradientAngle: v })}
									className="flex-1"
								/>
								<span className="text-xs text-muted-foreground w-8 text-right">
									{background.gradientAngle ?? 135}&deg;
								</span>
							</div>
						</PropertyItemValue>
					</PropertyItem>
				)}

				{/* Solid color */}
				{background.type === "solid" && (
					<PropertyItem>
						<PropertyItemLabel>Color</PropertyItemLabel>
						<PropertyItemValue>
							<div className="flex items-center gap-2">
								<input
									type="color"
									value={background.solidColor ?? "#1a1a2e"}
									onChange={(e) =>
										setBackground({ solidColor: e.target.value })
									}
									className="w-7 h-7 cursor-pointer rounded border p-0"
									aria-label="Solid background color"
								/>
								<span className="text-xs text-muted-foreground font-mono">
									{background.solidColor ?? "#1a1a2e"}
								</span>
							</div>
						</PropertyItemValue>
					</PropertyItem>
				)}

				{/* Padding */}
				{background.type !== "none" && (
					<>
						<PropertyItem>
							<PropertyItemLabel>Padding</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										min={0}
										max={100}
										step={1}
										value={[background.padding]}
										onValueChange={([v]) => setBackground({ padding: v })}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{background.padding}px
									</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						{/* Corner radius */}
						<PropertyItem>
							<PropertyItemLabel>Radius</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										min={0}
										max={32}
										step={1}
										value={[background.borderRadius]}
										onValueChange={([v]) => setBackground({ borderRadius: v })}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{background.borderRadius}px
									</span>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						{/* Shadow */}
						<PropertyItem>
							<PropertyItemLabel>Shadow</PropertyItemLabel>
							<Switch
								checked={background.shadow}
								onCheckedChange={(v) => setBackground({ shadow: v })}
								aria-label="Toggle shadow"
							/>
						</PropertyItem>
					</>
				)}
			</div>
		</PropertyGroup>
	);
}

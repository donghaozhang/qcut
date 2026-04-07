import { useState, useEffect, useCallback } from "react";
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
import type { WallpaperEntry } from "@/types/electron/api-wallpapers";

const BG_TYPES: { value: BackgroundConfig["type"]; label: string }[] = [
	{ value: "none", label: "None" },
	{ value: "gradient", label: "Gradient" },
	{ value: "solid", label: "Solid" },
	{ value: "wallpaper", label: "Image" },
];

/** Screen recording background type and color picker controls. */
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

				{/* Wallpaper picker */}
				{background.type === "wallpaper" && (
					<WallpaperPicker
						selectedPath={background.wallpaperPath}
						onSelect={(path) => setBackground({ wallpaperPath: path })}
					/>
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

						{/* Background blur */}
						<PropertyItem>
							<PropertyItemLabel>Blur</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										min={0}
										max={20}
										step={1}
										value={[background.backgroundBlur ?? 0]}
										onValueChange={([v]) =>
											setBackground({ backgroundBlur: v })
										}
										className="flex-1"
									/>
									<span className="text-xs text-muted-foreground w-8 text-right">
										{background.backgroundBlur ?? 0}px
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

/** Wallpaper picker with thumbnail grid, upload, and path fallback. */
function WallpaperPicker({
	selectedPath,
	onSelect,
}: {
	selectedPath?: string;
	onSelect: (path: string) => void;
}) {
	const [entries, setEntries] = useState<WallpaperEntry[]>([]);
	const hasElectron =
		typeof window !== "undefined" && !!window.electronAPI?.wallpapers;

	const refresh = useCallback(async () => {
		if (!hasElectron) return;
		const list = await window.electronAPI!.wallpapers.list();
		setEntries(list);
	}, [hasElectron]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const handleUpload = async () => {
		if (!hasElectron) return;
		const filePath = await window.electronAPI!.wallpapers.pick();
		if (!filePath) return;
		const entry = await window.electronAPI!.wallpapers.upload(filePath);
		if (entry) {
			onSelect(entry.path);
			refresh();
		}
	};

	const handleDelete = async (id: string) => {
		if (!hasElectron) return;
		const deleted = entries.find((e) => e.id === id);
		await window.electronAPI!.wallpapers.delete(id);
		if (deleted && selectedPath === deleted.path) {
			onSelect("");
		}
		refresh();
	};

	// Fallback: plain text input for non-Electron environments
	if (!hasElectron) {
		return (
			<PropertyItem direction="column">
				<PropertyItemLabel>Image path</PropertyItemLabel>
				<PropertyItemValue>
					<input
						type="text"
						value={selectedPath ?? ""}
						onChange={(e) => onSelect(e.target.value)}
						placeholder="Enter image path or URL"
						className="w-full text-xs bg-secondary/50 rounded px-2 py-1 border border-border"
						aria-label="Wallpaper image path"
					/>
				</PropertyItemValue>
			</PropertyItem>
		);
	}

	return (
		<PropertyItem direction="column">
			<PropertyItemLabel>Wallpaper</PropertyItemLabel>
			<div className="space-y-2">
				{entries.length > 0 && (
					<div className="grid grid-cols-4 gap-1">
						{entries.map((entry) => (
							<div
								key={entry.id}
								role="button"
								tabIndex={0}
								className={`relative h-10 rounded border-2 cursor-pointer overflow-hidden transition-transform hover:scale-105 ${
									selectedPath === entry.path
										? "border-primary ring-1 ring-primary"
										: "border-transparent"
								}`}
								onClick={() => onSelect(entry.path)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onSelect(entry.path);
									}
								}}
								title={entry.name}
								aria-label={`Select wallpaper ${entry.name}`}
							>
								<img
									src={`file://${entry.path}`}
									alt={entry.name}
									className="w-full h-full object-cover"
								/>
								<button
									type="button"
									className="absolute top-0 right-0 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] rounded-bl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
									onClick={(e) => {
										e.stopPropagation();
										handleDelete(entry.id);
									}}
									aria-label={`Delete wallpaper ${entry.name}`}
								>
									x
								</button>
							</div>
						))}
					</div>
				)}
				<button
					type="button"
					className="w-full text-xs py-1 px-2 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
					onClick={handleUpload}
				>
					+ Upload wallpaper
				</button>
			</div>
		</PropertyItem>
	);
}

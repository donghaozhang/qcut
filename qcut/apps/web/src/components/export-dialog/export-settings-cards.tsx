import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PlatformIcon } from "@/components/export-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
	ExportQuality,
	ExportFormat,
	QUALITY_RESOLUTIONS,
	FORMAT_INFO,
	EXPORT_PRESETS,
	type ExportPreset,
} from "@/types/export";

// ---------------------------------------------------------------------------
// Shared collapsible row wrapper
// ---------------------------------------------------------------------------

function SettingRow({
	label,
	value,
	open,
	onToggle,
	disabled,
	children,
	testId,
}: {
	label: string;
	value: string;
	open: boolean;
	onToggle: () => void;
	disabled?: boolean;
	children: React.ReactNode;
	testId?: string;
}) {
	return (
		<div
			className="rounded-lg border border-border/50 bg-card overflow-hidden"
			data-testid={testId}
		>
			<button
				type="button"
				onClick={onToggle}
				disabled={disabled}
				className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors disabled:opacity-50 text-left"
			>
				<span className="text-xs font-medium text-muted-foreground">
					{label}
				</span>
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium truncate max-w-[160px]">
						{value}
					</span>
					<ChevronDown
						className={cn(
							"size-3.5 text-muted-foreground transition-transform duration-200",
							open && "rotate-180"
						)}
					/>
				</div>
			</button>
			{open && (
				<div className="px-3 pb-3 pt-1 border-t border-border/30">
					{children}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Prop interfaces
// ---------------------------------------------------------------------------

export interface PresetGridProps {
	selectedPreset: ExportPreset | null;
	onPresetSelect: (preset: ExportPreset) => void;
	onClearPreset: () => void;
	isExporting: boolean;
}

export interface FilenameCardProps {
	filename: string;
	onFilenameChange: (value: string) => void;
	hasValidFilename: boolean;
	isExporting: boolean;
}

export interface QualityCardProps {
	quality: ExportQuality;
	estimatedSize: string;
	onQualityChange: (quality: ExportQuality) => void;
	isExporting: boolean;
}

export interface EngineCardProps {
	engineType: "standard" | "ffmpeg" | "cli";
	ffmpegAvailable: boolean;
	isElectron: boolean;
	onEngineTypeChange: (type: "standard" | "ffmpeg" | "cli") => void;
	isExporting: boolean;
}

export interface FormatCardProps {
	format: ExportFormat;
	supportedFormats: ExportFormat[];
	onFormatChange: (format: ExportFormat) => void;
	isExporting: boolean;
}

export interface DetailsCardProps {
	resolution: { label: string } | undefined;
	estimatedSize: string;
	timelineDuration: number;
	format: ExportFormat;
	engineRecommendation: string | null;
}

// ---------------------------------------------------------------------------
// PresetGrid (collapsible, at bottom)
// ---------------------------------------------------------------------------

export function PresetGrid({
	selectedPreset,
	onPresetSelect,
	onClearPreset,
	isExporting,
}: PresetGridProps) {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded-lg border border-border/50 bg-card overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				disabled={isExporting}
				className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors disabled:opacity-50 text-left"
			>
				<span className="text-xs font-medium text-muted-foreground">
					Templates
				</span>
				<div className="flex items-center gap-2">
					{selectedPreset ? (
						<span className="text-sm font-medium">{selectedPreset.name}</span>
					) : (
						<span className="text-sm text-muted-foreground">None</span>
					)}
					<ChevronDown
						className={cn(
							"size-3.5 text-muted-foreground transition-transform duration-200",
							open && "rotate-180"
						)}
					/>
				</div>
			</button>
			{open && (
				<div className="px-3 pb-3 pt-1 border-t border-border/30">
					<div className="grid grid-cols-2 gap-2">
						{EXPORT_PRESETS.map((preset) => (
							<Button
								key={preset.name}
								variant={
									selectedPreset?.name === preset.name ? "default" : "outline"
								}
								size="sm"
								onClick={() => onPresetSelect(preset)}
								className="text-xs p-2.5 h-auto overflow-hidden"
								disabled={isExporting}
							>
								<div className="flex flex-col items-center gap-1 w-full">
									<PlatformIcon
										presetId={preset.id}
										className="size-4 shrink-0"
									/>
									<span className="font-medium text-xs">{preset.name}</span>
								</div>
							</Button>
						))}
					</div>
					{selectedPreset && (
						<div className="flex items-center justify-between mt-2 p-2 bg-muted/50 rounded-md">
							<span className="text-xs">
								Using <span className="font-medium">{selectedPreset.name}</span>
							</span>
							<Button
								variant="text"
								size="sm"
								onClick={onClearPreset}
								className="h-5 px-2 text-xs"
							>
								Clear
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// FilenameCard
// ---------------------------------------------------------------------------

export function FilenameCard({
	filename,
	onFilenameChange,
	hasValidFilename,
	isExporting,
}: FilenameCardProps) {
	const [open, setOpen] = useState(false);

	return (
		<SettingRow
			label="File Name"
			value={filename || "Untitled"}
			open={open}
			onToggle={() => setOpen(!open)}
			disabled={isExporting}
		>
			<Input
				type="text"
				value={filename}
				onChange={(e) => onFilenameChange(e.target.value)}
				placeholder="Enter filename"
				disabled={isExporting}
				className="text-sm"
				data-testid="export-filename-input"
			/>
			{!hasValidFilename && filename && (
				<p className="text-xs text-red-500 mt-1">
					Invalid filename. Use only letters, numbers, hyphens, and underscores.
				</p>
			)}
		</SettingRow>
	);
}

// ---------------------------------------------------------------------------
// QualityCard
// ---------------------------------------------------------------------------

export function QualityCard({
	quality,
	estimatedSize,
	onQualityChange,
	isExporting,
}: QualityCardProps) {
	const [open, setOpen] = useState(false);
	const currentResolution = QUALITY_RESOLUTIONS[quality];

	return (
		<SettingRow
			label="Quality"
			value={currentResolution?.label || quality}
			open={open}
			onToggle={() => setOpen(!open)}
			disabled={isExporting}
			testId="export-quality-select"
		>
			<RadioGroup
				value={quality}
				onValueChange={(value) => {
					onQualityChange(value as ExportQuality);
					setOpen(false);
				}}
				disabled={isExporting}
			>
				{Object.values(ExportQuality).map((q) => {
					const resolution = QUALITY_RESOLUTIONS[q];
					if (!resolution) return null;
					return (
						<div key={q} className="flex items-center space-x-2 py-1">
							<RadioGroupItem value={q} id={q} />
							<Label htmlFor={q} className="text-sm cursor-pointer">
								<div>
									<div className="font-medium">{resolution.label}</div>
									<div className="text-xs text-muted-foreground">
										~{estimatedSize}
									</div>
								</div>
							</Label>
						</div>
					);
				})}
			</RadioGroup>
		</SettingRow>
	);
}

// ---------------------------------------------------------------------------
// EngineCard
// ---------------------------------------------------------------------------

const ENGINE_LABELS: Record<string, string> = {
	standard: "Standard",
	ffmpeg: "FFmpeg WASM",
	cli: "Native CLI",
	muxer: "WebCodecs (H.264)",
};

export function EngineCard({
	engineType,
	ffmpegAvailable,
	isElectron,
	onEngineTypeChange,
	isExporting,
}: EngineCardProps) {
	const [open, setOpen] = useState(false);

	return (
		<SettingRow
			label="Export Engine"
			value={ENGINE_LABELS[engineType] || engineType}
			open={open}
			onToggle={() => setOpen(!open)}
			disabled={isExporting}
		>
			<RadioGroup
				value={engineType}
				onValueChange={(value) => {
					onEngineTypeChange(value as "standard" | "ffmpeg" | "cli");
					setOpen(false);
				}}
				disabled={isExporting}
			>
				<div className="flex items-start space-x-2 py-1">
					<RadioGroupItem value="standard" id="standard" className="mt-0.5" />
					<Label
						htmlFor="standard"
						className="text-sm cursor-pointer flex-1 min-w-0"
					>
						<span>Standard</span>
					</Label>
				</div>
				{ffmpegAvailable && (
					<div className="flex items-start space-x-2 py-1">
						<RadioGroupItem value="ffmpeg" id="ffmpeg" className="mt-0.5" />
						<Label
							htmlFor="ffmpeg"
							className="text-sm cursor-pointer flex-1 min-w-0"
						>
							<div className="flex items-center gap-1">
								<span>FFmpeg WASM</span>
								<span className="text-xs text-muted-foreground">(5x)</span>
							</div>
						</Label>
					</div>
				)}
				{isElectron && (
					<div className="flex items-start space-x-2 py-1">
						<RadioGroupItem value="cli" id="cli" className="mt-0.5" />
						<Label
							htmlFor="cli"
							className="text-sm cursor-pointer flex-1 min-w-0"
						>
							<div className="flex items-center gap-1">
								<span>Native CLI</span>
								<span className="text-xs text-muted-foreground">(10x)</span>
							</div>
						</Label>
					</div>
				)}
			</RadioGroup>
		</SettingRow>
	);
}

// ---------------------------------------------------------------------------
// FormatCard
// ---------------------------------------------------------------------------

export function FormatCard({
	format,
	supportedFormats,
	onFormatChange,
	isExporting,
}: FormatCardProps) {
	const [open, setOpen] = useState(false);

	return (
		<SettingRow
			label="Format"
			value={FORMAT_INFO[format]?.label || format}
			open={open}
			onToggle={() => setOpen(!open)}
			disabled={isExporting}
			testId="export-format-select"
		>
			<RadioGroup
				value={format}
				onValueChange={(value) => {
					onFormatChange(value as ExportFormat);
					setOpen(false);
				}}
				disabled={isExporting}
			>
				{supportedFormats.map((fmt) => (
					<div key={fmt} className="flex items-center space-x-2 py-1">
						<RadioGroupItem value={fmt} id={fmt} />
						<Label htmlFor={fmt} className="text-sm cursor-pointer">
							<div>
								<div className="font-medium">{FORMAT_INFO[fmt].label}</div>
								<div className="text-xs text-muted-foreground">
									{FORMAT_INFO[fmt].description}
								</div>
							</div>
						</Label>
					</div>
				))}
			</RadioGroup>
		</SettingRow>
	);
}

// ---------------------------------------------------------------------------
// DetailsCard
// ---------------------------------------------------------------------------

export function DetailsCard({
	resolution,
	estimatedSize,
	timelineDuration,
	format,
	engineRecommendation,
}: DetailsCardProps) {
	return (
		<div className="rounded-lg border border-border/50 bg-card px-3 py-2.5">
			<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Resolution</span>
					<span className="font-medium">{resolution?.label || "N/A"}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Est. size</span>
					<span className="font-medium">{estimatedSize}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Duration</span>
					<span
						className={cn(
							"font-medium",
							timelineDuration === 0 && "text-red-500"
						)}
					>
						{timelineDuration === 0
							? "No content"
							: `${timelineDuration.toFixed(2)}s`}
					</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Format</span>
					<span className="font-medium">{FORMAT_INFO[format].label}</span>
				</div>
				{engineRecommendation && (
					<div className="col-span-2 text-blue-600 dark:text-blue-400">
						Engine: {engineRecommendation}
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * LTX Video 2.3 Settings Component
 *
 * Shared settings for LTX 2.3 Pro T2V, Fast T2V, and Fast I2V.
 * Adapts UI based on model variant (Pro vs Fast durations, aspect ratio options).
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { LTX23_CONFIG } from "../constants/ai-constants";
import { calculateLTX23Cost } from "../utils/ai-cost-calculators";

// ============================================
// Types
// ============================================

export type LTX23Duration =
	| (typeof LTX23_CONFIG.PRO_DURATIONS)[number]
	| (typeof LTX23_CONFIG.FAST_DURATIONS)[number];
export type LTX23Resolution =
	(typeof LTX23_CONFIG.RESOLUTIONS.STANDARD)[number];
export type LTX23FPS = (typeof LTX23_CONFIG.FPS_OPTIONS.STANDARD)[number];
export type LTX23AspectRatio = (typeof LTX23_CONFIG.ASPECT_RATIOS)[number];

export interface AiLtx23SettingsProps {
	variant: "pro" | "fast";
	mode: "t2v" | "i2v";
	duration: LTX23Duration;
	onDurationChange: (value: LTX23Duration) => void;
	resolution: LTX23Resolution;
	onResolutionChange: (value: LTX23Resolution) => void;
	fps: LTX23FPS;
	onFpsChange: (value: LTX23FPS) => void;
	generateAudio: boolean;
	onGenerateAudioChange: (value: boolean) => void;
	aspectRatio: string;
	onAspectRatioChange: (value: string) => void;
}

// ============================================
// Component
// ============================================

export function AiLtx23Settings({
	variant,
	mode,
	duration,
	onDurationChange,
	resolution,
	onResolutionChange,
	fps,
	onFpsChange,
	generateAudio,
	onGenerateAudioChange,
	aspectRatio,
	onAspectRatioChange,
}: AiLtx23SettingsProps) {
	const isPro = variant === "pro";
	const durations = isPro
		? LTX23_CONFIG.PRO_DURATIONS
		: LTX23_CONFIG.FAST_DURATIONS;
	const isExtendedDuration =
		!isPro && duration > LTX23_CONFIG.EXTENDED_DURATION_THRESHOLD;
	const extendedResolutions = LTX23_CONFIG.RESOLUTIONS.EXTENDED;
	const extendedFps = LTX23_CONFIG.FPS_OPTIONS.EXTENDED;

	const aspectOptions =
		mode === "i2v"
			? [...LTX23_CONFIG.ASPECT_RATIOS, "auto" as const]
			: [...LTX23_CONFIG.ASPECT_RATIOS];

	const idPrefix = `ltx23-${variant}-${mode}`;
	const title = `LTX Video 2.3 ${isPro ? "Pro" : "Fast"} Settings`;

	return (
		<div className="space-y-3 text-left border-t pt-3">
			<Label className="text-sm font-semibold">{title}</Label>

			{/* Duration */}
			<div className="space-y-1">
				<Label htmlFor={`${idPrefix}-duration`} className="text-xs font-medium">
					Duration
				</Label>
				<Select
					value={duration.toString()}
					onValueChange={(v) => onDurationChange(Number(v) as LTX23Duration)}
				>
					<SelectTrigger id={`${idPrefix}-duration`} className="h-8 text-xs">
						<SelectValue placeholder="Select duration" />
					</SelectTrigger>
					<SelectContent>
						{durations.map((d) => (
							<SelectItem key={d} value={d.toString()}>
								{d} seconds
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Resolution */}
			<div className="space-y-1">
				<Label
					htmlFor={`${idPrefix}-resolution`}
					className="text-xs font-medium"
				>
					Resolution
				</Label>
				<Select
					value={resolution}
					onValueChange={(v) => onResolutionChange(v as LTX23Resolution)}
				>
					<SelectTrigger id={`${idPrefix}-resolution`} className="h-8 text-xs">
						<SelectValue placeholder="Select resolution" />
					</SelectTrigger>
					<SelectContent>
						{LTX23_CONFIG.RESOLUTIONS.STANDARD.map((r) => {
							const disabled =
								isExtendedDuration &&
								!extendedResolutions.includes(
									r as (typeof extendedResolutions)[number]
								);
							return (
								<SelectItem key={r} value={r} disabled={disabled}>
									{r === "2160p" ? "2160p (4K)" : r}
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
				<div className="text-xs text-muted-foreground">
					Estimated cost: $
					{calculateLTX23Cost(resolution, duration, variant).toFixed(2)}
				</div>
			</div>

			{/* FPS */}
			<div className="space-y-1">
				<Label htmlFor={`${idPrefix}-fps`} className="text-xs font-medium">
					Frame Rate
				</Label>
				<Select
					value={fps.toString()}
					onValueChange={(v) => onFpsChange(Number(v) as LTX23FPS)}
				>
					<SelectTrigger id={`${idPrefix}-fps`} className="h-8 text-xs">
						<SelectValue placeholder="Select frame rate" />
					</SelectTrigger>
					<SelectContent>
						{LTX23_CONFIG.FPS_OPTIONS.STANDARD.map((f) => {
							const disabled =
								isExtendedDuration &&
								!extendedFps.includes(f as (typeof extendedFps)[number]);
							return (
								<SelectItem key={f} value={f.toString()} disabled={disabled}>
									{f} FPS
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
			</div>

			{/* Aspect Ratio */}
			<div className="space-y-1">
				<Label
					htmlFor={`${idPrefix}-aspect-ratio`}
					className="text-xs font-medium"
				>
					Aspect Ratio
				</Label>
				<Select value={aspectRatio} onValueChange={onAspectRatioChange}>
					<SelectTrigger
						id={`${idPrefix}-aspect-ratio`}
						className="h-8 text-xs"
					>
						<SelectValue placeholder="Select aspect ratio" />
					</SelectTrigger>
					<SelectContent>
						{aspectOptions.map((ar) => (
							<SelectItem key={ar} value={ar}>
								{ar === "auto" ? "Auto (from image)" : ar}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Generate Audio */}
			<div className="flex items-center space-x-2">
				<Checkbox
					id={`${idPrefix}-audio`}
					checked={generateAudio}
					onCheckedChange={(checked) => onGenerateAudioChange(Boolean(checked))}
				/>
				<Label htmlFor={`${idPrefix}-audio`} className="text-xs">
					Generate audio
				</Label>
			</div>

			{/* Extended duration warning */}
			{isExtendedDuration && (
				<div className="text-xs text-muted-foreground">
					Longer clips (12-20s) are limited to 1080p at 25 FPS.
				</div>
			)}
		</div>
	);
}

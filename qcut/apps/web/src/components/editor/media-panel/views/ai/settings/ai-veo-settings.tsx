/**
 * Veo 3.1 Settings Panel Component
 *
 * Renders settings panel for Veo 3.1 text-to-video models including:
 * - Resolution selector (720p, 1080p)
 * - Duration selector (4s, 6s, 8s) with dynamic pricing
 * - Aspect ratio selector (16:9, 9:16, 1:1, auto)
 * - Generate audio toggle
 * - Enhance prompt toggle
 * - Auto-fix toggle (policy compliance)
 *
 * @see ai-tsx-refactoring.md - Subtask 4.2
 */

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// ============================================
// Types
// ============================================

export type Veo31Resolution = "720p" | "1080p";
export type Veo31Duration = "4s" | "6s" | "8s";
export type Veo31AspectRatio = "9:16" | "16:9" | "1:1" | "auto";

export interface Veo31Settings {
	resolution: Veo31Resolution;
	duration: Veo31Duration;
	aspectRatio: Veo31AspectRatio;
	generateAudio: boolean;
	enhancePrompt: boolean;
	autoFix: boolean;
}

export interface AIVeo31SettingsProps {
	/** Current settings */
	settings: Veo31Settings;
	/** Callback when resolution changes */
	onResolutionChange: (value: Veo31Resolution) => void;
	/** Callback when duration changes */
	onDurationChange: (value: Veo31Duration) => void;
	/** Callback when aspect ratio changes */
	onAspectRatioChange: (value: Veo31AspectRatio) => void;
	/** Callback when generate audio changes */
	onGenerateAudioChange: (value: boolean) => void;
	/** Callback when enhance prompt changes */
	onEnhancePromptChange: (value: boolean) => void;
	/** Callback when auto-fix changes */
	onAutoFixChange: (value: boolean) => void;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get duration price display based on audio toggle and resolution.
 * Lite uses per-second pricing: $0.05/s at 720p, $0.08/s at 1080p.
 * Fast/Standard have flat per-video pricing (resolution-independent).
 */
function getDurationPrice(
	duration: Veo31Duration,
	generateAudio: boolean,
	resolution: Veo31Resolution = "720p"
): string {
	const seconds = Number.parseInt(duration.replace("s", ""), 10);
	const litePerSecond = resolution === "1080p" ? 0.08 : 0.05;
	const litePrice = `$${(seconds * litePerSecond).toFixed(2)}`;

	const prices: Record<Veo31Duration, { withAudio: string; noAudio: string }> =
		{
			"4s": {
				withAudio: `${litePrice} Lite / $0.60 Fast / $1.60 Std`,
				noAudio: "$0.40 Fast / $0.80 Std",
			},
			"6s": {
				withAudio: `${litePrice} Lite / $0.90 Fast / $2.40 Std`,
				noAudio: "$0.60 Fast / $1.20 Std",
			},
			"8s": {
				withAudio: `${litePrice} Lite / $1.20 Fast / $3.20 Std`,
				noAudio: "$0.80 Fast / $1.60 Std",
			},
		};

	return generateAudio ? prices[duration].withAudio : prices[duration].noAudio;
}

// ============================================
// Component
// ============================================

/**
 * Veo 3.1 settings panel component.
 *
 * @example
 * ```tsx
 * <AIVeo31Settings
 *   settings={veo31Settings}
 *   onResolutionChange={(v) => setVeo31Resolution(v)}
 *   onDurationChange={(v) => setVeo31Duration(v)}
 *   onAspectRatioChange={(v) => setVeo31AspectRatio(v)}
 *   onGenerateAudioChange={(v) => setVeo31GenerateAudio(v)}
 *   onEnhancePromptChange={(v) => setVeo31EnhancePrompt(v)}
 *   onAutoFixChange={(v) => setVeo31AutoFix(v)}
 * />
 * ```
 */
export function AIVeo31Settings({
	settings,
	onResolutionChange,
	onDurationChange,
	onAspectRatioChange,
	onGenerateAudioChange,
	onEnhancePromptChange,
	onAutoFixChange,
}: AIVeo31SettingsProps) {
	return (
		<div className="space-y-3 p-3 bg-muted/30 rounded-md border border-muted">
			<Label className="text-xs font-medium">Veo 3.1 Settings</Label>

			{/* Resolution selector */}
			<div className="space-y-1">
				<Label htmlFor="veo31-resolution" className="text-xs">
					Resolution
				</Label>
				<Select
					value={settings.resolution}
					onValueChange={(v) => onResolutionChange(v as Veo31Resolution)}
				>
					<SelectTrigger id="veo31-resolution" className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="720p">720p</SelectItem>
						<SelectItem value="1080p">1080p</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Duration selector */}
			<div className="space-y-1">
				<Label htmlFor="veo31-duration" className="text-xs">
					Duration
				</Label>
				<Select
					value={settings.duration}
					onValueChange={(v) => onDurationChange(v as Veo31Duration)}
				>
					<SelectTrigger id="veo31-duration" className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="4s">
							4 seconds (
							{getDurationPrice(
								"4s",
								settings.generateAudio,
								settings.resolution
							)}
							)
						</SelectItem>
						<SelectItem value="6s">
							6 seconds (
							{getDurationPrice(
								"6s",
								settings.generateAudio,
								settings.resolution
							)}
							)
						</SelectItem>
						<SelectItem value="8s">
							8 seconds (
							{getDurationPrice(
								"8s",
								settings.generateAudio,
								settings.resolution
							)}
							)
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Aspect ratio selector */}
			<div className="space-y-1">
				<Label htmlFor="veo31-aspect" className="text-xs">
					Aspect Ratio
				</Label>
				<Select
					value={settings.aspectRatio}
					onValueChange={(v) => onAspectRatioChange(v as Veo31AspectRatio)}
				>
					<SelectTrigger id="veo31-aspect" className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="16:9">16:9 (Landscape)</SelectItem>
						<SelectItem value="9:16">9:16 (Portrait)</SelectItem>
						<SelectItem value="1:1">1:1 (Square)</SelectItem>
						<SelectItem value="auto">Auto</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Audio toggle */}
			<div className="flex items-center justify-between">
				<Label htmlFor="veo31-audio" className="text-xs">
					Generate Audio
				</Label>
				<input
					id="veo31-audio"
					type="checkbox"
					checked={settings.generateAudio}
					onChange={(e) => onGenerateAudioChange(e.target.checked)}
					className="h-4 w-4"
				/>
			</div>

			{/* Enhance prompt toggle */}
			<div className="flex items-center justify-between">
				<Label htmlFor="veo31-enhance" className="text-xs">
					Enhance Prompt
				</Label>
				<input
					id="veo31-enhance"
					type="checkbox"
					checked={settings.enhancePrompt}
					onChange={(e) => onEnhancePromptChange(e.target.checked)}
					className="h-4 w-4"
				/>
			</div>

			{/* Auto-fix toggle */}
			<div className="flex items-center justify-between">
				<Label htmlFor="veo31-autofix" className="text-xs">
					Auto Fix (Policy Compliance)
				</Label>
				<input
					id="veo31-autofix"
					type="checkbox"
					checked={settings.autoFix}
					onChange={(e) => onAutoFixChange(e.target.checked)}
					className="h-4 w-4"
				/>
			</div>
		</div>
	);
}

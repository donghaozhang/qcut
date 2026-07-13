import type { SmartPackagingOptions } from "@qcut/editor-core/templates";
import {
	Blend,
	Captions,
	LoaderCircle,
	Scan,
	Sparkles,
	Sticker,
	Type,
	Volume2,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	applySmartPackagingToEditor,
	previewSmartPackagingPlan,
} from "@/lib/templates/smart-packaging-application";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";

type BooleanOptionKey =
	| "addText"
	| "addStickers"
	| "addSoundEffects"
	| "addZooms"
	| "addTransitions";

interface SmartPackagingToggle {
	key: BooleanOptionKey;
	label: string;
	detail: string;
	icon: ComponentType<{ className?: string; children?: React.ReactNode }>;
}

const SMART_PACKAGING_TOGGLES: readonly SmartPackagingToggle[] = [
	{
		key: "addText",
		label: "Highlight text",
		detail: "Caption-driven text templates",
		icon: Type,
	},
	{
		key: "addStickers",
		label: "Motion accents",
		detail: "Animated bursts on strong beats",
		icon: Sticker,
	},
	{
		key: "addSoundEffects",
		label: "Sound accents",
		detail: "Local PCM pops on key moments",
		icon: Volume2,
	},
	{
		key: "addZooms",
		label: "Shot movement",
		detail: "Alternating scale keyframes",
		icon: Scan,
	},
	{
		key: "addTransitions",
		label: "Clip transitions",
		detail: "Dissolve and whip-pan at seams",
		icon: Blend,
	},
];

const DEFAULT_OPTIONS: SmartPackagingOptions = {
	addText: true,
	addStickers: true,
	addSoundEffects: true,
	addZooms: true,
	addTransitions: true,
};

function sourceStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="min-w-0 border-r border-border px-2 last:border-r-0">
			<div className="text-sm font-semibold tabular-nums">{value}</div>
			<div className="truncate text-[10px] text-muted-foreground">{label}</div>
		</div>
	);
}

export function SmartPackagingView() {
	const tracks = useTimelineStore((state) => state.tracks);
	const beatCache = useBeatDetectionStore((state) => state.cache);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const [options, setOptions] =
		useState<SmartPackagingOptions>(DEFAULT_OPTIONS);
	const [isApplying, setIsApplying] = useState(false);
	const plan = useMemo(
		() => previewSmartPackagingPlan({ tracks, beatCache, options, fps }),
		[beatCache, fps, options, tracks]
	);
	const actionCounts = useMemo(
		() => ({
			text: plan.actions.filter((action) => action.kind === "text").length,
			stickers: plan.actions.filter((action) => action.kind === "sticker")
				.length,
			sound: plan.actions.filter((action) => action.kind === "sound-effect")
				.length,
			zooms: plan.actions.filter((action) => action.kind === "zoom").length,
			transitions: plan.actions.filter((action) => action.kind === "transition")
				.length,
		}),
		[plan.actions]
	);

	const handleApply = async () => {
		setIsApplying(true);
		try {
			const result = await applySmartPackagingToEditor({ options });
			const total = Object.values(result.appliedCounts).reduce(
				(sum, count) => sum + count,
				0
			);
			toast.success(`Applied ${total} Smart Pack actions`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Smart Pack could not be applied"
			);
		} finally {
			setIsApplying(false);
		}
	};

	return (
		<div className="space-y-3" data-testid="smart-pack-panel">
			<div className="flex items-center gap-2 border-b border-border pb-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded bg-primary/12 text-primary">
					<Sparkles className="size-4">
						<title>Smart Pack</title>
					</Sparkles>
				</div>
				<div className="min-w-0">
					<div className="text-xs font-medium">Timeline automation</div>
					<div className="truncate text-[10px] text-muted-foreground">
						Captions, beats, and shot boundaries
					</div>
				</div>
			</div>

			<div className="grid grid-cols-3 border-y border-border py-2">
				{sourceStat({ label: "Captions", value: plan.sourceCounts.captions })}
				{sourceStat({ label: "Beats", value: plan.sourceCounts.beats })}
				{sourceStat({ label: "Shots", value: plan.sourceCounts.shots })}
			</div>

			<div className="divide-y divide-border border-y border-border">
				{SMART_PACKAGING_TOGGLES.map((item) => {
					const Icon = item.icon;
					return (
						<label
							key={item.key}
							className="flex min-h-12 items-center gap-2 py-2"
						>
							<Icon className="size-4 shrink-0 text-muted-foreground">
								<title>{item.label}</title>
							</Icon>
							<span className="min-w-0 flex-1">
								<span className="block text-xs">{item.label}</span>
								<span className="block truncate text-[10px] text-muted-foreground">
									{item.detail}
								</span>
							</span>
							<Switch
								checked={options[item.key]}
								onCheckedChange={(checked) =>
									setOptions((current) => ({
										...current,
										[item.key]: checked,
									}))
								}
								aria-label={item.label}
							/>
						</label>
					);
				})}
			</div>

			<div>
				<div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
					<Captions className="size-3.5">
						<title>Planned actions</title>
					</Captions>
					Planned actions
				</div>
				<div className="grid grid-cols-5 gap-1 text-center">
					{Object.entries(actionCounts).map(([label, count]) => (
						<div key={label} className="min-w-0 bg-foreground/5 px-1 py-1.5">
							<div className="text-xs font-semibold tabular-nums">{count}</div>
							<div className="truncate text-[9px] capitalize text-muted-foreground">
								{label}
							</div>
						</div>
					))}
				</div>
			</div>

			{plan.warnings.length > 0 && (
				<div className="space-y-1 text-[10px] text-muted-foreground">
					{plan.warnings.slice(0, 3).map((warning) => (
						<div key={warning}>• {warning}</div>
					))}
				</div>
			)}

			<Button
				type="button"
				className="h-8 w-full"
				disabled={isApplying || plan.actions.length === 0}
				onClick={handleApply}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !isApplying) void handleApply();
				}}
				data-testid="apply-smart-pack"
			>
				{isApplying ? (
					<LoaderCircle className="size-4 animate-spin">
						<title>Applying Smart Pack</title>
					</LoaderCircle>
				) : (
					<Sparkles className="size-4">
						<title>Apply Smart Pack</title>
					</Sparkles>
				)}
				Apply Smart Pack
			</Button>
		</div>
	);
}

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface FilterLabActiveEffect {
	enabled: boolean;
	name: string;
	intensity: number;
}

export function JianyingFilterLabControls({
	effect,
	onEnabledChange,
	onIntensityChange,
	onIntensityCommit,
}: {
	effect: FilterLabActiveEffect;
	onEnabledChange: ({ enabled }: { enabled: boolean }) => void;
	onIntensityChange: ({ value }: { value: number }) => void;
	onIntensityCommit: () => void;
}) {
	return (
		<div
			className="space-y-2 rounded-md border border-border/60 bg-foreground/[0.025] p-2"
			data-testid="jianying-filter-lab-controls"
		>
			<div className="flex items-center gap-2">
				<span
					className="min-w-0 flex-1 truncate text-xs font-medium"
					title={effect.name}
				>
					{effect.name}
				</span>
				<div
					className="grid w-[116px] grid-cols-2 rounded-sm bg-foreground/8 p-0.5"
					role="group"
					aria-label="原图与滤镜对比"
				>
					{[
						{ enabled: false, label: "A 原图" },
						{ enabled: true, label: "B 滤镜" },
					].map((option) => (
						<button
							key={option.label}
							type="button"
							className={cn(
								"h-6 rounded-sm text-[10px] transition-colors",
								effect.enabled === option.enabled
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							)}
							aria-pressed={effect.enabled === option.enabled}
							onClick={() => onEnabledChange({ enabled: option.enabled })}
							onKeyDown={(event) => {
								if (event.key === "Escape") event.currentTarget.blur();
							}}
						>
							{option.label}
						</button>
					))}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<span className="w-8 shrink-0 text-[10px] text-muted-foreground">
					强度
				</span>
				<Slider
					className="min-w-0 flex-1"
					value={[Math.min(100, Math.max(0, effect.intensity))]}
					min={0}
					max={100}
					step={1}
					disabled={!effect.enabled}
					aria-label="剪映滤镜强度"
					onValueChange={([value]) => onIntensityChange({ value })}
					onValueCommit={onIntensityCommit}
				/>
				<span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
					{Math.round(effect.intensity)}%
				</span>
			</div>
		</div>
	);
}

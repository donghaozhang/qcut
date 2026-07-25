import type { MediaMaskType } from "@/types/timeline";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MASK_SHAPES, type AddableMaskType } from "./media-mask-shapes";

export function MediaMaskShapeGrid({
	selectedType,
	onSelect,
}: {
	selectedType?: MediaMaskType;
	onSelect: (type: AddableMaskType) => void;
}) {
	return (
		<TooltipProvider delayDuration={300}>
			<div
				className="flex gap-2 overflow-x-auto pb-1 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin]"
				data-testid="media-mask-shape-grid"
			>
				{MASK_SHAPES.map((shape) => {
					const Icon = shape.icon;
					const selected = selectedType === shape.type;

					return (
						<Tooltip key={shape.type}>
							<TooltipTrigger asChild>
								<button
									type="button"
									className="group flex w-11 shrink-0 flex-col items-center gap-1.5 text-[11px] text-muted-foreground outline-hidden"
									onClick={() => onSelect(shape.type)}
									onKeyDown={(event) => {
										if (event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										onSelect(shape.type);
									}}
									aria-label={`${selected ? "已选" : "选择"}${shape.label}蒙版`}
									aria-pressed={selected}
									data-mask-shape={shape.type}
								>
									<span
										className={cn(
											"flex size-11 items-center justify-center rounded-md border bg-muted/55 text-foreground transition-colors group-hover:bg-muted group-focus-visible:ring-1 group-focus-visible:ring-ring",
											selected
												? "border-cyan-400 bg-cyan-400/5 text-cyan-50"
												: "border-transparent"
										)}
									>
										<Icon className="size-6 shrink-0" strokeWidth={1.35} />
									</span>
									<span
										className={cn(
											"w-full truncate text-center leading-none",
											selected && "text-foreground"
										)}
									>
										{shape.label}
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent>{shape.label}蒙版</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</TooltipProvider>
	);
}

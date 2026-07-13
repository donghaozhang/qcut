import type { MediaMaskType } from "@/types/timeline";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
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
				className="grid grid-cols-4 gap-1.5"
				data-testid="media-mask-shape-grid"
			>
				{MASK_SHAPES.map((shape) => {
					const Icon = shape.icon;
					const selected = selectedType === shape.type;

					return (
						<Tooltip key={shape.type}>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant={selected ? "primary" : "outline"}
									className="h-14 min-w-0 flex-col gap-1 px-1 py-1.5"
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
									<Icon className="size-4 shrink-0" />
									<span className="w-full truncate text-[10px] leading-none">
										{shape.label}
									</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>{shape.label}蒙版</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</TooltipProvider>
	);
}

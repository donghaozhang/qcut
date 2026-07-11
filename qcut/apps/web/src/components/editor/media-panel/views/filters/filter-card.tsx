import { RotateCcw, Star } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export function FilterCard({
	id,
	name,
	localizedName,
	thumbnail,
	selected,
	disabled,
	favorite,
	reset,
	onSelect,
	onFavoriteChange,
}: {
	id: string;
	name: string;
	localizedName?: string;
	thumbnail: string;
	selected: boolean;
	disabled: boolean;
	favorite?: boolean;
	reset?: boolean;
	onSelect: () => void;
	onFavoriteChange?: () => void;
}) {
	const handleKeyDown = ({
		event,
	}: {
		event: KeyboardEvent<HTMLDivElement>;
	}) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		if (!disabled) onSelect();
	};

	return (
		<div
			role="button"
			tabIndex={disabled ? -1 : 0}
			aria-disabled={disabled}
			aria-pressed={selected}
			className={cn(
				"group relative min-w-0 overflow-hidden rounded-md border bg-card text-left outline-none transition-colors",
				"hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary",
				selected && "border-primary ring-1 ring-primary/50",
				disabled && "cursor-not-allowed opacity-45"
			)}
			onClick={() => {
				if (!disabled) onSelect();
			}}
			onKeyDown={(event) => handleKeyDown({ event })}
			data-testid={`filter-card-${id}`}
		>
			<div className="relative aspect-[8/5] overflow-hidden bg-muted">
				<img
					src={thumbnail}
					alt=""
					className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
					draggable={false}
				/>
				{reset && (
					<div className="absolute inset-0 flex items-center justify-center bg-black/20">
						<RotateCcw className="size-5 text-white drop-shadow" />
					</div>
				)}
				{onFavoriteChange && (
					<button
						type="button"
						className={cn(
							"absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded bg-black/55 text-white transition-colors hover:bg-black/75",
							favorite && "text-amber-300"
						)}
						aria-label={
							favorite ? `Remove ${name} from favorites` : `Favorite ${name}`
						}
						title={favorite ? "Remove from favorites" : "Add to favorites"}
						onClick={(event) => {
							event.stopPropagation();
							onFavoriteChange();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.stopPropagation();
							}
						}}
					>
						<Star className={cn("size-3.5", favorite && "fill-current")} />
					</button>
				)}
			</div>
			<div className="min-w-0 px-2 py-1.5">
				<div className="truncate text-[11px] font-medium text-foreground">
					{name}
				</div>
				{localizedName && (
					<div className="truncate text-[10px] text-muted-foreground">
						{localizedName}
					</div>
				)}
			</div>
		</div>
	);
}

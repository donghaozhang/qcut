import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollTrackProps<T> {
	items: T[];
	selectedIndex: number;
	onSelect: (index: number) => void;
	renderItem: (item: T, index: number, selected: boolean) => ReactNode;
	label: string;
}

/** Horizontally scrollable selection track with keyboard-wheel redirection and snap alignment. */
export function ScrollTrack<T>({
	items,
	selectedIndex,
	onSelect,
	renderItem,
	label,
}: ScrollTrackProps<T>) {
	const trackRef = useRef<HTMLDivElement>(null);

	// Scroll selected item into view on mount
	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const selected = track.querySelector("[data-selected='true']");
		if (selected?.scrollIntoView) {
			selected.scrollIntoView({
				inline: "center",
				block: "nearest",
			});
		}
	}, []);

	// Convert vertical wheel → horizontal scroll (non-passive to allow preventDefault)
	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const handleWheel = (e: WheelEvent) => {
			if (Math.abs(e.deltaY) > 0) {
				e.preventDefault();
				track.scrollBy({
					left: e.deltaY * 2,
					behavior: "smooth",
				});
			}
		};
		track.addEventListener("wheel", handleWheel, { passive: false });
		return () => track.removeEventListener("wheel", handleWheel);
	}, []);

	return (
		<div className="mb-3">
			<div className="text-xs text-muted-foreground/60 tracking-[1.5px] uppercase mb-1.5 pl-1">
				{label}
			</div>
			<div
				ref={trackRef}
				className="flex gap-2.5 overflow-x-auto py-1.5 px-0.5 scroll-smooth snap-x snap-mandatory [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]"
			>
				{items.map((item, i) => (
					<button
						type="button"
						key={i}
						data-selected={i === selectedIndex}
						onClick={() => {
							onSelect(i);
							// Smooth scroll clicked item to center
							const el = trackRef.current?.children[i] as
								| HTMLElement
								| undefined;
							el?.scrollIntoView?.({
								behavior: "smooth",
								inline: "center",
								block: "nearest",
							});
						}}
						className={cn(
							"shrink-0 w-[100px] rounded-xl p-3 pt-2.5 text-center cursor-pointer transition-all duration-200 border-2 border-transparent snap-center flex flex-col items-center gap-1",
							"bg-muted/40 hover:bg-muted/60 hover:border-muted-foreground/20",
							i === selectedIndex &&
								"border-primary/60 bg-primary/10 scale-105 hover:bg-primary/10 hover:border-primary/60"
						)}
					>
						{renderItem(item, i, i === selectedIndex)}
					</button>
				))}
			</div>
		</div>
	);
}

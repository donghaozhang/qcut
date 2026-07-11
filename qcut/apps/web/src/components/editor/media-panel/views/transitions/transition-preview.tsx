import { cn } from "@/lib/utils";
import type { TransitionPreset } from "./transition-presets";

interface TransitionPreviewProps {
	preset: TransitionPreset;
}

function getIncomingClass({ preset }: { preset: TransitionPreset }): string {
	if (preset.type === "slide") {
		return preset.direction === "right"
			? "translate-x-full group-hover:translate-x-0"
			: "-translate-x-full group-hover:translate-x-0";
	}

	if (preset.type === "zoom") {
		return "scale-75 opacity-0 blur-sm group-hover:scale-100 group-hover:opacity-100 group-hover:blur-0";
	}

	if (preset.type === "wipe") {
		return "translate-x-[-70%] group-hover:translate-x-0";
	}

	return "opacity-0 group-hover:opacity-100";
}

function getOutgoingClass({ preset }: { preset: TransitionPreset }): string {
	if (preset.type === "slide") {
		return preset.direction === "right"
			? "group-hover:-translate-x-full"
			: "group-hover:translate-x-full";
	}

	if (preset.type === "fade") {
		return "group-hover:opacity-0";
	}

	if (preset.type === "glitch") {
		return "group-hover:translate-x-1 group-hover:skew-x-3";
	}

	return "group-hover:opacity-30";
}

export function TransitionPreview({ preset }: TransitionPreviewProps) {
	const showsLightSweep = preset.type === "light";
	const showsGlitch = preset.type === "glitch";

	return (
		<div className="relative h-full w-full overflow-hidden bg-neutral-950">
			<div
				className={cn(
					"absolute inset-0 transition-all duration-500 ease-out",
					getOutgoingClass({ preset })
				)}
			>
				<div className="h-full w-full bg-[linear-gradient(135deg,#334155_0%,#0f766e_52%,#f97316_100%)]" />
				<div className="absolute left-2 top-2 h-5 w-8 rounded-sm bg-white/20" />
				<div className="absolute bottom-2 right-2 h-8 w-8 rounded-full bg-white/25" />
			</div>
			<div
				className={cn(
					"absolute inset-0 transition-all duration-500 ease-out",
					preset.type === "wipe" && "overflow-hidden",
					getIncomingClass({ preset })
				)}
			>
				<div className="h-full w-full bg-[linear-gradient(135deg,#111827_0%,#7c2d12_48%,#facc15_100%)]" />
				<div className="absolute right-3 top-3 h-8 w-8 rounded-sm border border-white/40" />
				<div className="absolute bottom-2 left-2 h-5 w-12 rounded-full bg-white/25" />
			</div>
			{showsLightSweep && (
				<div className="absolute inset-y-0 -left-1/2 w-1/2 rotate-12 bg-white/50 blur-md transition-transform duration-500 group-hover:translate-x-[220%]" />
			)}
			{showsGlitch && (
				<div className="absolute inset-0 opacity-0 mix-blend-screen transition-opacity duration-300 group-hover:opacity-70">
					<div className="h-1/3 translate-x-2 bg-cyan-400/40" />
					<div className="h-1/3 -translate-x-3 bg-rose-500/35" />
					<div className="h-1/3 translate-x-1 bg-lime-300/30" />
				</div>
			)}
			<div className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
				<div className="h-full w-1/3 rounded-full bg-white/80 transition-all duration-500 group-hover:w-full" />
			</div>
		</div>
	);
}

import { Plus } from "lucide-react";

export function CreateProjectTile({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			data-testid="create-project-tile"
			className="group/create glow-tile flex flex-col items-center justify-center aspect-video rounded-md border border-amber-500/20 bg-muted/10 hover:bg-muted/30 hover:scale-[1.02] transition-all duration-200 cursor-pointer"
		>
			<div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-2 transition-colors">
				<Plus className="h-5 w-5 text-amber-400 transition-colors" />
			</div>
			<span className="text-sm text-muted-foreground group-hover/create:text-foreground font-medium transition-colors">
				+ Create New Project
			</span>
		</button>
	);
}

import { Plus, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoProjects({
	onCreateProject,
}: {
	onCreateProject: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-center">
			<div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-5">
				<Sparkles className="h-8 w-8 text-primary" />
			</div>
			<h3 className="text-xl font-semibold mb-2">
				Start your first AI-powered video
			</h3>
			<p className="text-muted-foreground mb-8 max-w-sm">
				Create a project to begin editing with AI assistance
			</p>
			<Button
				variant="primary"
				size="lg"
				className="gap-2"
				onClick={onCreateProject}
				data-testid="new-project-button-empty-state"
			>
				<Plus className="h-4 w-4" />
				Create Your First Project
			</Button>
		</div>
	);
}

export function NoResults({
	searchQuery,
	onClearSearch,
}: {
	searchQuery: string;
	onClearSearch: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
				<Search className="h-8 w-8 text-muted-foreground" />
			</div>
			<h3 className="text-lg font-medium mb-2">No results found</h3>
			<p className="text-muted-foreground mb-6 max-w-md">
				Your search for "{searchQuery}" did not return any results.
			</p>
			<Button onClick={onClearSearch} variant="outline">
				Clear Search
			</Button>
		</div>
	);
}

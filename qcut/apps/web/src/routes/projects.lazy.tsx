import { useCallback, useState } from "react";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronLeft,
	LayoutGrid,
	List,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { motion } from "motion/react";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { AiStatusIndicator } from "@/components/project/ai-status-indicator";
import { CreateProjectTile } from "@/components/project/create-project-tile";
import { NoProjects, NoResults } from "@/components/project/empty-state";
import { ProjectCard } from "@/components/project/project-card";
import { ProjectListRow } from "@/components/project/project-list-row";
import { RecentActivity } from "@/components/project/recent-activity";
import { StudioBackground } from "@/components/project/studio-background";
import { TemplateGallery } from "@/components/project/template-gallery";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProjectStore } from "@/stores/project-store";
import { useLicenseStore } from "@/stores/license-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { UserAvatar } from "@/components/user-avatar";
import type { CanvasSize } from "@/types/editor";

export const Route = createLazyFileRoute("/projects")({
	component: ProjectsPage,
});

function ProjectsPage() {
	const {
		savedProjects,
		isLoading,
		isInitialized,
		deleteProject,
		createNewProject,
		getFilteredAndSortedProjects,
	} = useProjectStore();
	const [thumbnailCache, setThumbnailCache] = useState<
		Record<string, string | null>
	>({});
	const [_loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(
		new Set()
	);
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
		new Set()
	);
	const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortOption, setSortOption] = useState("createdAt-desc");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const navigate = useNavigate();

	const getProjectThumbnail = useCallback(
		async (projectId: string): Promise<string | null> => {
			if (thumbnailCache[projectId] !== undefined) {
				return thumbnailCache[projectId];
			}

			setLoadingThumbnails((prev) => new Set(prev).add(projectId));

			try {
				const thumbnail = await useTimelineStore
					.getState()
					.getProjectThumbnail(projectId);
				setThumbnailCache((prev) => ({ ...prev, [projectId]: thumbnail }));
				return thumbnail;
			} finally {
				setLoadingThumbnails((prev) => {
					const newSet = new Set(prev);
					newSet.delete(projectId);
					return newSet;
				});
			}
		},
		[thumbnailCache]
	);

	const handleCreateProject = async () => {
		const projectId = await createNewProject("New Project");
		navigate({ to: "/editor/$project_id", params: { project_id: projectId } });
	};

	const handleCreateFromTemplate = async (
		name: string,
		canvasSize: CanvasSize
	) => {
		const projectId = await createNewProject(name, { canvasSize });
		navigate({ to: "/editor/$project_id", params: { project_id: projectId } });
	};

	const handleSelectProject = (projectId: string, checked: boolean) => {
		const newSelected = new Set(selectedProjects);
		if (checked) {
			newSelected.add(projectId);
		} else {
			newSelected.delete(projectId);
		}
		setSelectedProjects(newSelected);
	};

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedProjects(new Set(sortedProjects.map((p) => p.id)));
		} else {
			setSelectedProjects(new Set());
		}
	};

	const handleCancelSelection = () => {
		setIsSelectionMode(false);
		setSelectedProjects(new Set());
	};

	const handleBulkDelete = async () => {
		await Promise.all(
			Array.from(selectedProjects).map((projectId) => deleteProject(projectId))
		);
		setSelectedProjects(new Set());
		setIsSelectionMode(false);
		setIsBulkDeleteDialogOpen(false);
	};

	const sortedProjects = getFilteredAndSortedProjects(searchQuery, sortOption);

	const allSelected =
		sortedProjects.length > 0 &&
		selectedProjects.size === sortedProjects.length;
	const someSelected =
		selectedProjects.size > 0 && selectedProjects.size < sortedProjects.length;

	// Center grid when few projects (including create tile) — grid mode only
	const useFlexLayout =
		viewMode === "grid" && sortedProjects.length <= 2 && !isSelectionMode;

	return (
		<div className="relative min-h-screen bg-background">
			<StudioBackground />
			{/* Top bar */}
			<div className="pt-6 px-6 flex items-center justify-between w-full h-16">
				<Link
					to="/"
					className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
				>
					<ChevronLeft className="size-5! shrink-0" />
					<span className="text-sm font-medium">Back</span>
				</Link>
				<div className="flex items-center gap-3">
				<ProjectsUserAvatar />
				<div className="block md:hidden">
					{isSelectionMode ? (
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={handleCancelSelection}
							>
								<X className="size-4!" />
								Cancel
							</Button>
							{selectedProjects.size > 0 && (
								<Button
									variant="destructive"
									size="sm"
									onClick={() => setIsBulkDeleteDialogOpen(true)}
								>
									<Trash2 className="size-4!" />
									Delete ({selectedProjects.size})
								</Button>
							)}
						</div>
					) : (
						<Button
							variant="primary"
							onClick={handleCreateProject}
							data-testid="new-project-button-mobile"
						>
							<Plus className="size-4!" />
							<span className="text-sm font-medium">New Project</span>
						</Button>
					)}
				</div>
				</div>
			</div>

			<main className="max-w-5xl mx-auto px-6 pt-6 pb-6">
				{/* Header: title + actions */}
				<div className="mb-8 flex items-center justify-between">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl md:text-3xl font-bold tracking-tight">
								Studio
							</h1>
							<AiStatusIndicator />
						</div>
						<p className="text-sm text-muted-foreground">
							{savedProjects.length}{" "}
							{savedProjects.length === 1 ? "project" : "projects"}
							{isSelectionMode && selectedProjects.size > 0 && (
								<span className="ml-2 text-primary">
									&bull; {selectedProjects.size} selected
								</span>
							)}
						</p>
					</div>
					<div className="hidden md:block">
						{isSelectionMode ? (
							<div className="flex items-center gap-2">
								<Button variant="outline" onClick={handleCancelSelection}>
									<X className="size-4!" />
									Cancel
								</Button>
								{selectedProjects.size > 0 && (
									<Button
										variant="destructive"
										onClick={() => setIsBulkDeleteDialogOpen(true)}
									>
										<Trash2 className="size-4!" />
										Delete Selected ({selectedProjects.size})
									</Button>
								)}
							</div>
						) : (
							<div className="flex items-center gap-2">
								<Button
									variant="text"
									onClick={() => setIsSelectionMode(true)}
									disabled={savedProjects.length === 0}
									className="text-sm"
								>
									Select Projects
								</Button>
								<Button
									variant="primary"
									onClick={handleCreateProject}
									data-testid="new-project-button"
								>
									<Plus className="size-4!" />
									New Project
								</Button>
							</div>
						)}
					</div>
				</div>

				{/* Unified control bar */}
				<div className="mb-6 flex items-center gap-3 rounded-lg bg-muted/30 p-2">
					<div className="flex-1 max-w-72 relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
						<Input
							placeholder="Search projects..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-8 bg-background border-none"
						/>
					</div>
					<ToggleGroup
						type="single"
						value={viewMode}
						onValueChange={(v) => {
							if (v) setViewMode(v as "grid" | "list");
						}}
						size="sm"
						className="bg-background rounded-md p-0.5"
					>
						<ToggleGroupItem
							value="grid"
							aria-label="Grid view"
							className="px-2 py-1.5"
						>
							<LayoutGrid className="size-4" />
						</ToggleGroupItem>
						<ToggleGroupItem
							value="list"
							aria-label="List view"
							className="px-2 py-1.5"
						>
							<List className="size-4" />
						</ToggleGroupItem>
					</ToggleGroup>
					<Select value={sortOption} onValueChange={setSortOption}>
						<SelectTrigger className="w-[170px] bg-background border-none">
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="createdAt-desc">Newest First</SelectItem>
							<SelectItem value="createdAt-asc">Oldest First</SelectItem>
							<SelectItem value="name-asc">Name A–Z</SelectItem>
							<SelectItem value="name-desc">Name Z–A</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Select all bar */}
				{isSelectionMode && sortedProjects.length > 0 && (
					<button
						type="button"
						onClick={() => handleSelectAll(!allSelected)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleSelectAll(!allSelected);
							}
						}}
						className="w-full hover:cursor-pointer gap-2 mb-6 p-4 bg-muted/30 rounded-lg border items-center flex"
						tabIndex={0}
					>
						<Checkbox checked={someSelected ? "indeterminate" : allSelected} />
						<span className="text-sm font-medium">
							{allSelected ? "Deselect All" : "Select All"}
						</span>
						<span className="text-sm text-muted-foreground">
							({selectedProjects.size} of {sortedProjects.length} selected)
						</span>
					</button>
				)}

				{/* Project grid / list */}
				{isLoading || !isInitialized ? (
					viewMode === "list" ? (
						<div className="space-y-1">
							{Array.from({ length: 6 }, (_, index) => (
								<div
									key={`skeleton-${index}`}
									className="flex items-center gap-3 px-3 py-2"
								>
									<Skeleton className="w-16 h-9 rounded bg-muted/50 shrink-0" />
									<Skeleton className="h-4 flex-1 bg-muted/50" />
									<Skeleton className="h-3 w-24 bg-muted/50" />
								</div>
							))}
						</div>
					) : (
						<div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
							{Array.from({ length: 8 }, (_, index) => (
								<div
									key={`skeleton-${index}`}
									className="overflow-hidden bg-background rounded-md"
								>
									<Skeleton className="aspect-video w-full bg-muted/50" />
									<div className="px-3 pt-3 pb-2 flex flex-col gap-1">
										<Skeleton className="h-4 w-3/4 bg-muted/50" />
										<Skeleton className="h-3 w-24 bg-muted/50" />
									</div>
								</div>
							))}
						</div>
					)
				) : savedProjects.length === 0 ? (
					<NoProjects onCreateProject={handleCreateProject} />
				) : sortedProjects.length === 0 ? (
					<NoResults
						searchQuery={searchQuery}
						onClearSearch={() => setSearchQuery("")}
					/>
				) : viewMode === "list" ? (
					<div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
						{sortedProjects.map((project, index) => (
							<motion.div
								key={project.id}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{
									duration: 0.2,
									delay: index * 0.03,
									ease: "easeOut",
								}}
							>
								<ProjectListRow
									project={project}
									isSelectionMode={isSelectionMode}
									isSelected={selectedProjects.has(project.id)}
									onSelect={handleSelectProject}
									getProjectThumbnail={getProjectThumbnail}
								/>
							</motion.div>
						))}
					</div>
				) : (
					<div
						className={
							useFlexLayout
								? "flex flex-wrap justify-center gap-6"
								: "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6"
						}
					>
						{sortedProjects.map((project, index) => (
							<motion.div
								key={project.id}
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.3,
									delay: index * 0.05,
									ease: "easeOut",
								}}
								className={useFlexLayout ? "w-full max-w-[280px]" : undefined}
							>
								<ProjectCard
									project={project}
									isSelectionMode={isSelectionMode}
									isSelected={selectedProjects.has(project.id)}
									onSelect={handleSelectProject}
									getProjectThumbnail={getProjectThumbnail}
								/>
							</motion.div>
						))}
						{!isSelectionMode && (
							<motion.div
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.3,
									delay: sortedProjects.length * 0.05,
									ease: "easeOut",
								}}
								className={useFlexLayout ? "w-full max-w-[280px]" : undefined}
							>
								<CreateProjectTile onClick={handleCreateProject} />
							</motion.div>
						)}
					</div>
				)}

				{/* Recent activity strip */}
				{!isLoading && isInitialized && savedProjects.length > 0 && (
					<RecentActivity projects={savedProjects} />
				)}

				{/* Template section — shown only for newer users */}
				{!isLoading && isInitialized && savedProjects.length < 5 && (
					<TemplateGallery onCreateFromTemplate={handleCreateFromTemplate} />
				)}
			</main>

			<DeleteProjectDialog
				isOpen={isBulkDeleteDialogOpen}
				onOpenChange={setIsBulkDeleteDialogOpen}
				onConfirm={handleBulkDelete}
			/>
		</div>
	);
}

function ProjectsUserAvatar() {
	const user = useLicenseStore((s) => s.license?.user);
	if (!user) return null;
	return <UserAvatar user={user} />;
}

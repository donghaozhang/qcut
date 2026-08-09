import { useCallback, useState } from "react";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronLeft,
	FileInput,
	LayoutGrid,
	List,
	Plus,
	Search,
	Trash2,
	X,
} from "lucide-react";
import { motion } from "motion/react";
import { AppUpdateButton } from "@/components/app-update-button";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { JianyingDraftImportCard } from "@/components/import-dialog/jianying-draft-import-card";
import { AiStatusIndicator } from "@/components/project/ai-status-indicator";
import { CreateProjectTile } from "@/components/project/create-project-tile";
import { NoProjects, NoResults } from "@/components/project/empty-state";
import { ProjectCard } from "@/components/project/project-card";
import { FoldersStrip } from "@/components/project/project-folders";
import {
	buildProjectCreationOptions,
	getVisibleSelectionState,
} from "@/components/project/project-page-helpers";
import {
	ProjectListHeader,
	ProjectListRow,
} from "@/components/project/project-list-row";
import { ProjectsUserChip } from "@/components/project/projects-user-chip";
import { RecentActivity } from "@/components/project/recent-activity";
import { StartCreatingBanner } from "@/components/project/start-creating-banner";
import { StudioBackground } from "@/components/project/studio-background";
import { TemplateGallery } from "@/components/project/template-gallery";
import { useProjectDurationLoader } from "@/components/project/use-project-duration-loader";
import { useProjectThumbnailLoader } from "@/components/project/use-project-thumbnail-loader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { useAppVersion } from "@/hooks/use-app-version";
import { useJianyingDraftImport } from "@/hooks/import/use-jianying-draft-import";
import { useProjectStore } from "@/stores/project-store";
import type { CanvasSize } from "@/types/editor";
import { LanguageSelector } from "@/components/language-selector";
import { useTranslation } from "@/lib/i18n";

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
		loadAllProjects,
	} = useProjectStore();
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
		new Set()
	);
	const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortOption, setSortOption] = useState("updatedAt-desc");
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
	const [isDraftImportOpen, setIsDraftImportOpen] = useState(false);
	const getProjectThumbnail = useProjectThumbnailLoader();
	const getProjectDuration = useProjectDurationLoader();
	const appVersion = useAppVersion();
	const navigate = useNavigate();
	const { t } = useTranslation();
	const handleImportedProject = useCallback(async () => {
		await loadAllProjects();
	}, [loadAllProjects]);
	const draftImport = useJianyingDraftImport({
		onProjectImported: handleImportedProject,
	});

	const handleDraftImportOpenChange = useCallback(
		(open: boolean) => {
			setIsDraftImportOpen(open);
			if (open) void draftImport.refreshInbox();
		},
		[draftImport.refreshInbox]
	);

	const handleOpenImportedProject = useCallback(
		(projectId: string) => {
			setIsDraftImportOpen(false);
			navigate({
				to: "/editor/$project_id",
				params: { project_id: projectId },
			});
		},
		[navigate]
	);

	const handleCreateProject = async () => {
		const projectId = await createNewProject(
			t("projects.new"),
			buildProjectCreationOptions({ folderId: currentFolderId })
		);
		navigate({ to: "/editor/$project_id", params: { project_id: projectId } });
	};

	const handleCreateFromTemplate = async (
		name: string,
		canvasSize: CanvasSize
	) => {
		const projectId = await createNewProject(
			name,
			buildProjectCreationOptions({
				folderId: currentFolderId,
				canvasSize,
			})
		);
		navigate({ to: "/editor/$project_id", params: { project_id: projectId } });
	};

	const handleOpenFolder = useCallback((folderId: string | null) => {
		setCurrentFolderId(folderId);
		setSelectedProjects(new Set());
	}, []);

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
			setSelectedProjects(new Set(visibleProjects.map((p) => p.id)));
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

	// Search looks across every folder; otherwise show the current folder only
	const visibleProjects = searchQuery
		? sortedProjects
		: sortedProjects.filter(
				(project) => (project.folderId ?? null) === currentFolderId
			);

	const { allSelected, someSelected } = getVisibleSelectionState({
		visibleProjectIds: visibleProjects.map((project) => project.id),
		selectedProjectIds: selectedProjects,
	});

	// Center grid when few projects (including create tile) — grid mode only
	const useFlexLayout =
		viewMode === "grid" && visibleProjects.length <= 2 && !isSelectionMode;

	return (
		<div className="relative min-h-screen bg-background">
			<StudioBackground />
			{/* Top bar */}
			<div className="pt-6 px-6 flex items-center justify-between w-full h-16">
				<div className="flex items-center gap-4">
					<Link
						to="/"
						className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
					>
						<ChevronLeft className="size-5! shrink-0" />
						<span className="text-sm font-medium">{t("projects.back")}</span>
					</Link>
					<div className="h-5 w-px bg-border/60" />
					<ProjectsUserChip />
				</div>
				<div className="flex items-center gap-3">
					<AppUpdateButton />
					{appVersion && (
						<span
							className="text-xs text-muted-foreground"
							title={t("updates.currentVersion", { version: appVersion })}
							data-testid="app-version"
						>
							v{appVersion}
						</span>
					)}
					<LanguageSelector />
					<div className="block md:hidden">
						{isSelectionMode ? (
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handleCancelSelection}
								>
									<X className="size-4!" />
									{t("common.cancel")}
								</Button>
								{selectedProjects.size > 0 && (
									<Button
										variant="destructive"
										size="sm"
										onClick={() => setIsBulkDeleteDialogOpen(true)}
									>
										<Trash2 className="size-4!" />
										{t("projects.deleteSelected", {
											count: selectedProjects.size,
										})}
									</Button>
								)}
							</div>
						) : (
							<div className="flex items-center gap-2">
								{draftImport.isAvailable && (
									<Button
										variant="outline"
										size="icon"
										onClick={() => handleDraftImportOpenChange(true)}
										aria-label={t("draftImport.button")}
									>
										<FileInput className="size-4" />
									</Button>
								)}
								<Button
									variant="primary"
									onClick={handleCreateProject}
									data-testid="new-project-button-mobile"
								>
									<Plus className="size-4!" />
									<span className="text-sm font-medium">
										{t("projects.new")}
									</span>
								</Button>
							</div>
						)}
					</div>
				</div>
			</div>

			<main className="max-w-5xl mx-auto px-6 pt-6 pb-6">
				{/* Start creating banner */}
				{!isSelectionMode && (
					<StartCreatingBanner onClick={handleCreateProject} />
				)}

				{/* Header: title + actions */}
				<div className="mb-8 flex items-center justify-between">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl md:text-3xl font-bold tracking-tight">
								{t("projects.title")}
							</h1>
							<AiStatusIndicator />
						</div>
						<p className="text-sm text-muted-foreground">
							{t(
								savedProjects.length === 1
									? "projects.countOne"
									: "projects.countMany",
								{ count: savedProjects.length }
							)}
							{isSelectionMode && selectedProjects.size > 0 && (
								<span className="ml-2 text-primary">
									&bull;{" "}
									{t("projects.selected", { count: selectedProjects.size })}
								</span>
							)}
						</p>
					</div>
					<div className="hidden md:block">
						{isSelectionMode ? (
							<div className="flex items-center gap-2">
								<Button variant="outline" onClick={handleCancelSelection}>
									<X className="size-4!" />
									{t("common.cancel")}
								</Button>
								{selectedProjects.size > 0 && (
									<Button
										variant="destructive"
										onClick={() => setIsBulkDeleteDialogOpen(true)}
									>
										<Trash2 className="size-4!" />
										{t("projects.deleteSelected", {
											count: selectedProjects.size,
										})}
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
									{t("projects.select")}
								</Button>
								{draftImport.isAvailable && (
									<Button
										variant="outline"
										onClick={() => handleDraftImportOpenChange(true)}
										data-testid="import-draft-button"
									>
										<FileInput className="size-4" />
										{t("draftImport.button")}
										{draftImport.inboxEntries.length > 0 && (
											<span className="tabular-nums text-xs text-muted-foreground">
												{draftImport.inboxEntries.length}
											</span>
										)}
									</Button>
								)}
								<Button
									variant="primary"
									onClick={handleCreateProject}
									data-testid="new-project-button"
								>
									<Plus className="size-4!" />
									{t("projects.new")}
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
							placeholder={t("projects.search")}
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
							aria-label={t("projects.grid")}
							className="px-2 py-1.5"
						>
							<LayoutGrid className="size-4" />
						</ToggleGroupItem>
						<ToggleGroupItem
							value="list"
							aria-label={t("projects.list")}
							className="px-2 py-1.5"
						>
							<List className="size-4" />
						</ToggleGroupItem>
					</ToggleGroup>
					<Select value={sortOption} onValueChange={setSortOption}>
						<SelectTrigger className="w-[170px] bg-background border-none">
							<SelectValue placeholder={t("projects.sortBy")} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="updatedAt-desc">
								{t("projects.recentlyModified")}
							</SelectItem>
							<SelectItem value="createdAt-desc">
								{t("projects.newest")}
							</SelectItem>
							<SelectItem value="createdAt-asc">
								{t("projects.oldest")}
							</SelectItem>
							<SelectItem value="name-asc">{t("projects.nameAsc")}</SelectItem>
							<SelectItem value="name-desc">
								{t("projects.nameDesc")}
							</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Folder navigation (hidden while searching — search spans all folders) */}
				{!searchQuery && !isLoading && isInitialized && (
					<FoldersStrip
						currentFolderId={currentFolderId}
						onOpenFolder={handleOpenFolder}
					/>
				)}

				{/* Select all bar */}
				{isSelectionMode && visibleProjects.length > 0 && (
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
							{allSelected
								? t("projects.deselectAll")
								: t("projects.selectAll")}
						</span>
						<span className="text-sm text-muted-foreground">
							{t("projects.selectionSummary", {
								selected: selectedProjects.size,
								total: visibleProjects.length,
							})}
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
				) : visibleProjects.length === 0 && searchQuery ? (
					<NoResults
						searchQuery={searchQuery}
						onClearSearch={() => setSearchQuery("")}
					/>
				) : visibleProjects.length === 0 && currentFolderId ? (
					<p className="py-16 text-center text-sm text-muted-foreground">
						{t("projects.folderEmpty")}
					</p>
				) : viewMode === "list" ? (
					<div className="rounded-lg border border-border/50 divide-y divide-border/30 overflow-hidden">
						<ProjectListHeader />
						{visibleProjects.map((project, index) => (
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
									getProjectDuration={getProjectDuration}
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
						{visibleProjects.map((project, index) => (
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
									getProjectDuration={getProjectDuration}
								/>
							</motion.div>
						))}
						{!isSelectionMode && (
							<motion.div
								initial={{ opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.3,
									delay: visibleProjects.length * 0.05,
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
			<Dialog
				open={isDraftImportOpen}
				onOpenChange={handleDraftImportOpenChange}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("draftImport.title")}</DialogTitle>
						<DialogDescription className="sr-only">
							{t("draftImport.description")}
						</DialogDescription>
					</DialogHeader>
					<JianyingDraftImportCard
						controller={draftImport}
						onOpenProject={handleOpenImportedProject}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}

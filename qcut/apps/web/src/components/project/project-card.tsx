import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Calendar, Loader2, MoreHorizontal, Video } from "lucide-react";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { RenameProjectDialog } from "@/components/rename-project-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/stores/project-store";
import type { TProject } from "@/types/project";
import { MoveToFolderSubmenu } from "./project-folders";
import { PROJECT_DRAG_MIME, formatProjectDuration } from "./project-meta";

export interface ProjectCardProps {
	project: TProject;
	isSelectionMode?: boolean;
	isSelected?: boolean;
	onSelect?: (projectId: string, checked: boolean) => void;
	getProjectThumbnail: (projectId: string) => Promise<string | null>;
	getProjectDuration?: (projectId: string) => Promise<number | null>;
}

export function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatRelativeTime(date: Date): string {
	const diff = Date.now() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	return formatDate(date);
}

export function ProjectCard({
	project,
	isSelectionMode = false,
	isSelected = false,
	onSelect,
	getProjectThumbnail,
	getProjectDuration,
}: ProjectCardProps) {
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [dynamicThumbnail, setDynamicThumbnail] = useState<string | null>(null);
	const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(true);
	const [duration, setDuration] = useState<number | null>(null);
	const { deleteProject, renameProject, duplicateProject } = useProjectStore();

	useEffect(() => {
		const loadThumbnail = async () => {
			setIsLoadingThumbnail(true);
			try {
				const thumbnail = await getProjectThumbnail(project.id);
				setDynamicThumbnail(thumbnail);
			} finally {
				setIsLoadingThumbnail(false);
			}
		};
		loadThumbnail();
	}, [project.id, getProjectThumbnail]);

	useEffect(() => {
		if (!getProjectDuration) return;
		let cancelled = false;
		getProjectDuration(project.id)
			.then((value) => {
				if (!cancelled) setDuration(value);
			})
			.catch(() => {
				if (!cancelled) setDuration(null);
			});
		return () => {
			cancelled = true;
		};
	}, [project.id, getProjectDuration]);

	const handleDeleteProject = async () => {
		await deleteProject(project.id);
		setIsDropdownOpen(false);
	};

	const handleRenameProject = async (newName: string) => {
		await renameProject(project.id, newName);
		setIsRenameDialogOpen(false);
	};

	const handleDuplicateProject = async () => {
		setIsDropdownOpen(false);
		await duplicateProject(project.id);
	};

	const handleCardClick = (e: React.MouseEvent) => {
		if (isSelectionMode) {
			e.preventDefault();
			onSelect?.(project.id, !isSelected);
		}
	};

	const handleCardKeyDown = (e: React.KeyboardEvent) => {
		if (isSelectionMode && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onSelect?.(project.id, !isSelected);
		}
	};

	const cardContent = (
		<Card
			className={`overflow-hidden bg-card border-2 border-border/60 dark:border-border/80 p-0 shadow-sm hover:shadow-md dark:shadow-black/30 transition-all duration-200 hover:-translate-y-1 ${
				isSelectionMode && isSelected ? "ring-2 ring-primary" : ""
			}`}
			data-testid="project-list-item"
		>
			<div className="card-vignette relative aspect-video bg-muted dark:bg-muted/80 rounded-t-md overflow-hidden">
				{isSelectionMode && (
					<div className="absolute top-3 left-3 z-10">
						<div className="w-5 h-5 rounded bg-background/80 backdrop-blur-xs border flex items-center justify-center">
							<Checkbox
								checked={isSelected}
								onCheckedChange={(checked) =>
									onSelect?.(project.id, checked as boolean)
								}
								onClick={(e) => e.stopPropagation()}
								className="w-4 h-4"
							/>
						</div>
					</div>
				)}

				<div className="absolute inset-0 group-hover:brightness-110 transition-[filter] duration-200">
					{isLoadingThumbnail ? (
						<div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 dark:from-[hsl(0,0%,18%)] dark:to-[hsl(0,0%,12%)] flex items-center justify-center">
							<Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
						</div>
					) : dynamicThumbnail ? (
						<img
							src={dynamicThumbnail}
							alt="Project thumbnail"
							loading="lazy"
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="w-full h-full bg-gradient-to-br from-muted to-muted/60 dark:from-[hsl(0,0%,18%)] dark:to-[hsl(0,0%,12%)] flex items-center justify-center">
							<Video className="h-6 w-6 shrink-0 text-muted-foreground" />
						</div>
					)}
				</div>

				{duration !== null && duration > 0 && (
					<span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/65 text-white text-[11px] leading-none tabular-nums">
						{formatProjectDuration(duration)}
					</span>
				)}
			</div>

			<CardContent className="px-3 pt-3 pb-2 flex flex-col gap-1">
				<div className="flex items-start justify-between">
					<h3 className="font-medium text-sm leading-snug group-hover:text-foreground/90 transition-colors line-clamp-2">
						{project.name}
					</h3>
					{!isSelectionMode && (
						<DropdownMenu
							open={isDropdownOpen}
							onOpenChange={setIsDropdownOpen}
						>
							<DropdownMenuTrigger asChild>
								<Button
									variant="text"
									size="sm"
									aria-label="Project options"
									className={`size-6 p-0 transition-all shrink-0 ml-2 ${
										isDropdownOpen
											? "opacity-100"
											: "opacity-0 group-hover:opacity-100"
									}`}
									onClick={(e) => e.preventDefault()}
								>
									<MoreHorizontal />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								onCloseAutoFocus={(e) => {
									e.preventDefault();
									e.stopPropagation();
								}}
							>
								<DropdownMenuItem
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setIsDropdownOpen(false);
										setIsRenameDialogOpen(true);
									}}
								>
									Rename
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleDuplicateProject();
									}}
								>
									Duplicate
								</DropdownMenuItem>
								<MoveToFolderSubmenu project={project} />
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setIsDropdownOpen(false);
										setIsDeleteDialogOpen(true);
									}}
								>
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>

				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Calendar className="size-3!" />
					<span>{formatDate(project.createdAt)}</span>
					<span className="text-muted-foreground/50">&middot;</span>
					<span>{formatRelativeTime(project.updatedAt)}</span>
				</div>
			</CardContent>
		</Card>
	);

	return (
		<>
			{isSelectionMode ? (
				<div
					onClick={handleCardClick}
					onKeyDown={handleCardKeyDown}
					className="block group cursor-pointer w-full text-left"
					role="button"
					tabIndex={0}
				>
					{cardContent}
				</div>
			) : (
				<Link
					to="/editor/$project_id"
					params={{ project_id: project.id }}
					className="block group"
					draggable
					onDragStart={(e) => {
						e.dataTransfer.setData(PROJECT_DRAG_MIME, project.id);
						e.dataTransfer.effectAllowed = "move";
					}}
				>
					{cardContent}
				</Link>
			)}
			<DeleteProjectDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDeleteProject}
			/>
			<RenameProjectDialog
				isOpen={isRenameDialogOpen}
				onOpenChange={setIsRenameDialogOpen}
				onConfirm={handleRenameProject}
				projectName={project.name}
			/>
		</>
	);
}

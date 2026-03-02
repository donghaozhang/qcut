import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MoreHorizontal, Video } from "lucide-react";
import { DeleteProjectDialog } from "@/components/delete-project-dialog";
import { RenameProjectDialog } from "@/components/rename-project-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/stores/project-store";
import { formatDate } from "./project-card";
import type { ProjectCardProps } from "./project-card";

export function ProjectListRow({
	project,
	isSelectionMode = false,
	isSelected = false,
	onSelect,
	getProjectThumbnail,
}: ProjectCardProps) {
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [dynamicThumbnail, setDynamicThumbnail] = useState<string | null>(null);
	const [isLoadingThumbnail, setIsLoadingThumbnail] = useState(true);
	const { deleteProject, renameProject, duplicateProject } = useProjectStore();

	useEffect(() => {
		const loadThumbnail = async () => {
			setIsLoadingThumbnail(true);
			try {
				const thumbnail = await getProjectThumbnail(project.id);
				setDynamicThumbnail(thumbnail);
			} catch {
				setDynamicThumbnail(null);
			} finally {
				setIsLoadingThumbnail(false);
			}
		};
		loadThumbnail();
	}, [project.id, getProjectThumbnail]);

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

	const handleRowClick = (e: React.MouseEvent) => {
		if (isSelectionMode) {
			e.preventDefault();
			onSelect?.(project.id, !isSelected);
		}
	};

	const handleRowKeyDown = (e: React.KeyboardEvent) => {
		if (isSelectionMode && (e.key === "Enter" || e.key === " ")) {
			e.preventDefault();
			onSelect?.(project.id, !isSelected);
		}
	};

	const thumbnail = (
		<div className="w-16 h-9 rounded bg-muted dark:bg-muted/80 overflow-hidden shrink-0">
			{isLoadingThumbnail ? (
				<div className="w-full h-full flex items-center justify-center">
					<Loader2 className="size-3 text-muted-foreground animate-spin" />
				</div>
			) : dynamicThumbnail ? (
				<img
					src={dynamicThumbnail}
					alt="Project thumbnail"
					className="w-full h-full object-cover"
				/>
			) : (
				<div className="w-full h-full flex items-center justify-center">
					<Video className="size-3.5 text-muted-foreground" />
				</div>
			)}
		</div>
	);

	const rowContent = (
		<div
			className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/40 transition-colors ${
				isSelectionMode && isSelected ? "bg-primary/5 ring-1 ring-primary/30" : ""
			}`}
			data-testid="project-list-item"
		>
			{isSelectionMode && (
				<Checkbox
					checked={isSelected}
					onCheckedChange={(checked) =>
						onSelect?.(project.id, checked as boolean)
					}
					onClick={(e) => e.stopPropagation()}
					className="shrink-0"
				/>
			)}

			{thumbnail}

			<span className="flex-1 text-sm font-medium truncate min-w-0">
				{project.name}
			</span>

			<span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
				{formatDate(project.updatedAt)}
			</span>

			{!isSelectionMode && (
				<DropdownMenu
					open={isDropdownOpen}
					onOpenChange={setIsDropdownOpen}
				>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="text"
							size="sm"
							className={`size-6 p-0 shrink-0 transition-all ${
								isDropdownOpen
									? "opacity-100"
									: "opacity-0 group-hover:opacity-100"
							}`}
							onClick={(e) => e.preventDefault()}
						>
							<MoreHorizontal className="size-4" />
							<span className="sr-only">Project options</span>
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
	);

	return (
		<>
			{isSelectionMode ? (
				<div
					onClick={handleRowClick}
					onKeyDown={handleRowKeyDown}
					className="group cursor-pointer"
					role="button"
					tabIndex={0}
				>
					{rowContent}
				</div>
			) : (
				<Link
					to="/editor/$project_id"
					params={{ project_id: project.id }}
					className="group"
				>
					{rowContent}
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

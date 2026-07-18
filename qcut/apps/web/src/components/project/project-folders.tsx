import { useEffect, useState } from "react";
import {
	ChevronRight,
	Folder,
	FolderInput,
	FolderPlus,
	MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useProjectStore } from "@/stores/project-store";
import { useTranslation } from "@/lib/i18n";
import type { ProjectFolder, TProject } from "@/types/project";
import { PROJECT_DRAG_MIME } from "./project-meta";

function readDraggedProjectId(e: React.DragEvent): string | null {
	return e.dataTransfer.getData(PROJECT_DRAG_MIME) || null;
}

function isProjectDrag(e: React.DragEvent): boolean {
	return e.dataTransfer.types.includes(PROJECT_DRAG_MIME);
}

/** Dialog for naming a new folder or renaming an existing one. */
function FolderNameDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	title,
	initialName = "",
	confirmLabel,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (name: string) => void;
	title: string;
	initialName?: string;
	confirmLabel: string;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState(initialName);

	useEffect(() => {
		if (isOpen) setName(initialName);
	}, [initialName, isOpen]);

	const submit = () => {
		if (name.trim()) onConfirm(name);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							submit();
						}
					}}
					placeholder={t("projects.folderName")}
					className="mt-4 bg-background/50"
				/>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("common.cancel")}
					</Button>
					<Button onClick={submit} disabled={!name.trim()}>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function FolderChip({
	folder,
	projectCount,
	onOpen,
}: {
	folder: ProjectFolder;
	projectCount: number;
	onOpen: (folderId: string) => void;
}) {
	const { t } = useTranslation();
	const { renameProjectFolder, deleteProjectFolder, moveProjectToFolder } =
		useProjectStore();
	const [isDragOver, setIsDragOver] = useState(false);
	const [isRenameOpen, setIsRenameOpen] = useState(false);

	return (
		<>
			<div
				className={`group flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
					isDragOver
						? "border-primary bg-primary/10"
						: "border-border/50 bg-muted/30 hover:bg-muted/50"
				}`}
				onClick={() => onOpen(folder.id)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onOpen(folder.id);
					}
				}}
				onDragOver={(e) => {
					if (!isProjectDrag(e)) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					setIsDragOver(false);
					const projectId = readDraggedProjectId(e);
					if (projectId) {
						e.preventDefault();
						moveProjectToFolder(projectId, folder.id);
					}
				}}
				role="button"
				tabIndex={0}
				data-testid="project-folder-chip"
			>
				<Folder className="size-4 text-muted-foreground shrink-0" />
				<span className="text-sm font-medium max-w-36 truncate">
					{folder.name}
				</span>
				<span className="text-xs text-muted-foreground">{projectCount}</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="text"
							size="sm"
							className="size-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
							onClick={(e) => e.stopPropagation()}
							aria-label={t("projects.renameFolder")}
						>
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={(e) => {
								e.stopPropagation();
								setIsRenameOpen(true);
							}}
						>
							{t("projects.renameFolder")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							onClick={(e) => {
								e.stopPropagation();
								deleteProjectFolder(folder.id);
							}}
						>
							{t("projects.deleteFolder")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<FolderNameDialog
				isOpen={isRenameOpen}
				onOpenChange={setIsRenameOpen}
				title={t("projects.renameFolder")}
				initialName={folder.name}
				confirmLabel={t("projects.renameFolder")}
				onConfirm={(name) => {
					renameProjectFolder(folder.id, name);
					setIsRenameOpen(false);
				}}
			/>
		</>
	);
}

/**
 * Folder navigation for the studio page. At the root it renders folder
 * chips (drop targets for project drags) plus a "new folder" action; inside
 * a folder it renders a breadcrumb whose root segment is also a drop target
 * for moving projects back out.
 */
export function FoldersStrip({
	currentFolderId,
	onOpenFolder,
}: {
	currentFolderId: string | null;
	onOpenFolder: (folderId: string | null) => void;
}) {
	const { t } = useTranslation();
	const { projectFolders, savedProjects, createProjectFolder } =
		useProjectStore();
	const moveProjectToFolder = useProjectStore((s) => s.moveProjectToFolder);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isRootDragOver, setIsRootDragOver] = useState(false);

	const currentFolder = projectFolders.find((f) => f.id === currentFolderId);

	if (currentFolder) {
		return (
			<div className="mb-6 flex items-center gap-1.5 text-sm">
				<button
					type="button"
					className={`px-2 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors ${
						isRootDragOver ? "bg-primary/10 text-foreground" : ""
					}`}
					onClick={() => onOpenFolder(null)}
					onDragOver={(e) => {
						if (!isProjectDrag(e)) return;
						e.preventDefault();
						e.dataTransfer.dropEffect = "move";
						setIsRootDragOver(true);
					}}
					onDragLeave={() => setIsRootDragOver(false)}
					onDrop={(e) => {
						setIsRootDragOver(false);
						const projectId = readDraggedProjectId(e);
						if (projectId) {
							e.preventDefault();
							moveProjectToFolder(projectId, null);
						}
					}}
				>
					{t("projects.allProjects")}
				</button>
				<ChevronRight className="size-4 text-muted-foreground/60" />
				<span className="flex items-center gap-1.5 px-2 py-1 font-medium">
					<Folder className="size-4 text-muted-foreground" />
					{currentFolder.name}
				</span>
			</div>
		);
	}

	return (
		<>
			<div className="mb-6 flex flex-wrap items-center gap-2">
				{projectFolders.map((folder) => (
					<FolderChip
						key={folder.id}
						folder={folder}
						projectCount={
							savedProjects.filter((p) => p.folderId === folder.id).length
						}
						onOpen={onOpenFolder}
					/>
				))}
				<Button
					variant="text"
					size="sm"
					className="gap-1.5 text-muted-foreground hover:text-foreground"
					onClick={() => setIsCreateOpen(true)}
					data-testid="new-folder-button"
				>
					<FolderPlus className="size-4" />
					{t("projects.newFolder")}
				</Button>
			</div>
			<FolderNameDialog
				isOpen={isCreateOpen}
				onOpenChange={setIsCreateOpen}
				title={t("projects.newFolder")}
				confirmLabel={t("projects.createFolder")}
				onConfirm={async (name) => {
					await createProjectFolder(name);
					setIsCreateOpen(false);
				}}
			/>
		</>
	);
}

/**
 * "Move to folder" submenu for project card/row dropdown menus.
 * Renders nothing when there are no folders and the project is at the root.
 */
export function MoveToFolderSubmenu({ project }: { project: TProject }) {
	const { t } = useTranslation();
	const projectFolders = useProjectStore((s) => s.projectFolders);
	const moveProjectToFolder = useProjectStore((s) => s.moveProjectToFolder);

	if (projectFolders.length === 0 && !project.folderId) return null;

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<FolderInput className="size-4 mr-2" />
				{t("projects.moveToFolder")}
			</DropdownMenuSubTrigger>
			<DropdownMenuPortal>
				<DropdownMenuSubContent>
					{projectFolders.map((folder) => (
						<DropdownMenuItem
							key={folder.id}
							disabled={project.folderId === folder.id}
							onClick={(e) => {
								e.stopPropagation();
								moveProjectToFolder(project.id, folder.id);
							}}
						>
							<Folder className="size-4 mr-2" />
							<span className="max-w-40 truncate">{folder.name}</span>
						</DropdownMenuItem>
					))}
					{project.folderId && (
						<>
							{projectFolders.length > 0 && <DropdownMenuSeparator />}
							<DropdownMenuItem
								onClick={(e) => {
									e.stopPropagation();
									moveProjectToFolder(project.id, null);
								}}
							>
								{t("projects.removeFromFolder")}
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuSubContent>
			</DropdownMenuPortal>
		</DropdownMenuSub>
	);
}

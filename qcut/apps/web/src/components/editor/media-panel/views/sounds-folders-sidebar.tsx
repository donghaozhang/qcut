import { Folder, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { SidebarGroupHeader } from "./sounds-sidebar-group";
import { useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AUDIO_FOLDER_NAME_MAX_LENGTH } from "@/lib/audio/audio-library-personal";
import type { AudioLibraryFolder } from "@/lib/audio/audio-library-personal";
import type { AudioLibrarySectionId } from "@/lib/audio/audio-library-catalog";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface FolderEditorState {
	folderId?: string;
	initialName: string;
	mode: "create" | "rename";
}

function AudioFolderEditor({
	editor,
	onClose,
	onSubmit,
}: {
	editor: FolderEditorState | null;
	onClose: () => void;
	onSubmit: ({
		folderId,
		mode,
		name,
	}: {
		folderId?: string;
		mode: FolderEditorState["mode"];
		name: string;
	}) => boolean;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");
	const [invalid, setInvalid] = useState(false);

	useEffect(() => {
		setName(editor?.initialName ?? "");
		setInvalid(false);
	}, [editor]);

	const submit = () => {
		if (!editor) return;
		const success = onSubmit({
			folderId: editor.folderId,
			mode: editor.mode,
			name,
		});
		setInvalid(!success);
		if (success) onClose();
	};

	return (
		<Dialog open={editor !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle className="text-base">
						{editor?.mode === "rename"
							? t("audioLibrary.folders.renameTitle")
							: t("audioLibrary.folders.createTitle")}
					</DialogTitle>
				</DialogHeader>
				<label className="space-y-1.5 text-xs">
					<span>{t("audioLibrary.folders.name")}</span>
					<Input
						value={name}
						maxLength={AUDIO_FOLDER_NAME_MAX_LENGTH}
						placeholder={t("audioLibrary.folders.namePlaceholder")}
						autoFocus
						onChange={(event) => {
							setName(event.target.value);
							setInvalid(false);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								submit();
							}
						}}
					/>
				</label>
				{invalid ? (
					<p className="text-xs text-destructive">
						{t("audioLibrary.folders.invalid")}
					</p>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						onKeyDown={() => undefined}
					>
						{t("audioLibrary.folders.cancel")}
					</Button>
					<Button
						type="button"
						disabled={!name.trim()}
						onClick={submit}
						onKeyDown={() => undefined}
					>
						{t("audioLibrary.folders.save")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function AudioFolderRow({
	active,
	folder,
	onDelete,
	onRename,
	onSelect,
}: {
	active: boolean;
	folder: AudioLibraryFolder;
	onDelete: () => void;
	onRename: () => void;
	onSelect: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div
			className={cn(
				"group flex h-7 items-center rounded",
				active
					? "bg-primary/15 text-primary"
					: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-left text-[10px]"
				aria-pressed={active}
				title={folder.name}
				onClick={onSelect}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onSelect();
					}
				}}
			>
				<Folder className="size-3 shrink-0" />
				<span className="truncate">{folder.name}</span>
				<span className="ml-auto tabular-nums opacity-60">
					{folder.assetKeys.length}
				</span>
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="mr-0.5 size-6 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
						aria-label={`${folder.name}: ${t("audioLibrary.card.moreActions", { name: folder.name })}`}
						title={t("audioLibrary.card.moreActions", { name: folder.name })}
					>
						<MoreHorizontal className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-40">
					<DropdownMenuItem onSelect={onRename}>
						<Pencil />
						{t("audioLibrary.folders.rename")}
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onSelect={onDelete}>
						<Trash2 />
						{t("audioLibrary.folders.delete")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

export function AudioFoldersSidebar({
	activeSection,
	collapsed,
	folders,
	onCreate,
	onDelete,
	onRename,
	onSelect,
	onToggle,
}: {
	activeSection: AudioLibrarySectionId;
	collapsed: boolean;
	folders: readonly AudioLibraryFolder[];
	onCreate: ({ name }: { name: string }) => string | null;
	onDelete: ({ folderId }: { folderId: string }) => void;
	onRename: ({ folderId, name }: { folderId: string; name: string }) => boolean;
	onSelect: ({ section }: { section: AudioLibrarySectionId }) => void;
	onToggle: () => void;
}) {
	const { t } = useTranslation();
	const [editor, setEditor] = useState<FolderEditorState | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<AudioLibraryFolder | null>(
		null
	);

	return (
		<>
			<div className="mt-3">
				<SidebarGroupHeader
					title={t("audioLibrary.folders.title")}
					collapsed={collapsed}
					onToggle={onToggle}
					actions={
						<Button
							type="button"
							variant="text"
							size="icon"
							className="ml-auto size-5 shrink-0"
							aria-label={t("audioLibrary.folders.create")}
							title={t("audioLibrary.folders.create")}
							onClick={() => setEditor({ mode: "create", initialName: "" })}
							onKeyDown={() => undefined}
						>
							<Plus className="size-3" />
						</Button>
					}
				/>
				{collapsed ? null : (
					<div className="space-y-0.5">
						{folders.map((folder) => (
							<AudioFolderRow
								key={folder.id}
								folder={folder}
								active={activeSection === `audio-folder:${folder.id}`}
								onSelect={() =>
									onSelect({ section: `audio-folder:${folder.id}` })
								}
								onRename={() =>
									setEditor({
										mode: "rename",
										folderId: folder.id,
										initialName: folder.name,
									})
								}
								onDelete={() => setDeleteTarget(folder)}
							/>
						))}
					</div>
				)}
			</div>

			<AudioFolderEditor
				editor={editor}
				onClose={() => setEditor(null)}
				onSubmit={({ folderId, mode, name }) => {
					if (mode === "create") return onCreate({ name }) !== null;
					return folderId ? onRename({ folderId, name }) : false;
				}}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent className="max-w-sm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("audioLibrary.folders.deleteTitle", {
								name: deleteTarget?.name ?? "",
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("audioLibrary.folders.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{t("audioLibrary.folders.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => {
								if (deleteTarget) onDelete({ folderId: deleteTarget.id });
								setDeleteTarget(null);
							}}
							onKeyDown={() => undefined}
						>
							{t("audioLibrary.folders.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

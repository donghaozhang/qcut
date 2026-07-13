"use client";

import { useFolderStore } from "@/stores/folder-store";
import { FolderItem } from "./folder-item";
import { CreateFolderDialog } from "./create-folder-dialog";
import { Button } from "@/components/ui/button";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/lib/i18n";

interface FolderTreeProps {
	onFolderSelect?: (folderId: string | null) => void;
}

export function FolderTree({ onFolderSelect }: FolderTreeProps) {
	const { t } = useTranslation();
	const { selectedFolderId, setSelectedFolder, getChildFolders } =
		useFolderStore();
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

	const rootFolders = getChildFolders(null);

	const handleSelect = (folderId: string | null) => {
		setSelectedFolder(folderId);
		onFolderSelect?.(folderId);
	};

	return (
		<div className="flex flex-col h-full border-r border-border bg-panel-accent/30">
			<div className="p-2 border-b border-border flex items-center justify-between">
				<span className="text-xs font-medium text-muted-foreground">
					{t("media.folders")}
				</span>
				<Button
					type="button"
					variant="text"
					size="sm"
					className="h-6 w-6 p-0"
					onClick={() => setIsCreateDialogOpen(true)}
					aria-label={t("media.createFolder")}
				>
					<FolderPlus className="h-3.5 w-3.5" />
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-1">
					<button
						type="button"
						className={`w-full text-left px-2 py-1.5 text-sm rounded flex items-center gap-2 transition-colors ${
							selectedFolderId === null
								? "bg-accent text-accent-foreground"
								: "hover:bg-muted"
						}`}
						onClick={() => handleSelect(null)}
					>
						<span>{t("media.allMedia")}</span>
					</button>

					{rootFolders.map((folder) => (
						<FolderItem
							key={folder.id}
							folder={folder}
							depth={0}
							onSelect={handleSelect}
						/>
					))}

					{rootFolders.length === 0 && (
						<div className="px-2 py-4 text-xs text-muted-foreground text-center">
							{t("media.noFolders")}
							<br />
							{t("media.createFolderHint")}
						</div>
					)}
				</div>
			</ScrollArea>

			<CreateFolderDialog
				open={isCreateDialogOpen}
				onOpenChange={setIsCreateDialogOpen}
			/>
		</div>
	);
}

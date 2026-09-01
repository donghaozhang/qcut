import { platform } from "@qcut/platform-core";
import { memo, type MouseEvent } from "react";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaFolder } from "@/stores/media/media-store-types";
import {
	Edit,
	Layers,
	Copy,
	FolderInput,
	ExternalLink,
	FileJson,
} from "lucide-react";
import { toast } from "sonner";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubTrigger,
	ContextMenuSubContent,
	ContextMenuSeparator,
	ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { DraggableMediaItem } from "@/components/ui/draggable-item";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { addMediaItemAsOverlay } from "@/lib/stickers/add-media-overlay";
import { cn } from "@/lib/utils";
import { MediaPreview } from "./media-preview";
import { useTranslation } from "@/lib/i18n";

interface MediaItemCardProps {
	item: MediaItem;
	isSelected: boolean;
	filteredMediaItems: MediaItem[];
	folders: MediaFolder[];
	addToFolder: ((mediaId: string, folderId: string) => void) | undefined;
	removeFromFolder: ((mediaId: string, folderId: string) => void) | undefined;
	onToggleSelect: (id: string, e?: MouseEvent) => void;
	onEdit: (e: MouseEvent, item: MediaItem) => void;
	onRemove: (e: MouseEvent, id: string) => void;
	viewMode: "grid" | "list";
	usageCount: number;
}

/** Individual media item with drag support, selection ring, and context menu. */
export const MediaItemCard = memo(function MediaItemCard({
	item,
	isSelected,
	filteredMediaItems,
	folders,
	addToFolder,
	removeFromFolder,
	onToggleSelect,
	onEdit,
	onRemove,
	viewMode,
	usageCount,
}: MediaItemCardProps) {
	const { t } = useTranslation();

	return (
		<ContextMenu>
			<ContextMenuTrigger>
				<div
					onClickCapture={(e) => {
						onToggleSelect(item.id, e);
					}}
					className={cn(
						"relative rounded-sm transition-shadow",
						viewMode === "list" && "w-full border-b border-border/60 py-1",
						isSelected &&
							"ring-2 ring-primary ring-offset-1 ring-offset-background"
					)}
				>
					{usageCount > 0 ? (
						<span className="pointer-events-none absolute left-1 top-1 z-20 rounded-sm bg-cyan-600 px-1 py-0.5 text-[9px] font-medium text-white">
							{t("media.used", { count: usageCount })}
						</span>
					) : null}
					<DraggableMediaItem
						name={item.name}
						preview={<MediaPreview item={item} />}
						dragData={{
							id: item.id,
							type: item.type,
							name: item.name,
						}}
						showPlusOnDrag={false}
						onAddToTimeline={(currentTime) =>
							useTimelineStore.getState().addMediaAtTime(item, currentTime)
						}
						rounded={false}
						layout={viewMode}
						data-testid="media-item"
					/>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem disabled>Export clips</ContextMenuItem>
				{(item.type === "image" || item.type === "video") && (
					<ContextMenuItem
						aria-label="Add as overlay"
						onClick={(e) => {
							e.stopPropagation();

							debugLog("[MediaPanel] Overlay creation check:", {
								targetItemId: item.id,
								targetItemName: item.name,
								totalMediaItems: filteredMediaItems.length,
								timestamp: new Date().toISOString(),
							});

							// The timeline element is what gives the overlay its start/end;
							// without it the sticker would render on every exported frame.
							void addMediaItemAsOverlay({ mediaItemId: item.id })
								.then((result) => {
									if (result.success) {
										toast.success(`Added "${item.name}" as overlay`);
									} else {
										toast.error(result.error ?? "Could not add the overlay");
									}
								})
								.catch((error) => {
									debugError("[MediaPanel] Add as overlay failed:", error);
									toast.error("Could not add the overlay");
								});
						}}
					>
						<Layers className="h-4 w-4 mr-2" aria-hidden="true" />
						Add as Overlay
					</ContextMenuItem>
				)}
				{item.type === "image" && (
					<ContextMenuItem onClick={(e) => onEdit(e, item)}>
						<Edit className="h-4 w-4 mr-2" />
						Image edit
					</ContextMenuItem>
				)}

				{/* Add to Folders (multi-folder support) */}
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<FolderInput className="h-4 w-4 mr-2" aria-hidden="true" />
						Add to Folders
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						{folders.length === 0 && (
							<ContextMenuItem disabled>No folders created</ContextMenuItem>
						)}
						{folders.map((folder) => {
							const isInFolder = (item.folderIds || []).includes(folder.id);
							return (
								<ContextMenuCheckboxItem
									key={folder.id}
									checked={isInFolder}
									onCheckedChange={(checked) => {
										if (checked) {
											addToFolder?.(item.id, folder.id);
										} else {
											removeFromFolder?.(item.id, folder.id);
										}
									}}
								>
									{folder.name}
								</ContextMenuCheckboxItem>
							);
						})}
					</ContextMenuSubContent>
				</ContextMenuSub>

				{/* Copy File Path */}
				<ContextMenuItem
					onClick={async (e) => {
						e.stopPropagation();
						const path = item.localPath || item.url;
						if (path && !path.startsWith("blob:")) {
							try {
								await navigator.clipboard.writeText(path);
								toast.success("Path copied to clipboard");
							} catch (error) {
								debugError("[Media View] Clipboard copy failed:", error);
								toast.error("Failed to copy path");
							}
						} else {
							toast.error("No file path available");
						}
					}}
				>
					<Copy className="h-4 w-4 mr-2" aria-hidden="true" />
					Copy File Path
				</ContextMenuItem>

				{/* Copy Media Info (JSON for CLI agents) */}
				<ContextMenuItem
					onClick={async (e) => {
						e.stopPropagation();
						const info = {
							id: item.id,
							name: item.name,
							type: item.type,
							localPath: item.localPath || null,
							url: item.url && !item.url.startsWith("blob:") ? item.url : null,
							duration: item.duration || null,
							width: item.width || null,
							height: item.height || null,
						};
						try {
							await navigator.clipboard.writeText(
								JSON.stringify(info, null, 2)
							);
							toast.success("Media info copied to clipboard");
						} catch (error) {
							debugError("[Media View] Clipboard copy failed:", error);
							toast.error("Failed to copy media info");
						}
					}}
				>
					<FileJson className="h-4 w-4 mr-2" aria-hidden="true" />
					Copy Media Info
				</ContextMenuItem>

				{/* Open in Explorer (Electron only) */}
				{item.localPath && (
					<ContextMenuItem
						onClick={async (e) => {
							e.stopPropagation();
							const localPath = item.localPath;
							if (!localPath) return;
							if (platform().shell?.showItemInFolder) {
								try {
									await platform().shell.showItemInFolder(localPath);
								} catch (error) {
									debugError("[Media View] Open in Explorer failed:", error);
									toast.error("Failed to open in Explorer");
								}
							} else {
								toast.error("Only available in desktop app");
							}
						}}
					>
						<ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
						Open in Explorer
					</ContextMenuItem>
				)}

				<ContextMenuSeparator />

				<ContextMenuItem
					variant="destructive"
					onClick={(e) => onRemove(e, item.id)}
				>
					Delete
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});

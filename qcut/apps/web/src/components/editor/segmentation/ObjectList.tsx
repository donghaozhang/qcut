"use client";

import { useState } from "react";
import {
	useSegmentationStore,
	OBJECT_COLORS,
	type SegmentedObject,
} from "@/stores/ai/segmentation-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Plus, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBlobImage } from "@/hooks/media/use-blob-image";

/**
 * ObjectListItem
 *
 * Individual object item in the list.
 */
function ObjectListItem({ object }: { object: SegmentedObject }) {
	const {
		selectedObjectId,
		selectObject,
		removeObject,
		renameObject,
		toggleObjectVisibility,
	} = useSegmentationStore();

	const isSelected = selectedObjectId === object.id;
	const color = OBJECT_COLORS[object.colorIndex];

	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(object.name);

	// Convert FAL mask URLs to blob URLs to bypass COEP restrictions
	const { blobUrl: maskBlobUrl } = useBlobImage(
		object.maskBlobUrl ?? object.maskUrl
	);
	const { blobUrl: thumbnailBlobUrl } = useBlobImage(object.thumbnailUrl);

	const handleNameSubmit = () => {
		if (editName.trim()) {
			renameObject(object.id, editName.trim());
		}
		setIsEditing(false);
	};

	return (
		<div
			className={cn(
				"group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
				isSelected
					? "bg-accent border border-accent-foreground/20"
					: "hover:bg-accent/50",
				object.visible === false ? "opacity-60" : ""
			)}
			onClick={() => selectObject(object.id)}
			onKeyDown={(e) => {
				// Only handle keys when the row itself has focus, not child elements
				if (
					e.currentTarget === e.target &&
					(e.key === "Enter" || e.key === " ")
				) {
					e.preventDefault();
					selectObject(object.id);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Color indicator */}
			<div
				className="w-3 h-3 rounded-full flex-shrink-0"
				style={{ backgroundColor: color.hex }}
				aria-hidden="true"
			/>

			{/* Thumbnail or placeholder (use blob URLs to bypass COEP) */}
			<div className="w-10 h-10 rounded bg-muted flex-shrink-0 overflow-hidden">
				{thumbnailBlobUrl ? (
					<img
						src={thumbnailBlobUrl}
						alt={object.name}
						className="w-full h-full object-cover"
					/>
				) : maskBlobUrl ? (
					<img
						src={maskBlobUrl}
						alt={object.name}
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
						?
					</div>
				)}
			</div>

			{/* Name */}
			<div className="flex-1 min-w-0">
				{isEditing ? (
					<Input
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						onBlur={handleNameSubmit}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleNameSubmit();
							if (e.key === "Escape") setIsEditing(false);
						}}
						className="h-6 text-sm"
						autoFocus
					/>
				) : (
					<span
						className="text-sm truncate block"
						onDoubleClick={() => {
							setEditName(object.name);
							setIsEditing(true);
						}}
					>
						{object.name}
					</span>
				)}
				{object.score !== undefined && (
					<span className="text-xs text-muted-foreground">
						{Math.round(object.score * 100)}% confident
					</span>
				)}
			</div>

			<div className="flex items-center gap-1">
				{/* Visibility toggle */}
				<Button
					variant="text"
					size="icon"
					className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100"
					onClick={(e) => {
						e.stopPropagation();
						toggleObjectVisibility(object.id);
					}}
					aria-label={
						object.visible === false
							? `Show ${object.name}`
							: `Hide ${object.name}`
					}
				>
					{object.visible === false ? (
						<EyeOff className="w-3 h-3" aria-hidden="true" />
					) : (
						<Eye className="w-3 h-3" aria-hidden="true" />
					)}
				</Button>

				{/* Delete button */}
				<Button
					variant="text"
					size="icon"
					className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100"
					onClick={(e) => {
						e.stopPropagation();
						removeObject(object.id);
					}}
					aria-label={`Delete ${object.name}`}
				>
					<Trash2 className="w-3 h-3" aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}

/**
 * ObjectList
 *
 * Sidebar showing all segmented objects with color coding.
 */
export function ObjectList() {
	const { objects, clearObjects, addObject } = useSegmentationStore();

	const handleAddObject = () => {
		addObject({
			name: "",
			pointPrompts: [],
			boxPrompts: [],
			visible: true,
		});
	};

	if (objects.length === 0) {
		return (
			<div className="h-full flex flex-col">
				<div className="flex items-center justify-between mb-2">
					<h3 className="text-sm font-medium">Objects</h3>
				</div>
				<div className="flex-1 flex items-center justify-center text-center text-muted-foreground text-sm">
					<p>No objects detected yet</p>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center justify-between mb-2">
				<h3 className="text-sm font-medium">Objects ({objects.length})</h3>
				<Button
					variant="text"
					size="sm"
					onClick={clearObjects}
					className="h-6 text-xs"
				>
					Clear all
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="space-y-1 pr-2">
					{objects.map((object) => (
						<ObjectListItem key={object.id} object={object} />
					))}
				</div>
			</ScrollArea>

			{/* Action buttons */}
			<div className="mt-3 pt-3 border-t">
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					type="button"
					onClick={handleAddObject}
				>
					<Plus className="w-4 h-4 mr-2" />
					Add Object
				</Button>
			</div>
		</div>
	);
}

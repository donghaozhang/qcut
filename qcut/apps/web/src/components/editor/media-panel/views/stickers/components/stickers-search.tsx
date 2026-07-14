"use client";

import { Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StickersSearchProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	onUploadClick: () => void;
}

export function StickersSearch({
	searchQuery,
	onSearchChange,
	onUploadClick,
}: StickersSearchProps) {
	return (
		<div className="border-b border-border/50 p-3">
			<div className="flex gap-2">
				<div className="relative min-w-0 flex-1">
					<Search
						className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						placeholder="搜索贴纸 / Search stickers"
						value={searchQuery}
						onChange={(event) => onSearchChange(event.target.value)}
						aria-label="搜索贴纸 / Search stickers"
						className="h-9 pl-10 pr-10"
					/>
					{searchQuery && (
						<button
							type="button"
							className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded hover:bg-accent"
							onClick={() => onSearchChange("")}
							onKeyDown={(event) => {
								if (event.key === " ") {
									event.preventDefault();
									onSearchChange("");
								}
							}}
							aria-label="Clear search"
						>
							<X className="size-4" aria-hidden="true" />
						</button>
					)}
				</div>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-9 shrink-0"
					onClick={onUploadClick}
					onKeyDown={(event) => {
						if (event.key === " ") {
							event.preventDefault();
							onUploadClick();
						}
					}}
					aria-label="Upload sticker"
					title="Upload your own sticker"
				>
					<Upload className="size-4">
						<title>Upload sticker</title>
					</Upload>
				</Button>
			</div>
		</div>
	);
}

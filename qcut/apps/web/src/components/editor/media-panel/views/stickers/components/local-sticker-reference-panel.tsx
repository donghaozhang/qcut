"use client";

import { AlertCircle, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { debugError } from "@/lib/debug/debug-config";
import {
	loadLocalStickerReferenceFile,
	type LocalStickerReference,
} from "@/lib/stickers/local-sticker-reference";
import { cn } from "@/lib/utils";

interface LoadedReference {
	file: File;
	previewUrl: string;
}

function LocalStickerReferenceItem({
	onSelect,
	reference,
}: {
	onSelect: ({ file }: { file: File }) => Promise<void>;
	reference: LocalStickerReference;
}) {
	const [loaded, setLoaded] = useState<LoadedReference | null>(null);
	const [hasError, setHasError] = useState(false);
	const [isAdding, setIsAdding] = useState(false);

	useEffect(() => {
		let disposed = false;
		let previewUrl: string | undefined;

		const loadPreview = async () => {
			try {
				const file = await loadLocalStickerReferenceFile({ reference });
				previewUrl = URL.createObjectURL(file);
				if (disposed) {
					URL.revokeObjectURL(previewUrl);
					return;
				}
				setLoaded({ file, previewUrl });
			} catch (error) {
				debugError("[StickerLab] Failed to load local reference", error);
				if (!disposed) setHasError(true);
			}
		};

		loadPreview();
		return () => {
			disposed = true;
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [reference]);

	const handleSelect = async () => {
		if (!loaded || isAdding) return;
		setIsAdding(true);
		try {
			await onSelect({ file: loaded.file });
		} finally {
			setIsAdding(false);
		}
	};

	return (
		<div className="min-w-0">
			<button
				type="button"
				className="relative aspect-square w-full overflow-hidden rounded-lg border border-border/80 bg-foreground/[0.04] transition-colors hover:border-primary hover:bg-foreground/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
				disabled={!loaded || hasError || isAdding}
				aria-label={`添加${reference.displayName}到时间线`}
				data-testid="local-sticker-reference-item"
				onClick={handleSelect}
				onKeyDown={(event) => {
					if (event.key === " ") {
						event.preventDefault();
						handleSelect();
					}
				}}
			>
				{!loaded && !hasError && (
					<Loader2 className="mx-auto size-6 animate-spin text-muted-foreground">
						<title>正在载入本机贴纸</title>
					</Loader2>
				)}
				{hasError && (
					<AlertCircle className="mx-auto size-6 text-destructive">
						<title>本机贴纸无法载入</title>
					</AlertCircle>
				)}
				{loaded && (
					<img
						src={loaded.previewUrl}
						alt={reference.displayName}
						className={cn("size-full object-contain", isAdding && "opacity-50")}
						draggable={false}
					/>
				)}
				{loaded && (
					<span className="pointer-events-none absolute bottom-1 left-1 flex size-5 items-center justify-center rounded bg-background/85 text-emerald-300">
						<Play className="size-3 fill-current">
							<title>动画贴纸</title>
						</Play>
					</span>
				)}
				{isAdding && (
					<span className="absolute inset-0 flex items-center justify-center bg-background/35">
						<Loader2 className="size-6 animate-spin">
							<title>正在加入时间线</title>
						</Loader2>
					</span>
				)}
			</button>
			<p className="mt-1 truncate text-[11px] font-medium">
				{reference.displayName}
			</p>
			<p className="truncate text-[10px] text-muted-foreground">
				{reference.frameCount} 帧 · {reference.frameRate} FPS ·{" "}
				{reference.cycleDuration} 秒循环
			</p>
		</div>
	);
}

export function LocalStickerReferencePanel({
	onSelect,
	references,
}: {
	onSelect: ({ file }: { file: File }) => Promise<void>;
	references: LocalStickerReference[];
}) {
	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-testid="local-sticker-reference-panel"
		>
			<div className="shrink-0 border-b border-border/40 px-3 py-2">
				<p className="text-xs font-medium">贴纸实验室</p>
				<p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
					本机验证素材，不随 QCut 分发
				</p>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				<div className="grid grid-cols-3 gap-2">
					{references.map((reference) => (
						<LocalStickerReferenceItem
							key={reference.id}
							reference={reference}
							onSelect={onSelect}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

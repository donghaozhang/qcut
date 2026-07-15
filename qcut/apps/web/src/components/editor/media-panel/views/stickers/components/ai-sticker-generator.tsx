"use client";

import { useEffect, useRef, useState } from "react";
import {
	ImagePlus,
	Loader2,
	Plus,
	RefreshCw,
	Trash2,
	WandSparkles,
	X,
} from "lucide-react";
import { BlobImage } from "@/components/ui/blob-image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { generateWithModel } from "@/lib/ai-clients/fal-ai-client";
import {
	editImage,
	uploadImageToFAL,
} from "@/lib/ai-clients/image-edit-client";
import {
	buildAIStickerPrompt,
	validateAIStickerPrompt,
} from "@/lib/stickers/ai-sticker-prompt";
import { useLicenseStore } from "@/stores/license-store";

interface AIStickerHistoryItem {
	id: string;
	imageUrl: string;
	prompt: string;
	referenceName?: string;
	transparentBackground: boolean;
}

interface AIStickerGeneratorProps {
	onAddGeneratedSticker: ({
		file,
	}: {
		file: File;
	}) => Promise<string | undefined> | string | undefined;
}

async function generateStickerImage({
	onProgress,
	prompt,
	referenceFile,
	transparentBackground,
}: {
	onProgress: ({ progress }: { progress: number }) => void;
	prompt: string;
	referenceFile: File | null;
	transparentBackground: boolean;
}): Promise<string> {
	const generationPrompt = buildAIStickerPrompt({
		prompt,
		transparentBackground,
	});
	if (!referenceFile) {
		onProgress({ progress: 18 });
		const result = await generateWithModel("gpt-image-1-5", generationPrompt, {
			imageSize: "1024x1024",
			outputFormat: "png",
			background: transparentBackground ? "transparent" : "opaque",
		});
		if (!result.success || !result.imageUrl) {
			throw new Error(result.error ?? "AI sticker generation failed");
		}
		return result.imageUrl;
	}

	onProgress({ progress: 10 });
	const referenceUrl = await uploadImageToFAL(referenceFile);
	onProgress({ progress: 24 });
	const response = await editImage(
		{
			imageUrl: referenceUrl,
			prompt: generationPrompt,
			model: "gpt-image-1-5-edit",
			imageSize: "1024x1024",
			outputFormat: "png",
			background: transparentBackground ? "transparent" : "opaque",
			inputFidelity: "high",
			quality: "high",
		},
		(status) =>
			onProgress({
				progress: Math.max(24, Math.min(96, status.progress ?? 24)),
			})
	);
	if (response.status !== "completed" || !response.result_url) {
		throw new Error(response.message || "AI sticker edit failed");
	}
	return response.result_url;
}

async function createGeneratedStickerFile({
	imageUrl,
	prompt,
}: {
	imageUrl: string;
	prompt: string;
}): Promise<File> {
	const response = await fetch(imageUrl);
	if (!response.ok) {
		throw new Error(`Generated sticker download failed: ${response.status}`);
	}
	const blob = await response.blob();
	const safeName =
		prompt
			.trim()
			.toLocaleLowerCase()
			.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 48) || "ai-sticker";
	return new File([blob], `${safeName}.png`, { type: "image/png" });
}

export function AIStickerGenerator({
	onAddGeneratedSticker,
}: AIStickerGeneratorProps) {
	const [prompt, setPrompt] = useState("");
	const [referenceFile, setReferenceFile] = useState<File | null>(null);
	const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(
		null
	);
	const [transparentBackground, setTransparentBackground] = useState(true);
	const [history, setHistory] = useState<AIStickerHistoryItem[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const license = useLicenseStore((state) => state.license);
	const checkLicense = useLicenseStore((state) => state.checkLicense);
	const hasCredits = useLicenseStore((state) => state.hasCredits);
	const openBuyCreditsPage = useLicenseStore(
		(state) => state.openBuyCreditsPage
	);
	const trackUsage = useLicenseStore((state) => state.trackUsage);

	useEffect(() => {
		if (!license) void checkLicense();
	}, [checkLicense, license]);

	useEffect(() => {
		if (!referenceFile) {
			setReferencePreviewUrl(null);
			return;
		}
		const objectUrl = URL.createObjectURL(referenceFile);
		setReferencePreviewUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [referenceFile]);

	const handleGenerate = async () => {
		const validationError = validateAIStickerPrompt({ prompt });
		if (validationError) {
			setError(validationError);
			return;
		}
		if (!hasCredits(4)) {
			setError("积分不足");
			openBuyCreditsPage();
			return;
		}

		setError(null);
		setProgress(4);
		setIsGenerating(true);
		try {
			const imageUrl = await generateStickerImage({
				onProgress: ({ progress: nextProgress }) => setProgress(nextProgress),
				prompt,
				referenceFile,
				transparentBackground,
			});
			setHistory((items) =>
				[
					{
						id: crypto.randomUUID(),
						imageUrl,
						prompt: prompt.trim(),
						referenceName: referenceFile?.name,
						transparentBackground,
					},
					...items,
				].slice(0, 18)
			);
			setProgress(100);
			await trackUsage("ai_generation");
		} catch (generationError) {
			setError(
				generationError instanceof Error
					? generationError.message
					: "AI sticker generation failed"
			);
			setProgress(0);
		} finally {
			setIsGenerating(false);
		}
	};

	const handleAdd = async ({ item }: { item: AIStickerHistoryItem }) => {
		try {
			setError(null);
			const file = await createGeneratedStickerFile({
				imageUrl: item.imageUrl,
				prompt: item.prompt,
			});
			await onAddGeneratedSticker({ file });
		} catch (addError) {
			setError(
				addError instanceof Error
					? addError.message
					: "Failed to add generated sticker"
			);
		}
	};

	return (
		<div
			className="h-full overflow-y-auto p-3"
			data-testid="ai-sticker-generator"
		>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<WandSparkles className="size-4 text-cyan-400" aria-hidden="true" />
						<h3 className="text-xs font-semibold">AI 贴纸</h3>
					</div>
					<span className="text-[10px] tabular-nums text-muted-foreground">
						{license?.credits.totalCredits ?? 0} 积分
					</span>
				</div>

				<Textarea
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					placeholder="一只戴耳机的原创小熊，开心挥手"
					aria-label="AI sticker prompt"
					maxLength={500}
					className="min-h-24 resize-none text-xs"
				/>

				<div className="grid grid-cols-[1fr_auto] gap-2">
					<button
						type="button"
						className="relative flex h-20 items-center justify-center overflow-hidden rounded border border-dashed border-border bg-muted/30 hover:bg-muted/50"
						onClick={() => fileInputRef.current?.click()}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
						aria-label="Reference image"
					>
						{referencePreviewUrl ? (
							<img
								src={referencePreviewUrl}
								alt={referenceFile?.name ?? "Reference"}
								className="size-full object-contain"
							/>
						) : (
							<div className="flex items-center gap-2 text-[11px] text-muted-foreground">
								<ImagePlus className="size-4" aria-hidden="true" />
								<span>参考图</span>
							</div>
						)}
					</button>
					{referenceFile && (
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-8"
							onClick={() => setReferenceFile(null)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
							aria-label="Remove reference image"
						>
							<X className="size-4" aria-hidden="true" />
						</Button>
					)}
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					className="hidden"
					onChange={(event) => {
						const file = event.currentTarget.files?.[0] ?? null;
						event.currentTarget.value = "";
						if (file && file.size <= 10 * 1024 * 1024) {
							setReferenceFile(file);
							setError(null);
							return;
						}
						if (file) setError("参考图不能超过 10 MB");
					}}
				/>

				<div className="flex items-center justify-between rounded border border-border/60 px-2.5 py-2">
					<span className="text-[11px]">透明背景</span>
					<Switch
						checked={transparentBackground}
						onCheckedChange={setTransparentBackground}
						aria-label="Transparent background"
					/>
				</div>

				<Button
					type="button"
					className="w-full gap-2"
					disabled={isGenerating || prompt.trim().length < 2}
					onClick={handleGenerate}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					{isGenerating ? (
						<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					) : (
						<WandSparkles className="size-4" aria-hidden="true" />
					)}
					{isGenerating ? "生成中" : "生成贴纸"}
				</Button>
				{isGenerating && <Progress value={progress} className="h-1.5" />}
				{error && (
					<div className="flex items-center justify-between gap-2 rounded border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[10px] text-destructive">
						<span className="min-w-0 flex-1 break-words">{error}</span>
						<Button
							type="button"
							variant="text"
							size="icon"
							className="size-6 shrink-0"
							disabled={isGenerating}
							onClick={handleGenerate}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
							aria-label="Retry generation"
						>
							<RefreshCw className="size-3.5" aria-hidden="true" />
						</Button>
					</div>
				)}
			</div>

			{history.length > 0 && (
				<section className="mt-5 border-t border-border/50 pt-3">
					<div className="mb-2 flex items-center justify-between">
						<h4 className="text-[11px] font-medium">生成历史</h4>
						<Button
							type="button"
							variant="text"
							size="icon"
							className="size-6"
							onClick={() => setHistory([])}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
							aria-label="Clear generation history"
						>
							<Trash2 className="size-3.5" aria-hidden="true" />
						</Button>
					</div>
					<div className="grid grid-cols-3 gap-2">
						{history.map((item) => (
							<div
								key={item.id}
								className="group relative aspect-square overflow-hidden rounded border border-border bg-muted/40"
							>
								<BlobImage
									src={item.imageUrl}
									alt={item.prompt}
									className="size-full object-contain"
								/>
								<Button
									type="button"
									variant="secondary"
									size="icon"
									className="absolute bottom-1 right-1 size-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
									onClick={() => handleAdd({ item })}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.currentTarget.click();
										}
									}}
									aria-label={`Add ${item.prompt}`}
								>
									<Plus className="size-4" aria-hidden="true" />
								</Button>
							</div>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

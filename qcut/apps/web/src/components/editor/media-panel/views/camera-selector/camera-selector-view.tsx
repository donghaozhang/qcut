import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
	APERTURE_OPTIONS,
	CAMERAS,
	FOCAL_LENGTHS,
	LENSES,
	useCameraSelectorStore,
	type ApertureOption,
	type CameraBody,
	type Lens,
} from "@/stores/editor/camera-selector-store";
import { buildCameraPrompt } from "@/lib/ai-models/camera-prompt-builder";
import { FalAiService } from "@/services/ai/fal-ai-service";
import { useAsyncMediaStoreActions } from "@/hooks/media/use-async-media-store";
import { useParams } from "@tanstack/react-router";
import { createObjectURL } from "@/lib/media/blob-manager";
import { ScrollTrack } from "./scroll-track";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ImagePlus } from "lucide-react";

function CameraItem({ cam, selected }: { cam: CameraBody; selected: boolean }) {
	return (
		<>
			<div className="w-[52px] h-[52px] flex items-center justify-center">
				<img
					src={cam.img}
					alt={cam.name}
					loading="lazy"
					className="max-w-full max-h-full object-contain"
				/>
			</div>
			<span className="text-[10px] text-muted-foreground/60 tracking-[0.5px] bg-white/5 px-1.5 py-px rounded">
				{cam.type}
			</span>
			<span
				className={cn(
					"text-xs font-medium transition-colors",
					selected ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{cam.name}
			</span>
		</>
	);
}

function LensItem({ lens, selected }: { lens: Lens; selected: boolean }) {
	return (
		<>
			<div className="w-[52px] h-[52px] flex items-center justify-center">
				<img
					src={lens.img}
					alt={lens.name}
					loading="lazy"
					className="max-w-full max-h-full object-contain"
				/>
			</div>
			<span className="text-[10px] text-muted-foreground/60 tracking-[0.5px] bg-white/5 px-1.5 py-px rounded">
				{lens.type}
			</span>
			<span
				className={cn(
					"text-xs font-medium transition-colors",
					selected ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{lens.name}
			</span>
		</>
	);
}

function FocalItem({ focal, selected }: { focal: number; selected: boolean }) {
	return (
		<>
			<span
				className={cn(
					"text-[28px] font-light leading-tight transition-colors",
					selected ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{focal}
			</span>
			<span className="text-[10px] text-muted-foreground/60">mm</span>
		</>
	);
}

function ApertureItem({
	apt,
	selected,
}: {
	apt: ApertureOption;
	selected: boolean;
}) {
	return (
		<>
			<div className="w-[44px] h-[44px] rounded-full overflow-hidden">
				<img
					src={apt.img}
					alt={apt.label}
					className="w-full h-full object-cover"
				/>
			</div>
			<span
				className={cn(
					"text-xs font-medium transition-colors",
					selected ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{apt.label}
			</span>
		</>
	);
}

function CameraGenerateSection() {
	const { cameraIndex, lensIndex, focalIndex, apertureIndex } =
		useCameraSelectorStore();
	const { addMediaItem } = useAsyncMediaStoreActions();
	const params = useParams({ from: "/editor/$project_id" });
	const projectId = params.project_id;

	const [subject, setSubject] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [addedToMedia, setAddedToMedia] = useState(false);
	const promptRef = useRef("");

	const prompt = buildCameraPrompt({
		cameraIndex,
		lensIndex,
		focalIndex,
		apertureIndex,
		subject,
	});
	promptRef.current = prompt;

	const addToMedia = useCallback(
		async (imageUrl: string, usedPrompt: string) => {
			if (!addMediaItem || !projectId) return;
			try {
				const response = await fetch(imageUrl);
				const blob = await response.blob();
				const file = new File([blob], `camera-gen-${Date.now()}.jpeg`, {
					type: "image/jpeg",
				});
				const blobUrl = createObjectURL(file, "camera-gen-result");

				await addMediaItem(projectId, {
					name: file.name,
					type: "image" as const,
					file,
					url: blobUrl,
					width: 1024,
					height: 1024,
					metadata: { source: "camera_selector", prompt: usedPrompt },
				});
				setAddedToMedia(true);
			} catch (err) {
				console.error("[CameraGenerate] Failed to add to media:", err);
			}
		},
		[addMediaItem, projectId]
	);

	const handleGenerate = useCallback(async () => {
		setIsGenerating(true);
		setError(null);
		setResultUrl(null);
		setAddedToMedia(false);
		const currentPrompt = promptRef.current;

		try {
			const urls = await FalAiService.generateImage(currentPrompt);
			if (urls.length > 0) {
				setResultUrl(urls[0]);
				await addToMedia(urls[0], currentPrompt);
			} else {
				setError("No image was generated. Please try again.");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Generation failed.");
		} finally {
			setIsGenerating(false);
		}
	}, [addToMedia]);

	return {
		subject,
		setSubject,
		isGenerating,
		resultUrl,
		error,
		addedToMedia,
		prompt,
		handleGenerate,
	};
}

export function CameraSelectorView() {
	const {
		cameraIndex,
		lensIndex,
		focalIndex,
		apertureIndex,
		setCameraIndex,
		setLensIndex,
		setFocalIndex,
		setApertureIndex,
	} = useCameraSelectorStore();

	const {
		subject,
		setSubject,
		isGenerating,
		resultUrl,
		error,
		addedToMedia,
		prompt,
		handleGenerate,
	} = CameraGenerateSection();

	const selectedCamera = CAMERAS[cameraIndex];
	const selectedFocal = FOCAL_LENGTHS[focalIndex];

	return (
		<div className="p-4" data-testid="camera-selector-panel">
			{/* Prompt Preview */}
			<p
				className="text-[10px] text-muted-foreground/60 leading-relaxed break-words mb-3"
				data-testid="camera-prompt-preview"
			>
				{prompt}
			</p>

			{/* Generated Result (top) */}
			{resultUrl && (
				<div className="mb-4 space-y-1" data-testid="camera-gen-result">
					<img
						src={resultUrl}
						alt="Generated result"
						className="w-full rounded-lg"
					/>
					{addedToMedia && (
						<p className="text-[10px] text-muted-foreground/60 text-center">
							Added to media library
						</p>
					)}
				</div>
			)}

			{error && (
				<p
					className="text-xs text-destructive mb-3"
					data-testid="camera-gen-error"
				>
					{error}
				</p>
			)}

			{/* Scene + Generate */}
			<Textarea
				id="camera-subject"
				placeholder="Scene description (optional)..."
				value={subject}
				onChange={(e) => setSubject(e.target.value)}
				className="min-h-[36px] text-xs resize-none mb-2"
				maxLength={500}
				data-testid="camera-subject-input"
			/>

			<Button
				className="w-full mb-4"
				disabled={isGenerating}
				onClick={handleGenerate}
				data-testid="camera-generate-btn"
			>
				{isGenerating ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Generating...
					</>
				) : (
					<>
						<ImagePlus className="mr-2 h-4 w-4" />
						Generate with Camera
					</>
				)}
			</Button>

			{/* Current Setup Display */}
			<div className="flex items-center justify-center gap-5 p-4 bg-muted/40 rounded-xl mb-4">
				<div className="w-14 h-14">
					<img
						src={selectedCamera.img}
						alt={selectedCamera.name}
						className="w-full h-full object-contain brightness-[0.85]"
					/>
				</div>
				<span className="text-[42px] font-light text-muted-foreground">
					{selectedFocal}
				</span>
			</div>

			{/* Camera Track */}
			<ScrollTrack
				label="Camera"
				items={CAMERAS}
				selectedIndex={cameraIndex}
				onSelect={setCameraIndex}
				renderItem={(cam, _i, sel) => <CameraItem cam={cam} selected={sel} />}
			/>

			{/* Lens Track */}
			<ScrollTrack
				label="Lens"
				items={LENSES}
				selectedIndex={lensIndex}
				onSelect={setLensIndex}
				renderItem={(lens, _i, sel) => <LensItem lens={lens} selected={sel} />}
			/>

			{/* Focal Length Track */}
			<ScrollTrack
				label="Focal Length"
				items={FOCAL_LENGTHS}
				selectedIndex={focalIndex}
				onSelect={setFocalIndex}
				renderItem={(focal, _i, sel) => (
					<FocalItem focal={focal} selected={sel} />
				)}
			/>

			{/* Aperture Track */}
			<ScrollTrack
				label="Aperture"
				items={APERTURE_OPTIONS}
				selectedIndex={apertureIndex}
				onSelect={setApertureIndex}
				renderItem={(apt, _i, sel) => <ApertureItem apt={apt} selected={sel} />}
			/>
		</div>
	);
}

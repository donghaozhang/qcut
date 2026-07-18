"use client";

import { useState, useRef, useCallback } from "react";

// Constants for file size validation
const MAX_FILE_SIZE_MB = 100;
const HARD_LIMIT_FILE_SIZE_MB = 500;
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { LanguageSelect } from "@/components/captions/language-select";
// REMOVED: UploadProgress component (Gemini migration - no R2 upload needed)
// import { UploadProgress } from "@/components/captions/upload-progress";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import {
	Upload,
	Loader2,
	CheckCircle,
	AlertCircle,
	Plus,
	FileUp,
} from "lucide-react";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { useTranslation } from "@/lib/i18n";
import { cn, openInNewTab } from "@/lib/utils";
import {
	importedCaptionElements,
	importedCaptionResult,
	parseSubtitleFile,
} from "@/lib/captions/caption-import";
import {
	getGeminiSetupUrl,
	getGeminiSetupInstructions,
} from "@/lib/gemini/gemini-utils";
import { useGeminiFileTranscription } from "@/hooks/captions/use-gemini-file-transcription";
import type { TranscriptionResult } from "@/types/captions";
import type { SubtitleStyle } from "@/types/timeline";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useCaptionsStore } from "@/stores/captions-store";
import { CaptionTemplateGallery } from "@/components/captions/caption-template-gallery";
import { LyricsRecognitionCard } from "@/components/captions/lyrics-recognition-card";
import {
	SmartRecognitionCard,
	type SmartRecognitionOutcome,
} from "@/components/captions/smart-recognition-card";
import type { CreateCaptionElement } from "@/types/timeline";
import { CaptionWorkbench } from "./caption-workbench";

interface TranscriptionState {
	isTranscribing: boolean;
	result: TranscriptionResult | null;
	error: string | null;
	currentFile: File | null;
}

/**
 * Render a UI for uploading audio or video, running Gemini transcription, and adding generated captions to the timeline.
 *
 * The component provides language selection, drag-and-drop / file selection, cached results lookup, file validation and size hints, audio extraction for video files, progress and error states, and actions to add transcription segments as caption elements to the timeline store.
 *
 * @returns The rendered React element for the captions transcription panel
 */
export function CaptionsView() {
	const { t } = useTranslation();
	const [selectedLanguage, setSelectedLanguage] = useState("auto");
	const [state, setState] = useState<TranscriptionState>({
		isTranscribing: false,
		result: null,
		error: null,
		currentFile: null,
	});

	const fileInputRef = useRef<HTMLInputElement>(null);
	const subtitleInputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Timeline and captions store hooks
	const { findOrCreateTrack, addElementToTrack, removeTrack, tracks } =
		useTimelineStore();
	const { createCaptionElements } = useCaptionsStore();

	const updateState = useCallback((updates: Partial<TranscriptionState>) => {
		setState((prev) => ({ ...prev, ...updates }));
	}, []);

	const { configured, getCachedTranscription, startTranscription } =
		useGeminiFileTranscription({ selectedLanguage, updateState });

	const addCaptionsToTimeline = useCallback(
		({
			result,
			style,
			elements,
			clearExisting = false,
		}: {
			result: TranscriptionResult;
			style?: SubtitleStyle;
			elements?: CreateCaptionElement[];
			clearExisting?: boolean;
		}) => {
			try {
				const captionElements =
					elements ??
					createCaptionElements(result).map((element) =>
						style ? { ...element, style } : element
					);

				if (captionElements.length === 0) {
					toast.warning(t("captions.panel.noneGenerated"));
					return;
				}

				if (clearExisting) {
					for (const track of tracks) {
						if (track.type === "captions") removeTrack(track.id);
					}
				}

				// Reuse the existing captions track so repeated runs don't stack
				// duplicate tracks.
				const trackId = findOrCreateTrack("captions");

				// Add all caption elements to the track
				for (const captionElement of captionElements) {
					addElementToTrack(trackId, captionElement);
				}

				toast.success(
					t("captions.panel.addedToTimeline", {
						count: captionElements.length,
					})
				);
			} catch (error) {
				handleError(error, {
					operation: "Add Captions to Timeline",
					category: ErrorCategory.MEDIA_PROCESSING,
					severity: ErrorSeverity.HIGH,
					metadata: {
						captionCount: result.segments.length,
						duration: result.segments.at(-1)?.end ?? 0,
					},
				});
			}
		},
		[
			createCaptionElements,
			findOrCreateTrack,
			addElementToTrack,
			removeTrack,
			tracks,
			t,
		]
	);

	const handleSubtitleImport = useCallback(
		async (files: FileList) => {
			const file = files[0];
			if (!file) return;
			const segments = parseSubtitleFile({ content: await file.text() });
			if (segments.length === 0) {
				toast.error(t("captions.panel.importEmpty"));
				return;
			}
			const result = importedCaptionResult({ segments });
			addCaptionsToTimeline({
				result,
				elements: importedCaptionElements({ segments }),
			});
			updateState({ result, error: null });
		},
		[addCaptionsToTimeline, t, updateState]
	);

	const handleSmartRecognitionCompleted = useCallback(
		(outcome: SmartRecognitionOutcome) => {
			addCaptionsToTimeline({
				result: outcome.result,
				elements: outcome.elements,
				clearExisting: outcome.clearExisting,
			});
			// Surface the result in the panel so the workbench can refine it.
			updateState({ result: outcome.result, error: null });
		},
		[addCaptionsToTimeline, updateState]
	);

	const stopTranscription = useCallback(() => {
		updateState({
			isTranscribing: false,
			error: t("captions.panel.cancelledDetail"),
		});
		toast.info(t("captions.panel.cancelled"));
	}, [t, updateState]);

	const handleFileSelect = useCallback(
		(files: FileList) => {
			const file = files[0];
			if (!file) return;

			// Validate file type
			const validTypes = [
				"video/mp4",
				"video/quicktime",
				"video/x-msvideo",
				"video/webm",
				"video/x-matroska", // .mkv
				"audio/mpeg",
				"audio/wav",
				"audio/mp4",
				"audio/x-m4a",
				"audio/webm",
			];
			const isValidType =
				validTypes.includes(file.type) ||
				(file.type === "" &&
					/\.(mp4|mov|avi|webm|mkv|mp3|wav|m4a)$/i.test(file.name));

			if (!isValidType) {
				toast.error(t("captions.panel.invalidType"));
				return;
			}

			// Performance: Check cache first
			const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
			const cachedResult = getCachedTranscription(fileKey);

			if (cachedResult) {
				toast.success(t("captions.panel.cachedFound"));
				setState((prev) => ({ ...prev, result: cachedResult }));
				return;
			}

			// Enhanced file size validation with optimization hints
			const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;
			if (file.size > maxSize) {
				if (file.size > HARD_LIMIT_FILE_SIZE_MB * 1024 * 1024) {
					toast.error(
						`File too large (max ${HARD_LIMIT_FILE_SIZE_MB}MB). Please use a smaller file.`
					);
					return;
				}
				toast.info("Large file detected. This may take longer to process...");
			}

			startTranscription(file, fileKey);
		},
		[getCachedTranscription, startTranscription, t]
	);

	const transcribeFileForWorkbench = useCallback(
		async ({ file }: { file: File }): Promise<TranscriptionResult | null> => {
			const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
			const cachedResult = getCachedTranscription(fileKey);
			if (cachedResult) {
				updateState({
					currentFile: file,
					error: null,
					result: cachedResult,
				});
				return cachedResult;
			}

			return startTranscription(file, fileKey);
		},
		[getCachedTranscription, startTranscription, updateState]
	);

	const { isDragOver, dragProps } = useDragDrop({
		onDrop: (files) => handleFileSelect(files),
	});

	const isProcessing = state.isTranscribing;

	return (
		<div
			className="h-full flex flex-col p-4 space-y-4"
			data-testid="ai-transcription-panel"
		>
			{/* Configuration Warning */}
			{!configured && (
				<div className="space-y-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
					<div className="flex items-center gap-2">
						<AlertCircle className="size-4 text-yellow-500" />
						<p className="text-sm font-medium">
							{t("captions.panel.notConfigured")}
						</p>
					</div>
					<div className="text-xs text-muted-foreground space-y-1">
						<p>{getGeminiSetupInstructions()}</p>
						<a
							href={getGeminiSetupUrl()}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:underline inline-flex items-center gap-1"
						>
							{t("captions.panel.getApiKey")} →
						</a>
					</div>
				</div>
			)}

			{/* Smart recognition on timeline / library media (JianYing-style) */}
			<SmartRecognitionCard onCompleted={handleSmartRecognitionCompleted} />

			{/* Lyrics recognition producing a karaoke caption track */}
			<LyricsRecognitionCard />

			{/* Language Selection */}
			<div className="space-y-2">
				<Label htmlFor="language">{t("captions.panel.language")}</Label>
				<LanguageSelect
					selectedCountry={selectedLanguage}
					onSelect={setSelectedLanguage}
					containerRef={containerRef}
				/>
			</div>

			{/* Upload Area */}
			<div
				ref={containerRef}
				className={cn(
					"relative border-2 border-dashed rounded-lg p-6 transition-colors",
					isDragOver
						? "border-primary bg-primary/5"
						: "border-muted-foreground/25 hover:border-muted-foreground/50",
					isProcessing && "pointer-events-none opacity-50"
				)}
				{...dragProps}
			>
				<div className="text-center space-y-4">
					{!isProcessing && !state.result && (
						<>
							<div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center">
								<Upload className="size-6 text-muted-foreground" />
							</div>
							<div>
								<p className="text-sm font-medium">
									{t("captions.panel.dropHint")}
								</p>
								<p className="text-xs text-muted-foreground">
									{t("captions.panel.dropFormats")}
								</p>
							</div>
							<div className="flex justify-center gap-2">
								<Button
									variant="outline"
									onClick={() => fileInputRef.current?.click()}
									disabled={!configured}
									data-testid="transcription-upload-button"
								>
									<Plus className="size-4 mr-2" />
									{t("captions.panel.chooseFile")}
								</Button>
								<Button
									variant="outline"
									onClick={() => subtitleInputRef.current?.click()}
									data-testid="subtitle-import-button"
								>
									<FileUp className="size-4 mr-2" />
									{t("captions.panel.importSubtitle")}
								</Button>
							</div>
						</>
					)}

					{/* Loading Skeleton for Processing */}
					{isProcessing && !state.result && (
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<Skeleton className="size-12 rounded-full" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-3/4" />
									<Skeleton className="h-3 w-1/2" />
								</div>
							</div>

							<div className="bg-muted/50 rounded-lg p-4 space-y-2">
								<Skeleton className="h-3 w-16" />
								<div className="space-y-2">
									<Skeleton className="h-3 w-full" />
									<Skeleton className="h-3 w-4/5" />
									<Skeleton className="h-3 w-3/4" />
								</div>
							</div>

							<Skeleton className="h-8 w-full" />
						</div>
					)}

					{/* Progress Display */}
					{state.isTranscribing && (
						<div className="space-y-3">
							<div className="flex items-center justify-center gap-2">
								<Loader2 className="size-4 animate-spin" />
								<p className="text-sm font-medium">
									{t("captions.panel.transcribing")}
								</p>
							</div>
							{state.currentFile && (
								<p className="text-xs text-muted-foreground text-center">
									{state.currentFile.name}
								</p>
							)}
							<Button
								variant="outline"
								size="sm"
								onClick={stopTranscription}
								className="w-full"
							>
								{t("captions.panel.cancel")}
							</Button>
						</div>
					)}

					{/* Success State */}
					{state.result && (
						<div className="space-y-3">
							<CheckCircle className="size-8 mx-auto text-green-500" />
							<div>
								<p className="text-sm font-medium">
									{t("captions.panel.complete")}
								</p>
								<p className="text-xs text-muted-foreground">
									{t("captions.panel.foundSegments", {
										count: state.result.segments.length,
									})}
								</p>
							</div>
						</div>
					)}

					{/* Error State with Enhanced UX */}
					{state.error && (
						<div className="space-y-3">
							<AlertCircle className="size-8 mx-auto text-red-500" />
							<div>
								<p className="text-sm font-medium text-red-500">
									{t("captions.panel.failed")}
								</p>
								<p className="text-xs text-muted-foreground">{state.error}</p>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										updateState({ error: null });
										toast.info(t("captions.panel.readyRetry"));
									}}
									className="flex-1"
								>
									{t("captions.panel.tryAgain")}
								</Button>
								{state.error.includes("API key") && (
									<Button
										variant="secondary"
										size="sm"
										onClick={() => openInNewTab(getGeminiSetupUrl())}
									>
										{t("captions.panel.getApiKey")}
									</Button>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Transcription Result */}
			{state.result && (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<Label>{t("captions.panel.result")}</Label>
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								state.result && addCaptionsToTimeline({ result: state.result })
							}
						>
							<Plus className="size-4 mr-2" />
							{t("captions.panel.addToTimeline")}
						</Button>
					</div>

					<ScrollArea className="h-40 w-full border rounded-md p-3">
						<div className="space-y-2">
							{state.result.segments.map((segment) => (
								<div key={segment.id} className="text-sm">
									<div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
										<span>
											{segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s
										</span>
									</div>
									<p>{segment.text}</p>
								</div>
							))}
						</div>
					</ScrollArea>

					<div className="text-xs text-muted-foreground">
						{t("captions.panel.resultMeta", {
							language: state.result.language,
							count: state.result.segments.length,
						})}
					</div>
				</div>
			)}

			<CaptionWorkbench
				result={state.result}
				mediaFile={state.currentFile}
				onAddToTimeline={addCaptionsToTimeline}
				onTranscribeFile={transcribeFileForWorkbench}
			/>

			{/* JianYing-style 字幕模板 gallery backed by the qctext packs */}
			<CaptionTemplateGallery />

			{/* Hidden File Inputs */}
			<input
				ref={fileInputRef}
				type="file"
				className="hidden"
				accept="video/*,audio/*"
				onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
			/>
			<input
				ref={subtitleInputRef}
				type="file"
				className="hidden"
				accept=".srt,.vtt"
				onChange={(e) => {
					if (e.target.files) void handleSubtitleImport(e.target.files);
					e.target.value = "";
				}}
			/>
		</div>
	);
}

"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from "react";
import { platform } from "@qcut/platform-core";
import {
	AlertTriangle,
	Clock,
	Copy,
	Download,
	FileStack,
	ListChecks,
	RefreshCcw,
	Save,
	Scissors,
	Sparkles,
	SplitSquareHorizontal,
	Type,
	Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
	TranscriptionResult,
	TranscriptionSegment,
} from "@/types/captions";
import type { SubtitleStyle } from "@/types/timeline";
import { useCaptionsStore } from "@/stores/captions-store";
import {
	applyCaptionPostProcess,
	applyCaptionRewrites,
	applyBatchReplace,
	CAPTION_STYLE_PRESETS,
	formatClockTime,
	getCaptionTextHighlights,
	getQualityFlags,
	getSegmentConfidence,
	mergeAdjacentSegments,
	parseCaptionRewriteResponse,
	splitSegment,
	transformSegments,
	type CaptionPostProcessAction,
	type CaptionTextTransformOptions,
} from "@/lib/captions/workbench";
import {
	saveCaptions,
	type CaptionFormat,
} from "@/lib/captions/caption-export";
import { cn } from "@/lib/utils";

interface CaptionWorkbenchProps {
	result: TranscriptionResult | null;
	mediaFile: File | null;
	onAddToTimeline: (args: {
		result: TranscriptionResult;
		style: SubtitleStyle;
	}) => void;
	onTranscribeFile: (args: {
		file: File;
	}) => Promise<TranscriptionResult | null>;
}

interface BatchQueueItem {
	id: string;
	file: File;
	name: string;
	size: number;
	status: "queued" | "processing" | "ready" | "failed";
	retries: number;
	trackId?: string;
	segmentCount?: number;
	error?: string;
}

const DEFAULT_TEXT_OPTIONS: CaptionTextTransformOptions = {
	punctuationMode: "keep",
	maxCharsPerLine: 18,
	compressToChars: 42,
	removeFillers: false,
};

const CAPTION_EXPORT_FORMATS: CaptionFormat[] = [
	"srt",
	"vtt",
	"ass",
	"ass-karaoke",
	"txt",
	"timecoded",
];
const HOT_WORDS_STORAGE_KEY = "qcut-caption-hot-words";

export function CaptionWorkbench({
	result,
	mediaFile,
	onAddToTimeline,
	onTranscribeFile,
}: CaptionWorkbenchProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const audioRef = useRef<HTMLAudioElement>(null);
	const batchInputRef = useRef<HTMLInputElement>(null);
	const {
		captionTracks,
		activeCaptionTrack,
		addCaptionTrack,
		updateCaptionTrack,
		setActiveCaptionTrack,
	} = useCaptionsStore();

	const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
		activeCaptionTrack
	);
	const [draftSegments, setDraftSegments] = useState<TranscriptionSegment[]>(
		[]
	);
	const [savedSegments, setSavedSegments] = useState<TranscriptionSegment[]>(
		[]
	);
	const [activeSegmentId, setActiveSegmentId] = useState<number | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [hotWordsText, setHotWordsText] = useState("");
	const [replaceFind, setReplaceFind] = useState("");
	const [replaceWith, setReplaceWith] = useState("");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [textOptions, setTextOptions] =
		useState<CaptionTextTransformOptions>(DEFAULT_TEXT_OPTIONS);
	const [selectedStyleId, setSelectedStyleId] = useState(
		CAPTION_STYLE_PRESETS[0]?.id ?? ""
	);
	const [exportFormat, setExportFormat] = useState<CaptionFormat>("srt");
	const [localizationLanguage, setLocalizationLanguage] = useState("English");
	const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>([]);
	const [isBatchRunning, setIsBatchRunning] = useState(false);
	const [isAiProcessing, setIsAiProcessing] = useState(false);
	const [mediaUrl, setMediaUrl] = useState<string | null>(null);

	const selectedTrack = useMemo(
		() => captionTracks.find((track) => track.id === selectedTrackId),
		[captionTracks, selectedTrackId]
	);

	const selectedPreset = useMemo(
		() =>
			CAPTION_STYLE_PRESETS.find((preset) => preset.id === selectedStyleId) ??
			CAPTION_STYLE_PRESETS[0],
		[selectedStyleId]
	);

	const hotWords = useMemo(
		() =>
			hotWordsText
				.split(/[,，\n]/)
				.map((word) => word.trim())
				.filter((word) => word.length > 0),
		[hotWordsText]
	);

	const qualitySummary = useMemo(() => {
		let dangerCount = 0;
		let warningCount = 0;
		let infoCount = 0;

		for (const segment of draftSegments) {
			const flags = getQualityFlags({ segment, hotWords });
			for (const flag of flags) {
				if (flag.severity === "danger") dangerCount += 1;
				if (flag.severity === "warning") warningCount += 1;
				if (flag.severity === "info") infoCount += 1;
			}
		}

		return { dangerCount, warningCount, infoCount };
	}, [draftSegments, hotWords]);

	const duration = useMemo(
		() => Math.max(...draftSegments.map((segment) => segment.end), 0),
		[draftSegments]
	);

	const hasUnsavedChanges = useMemo(
		() => JSON.stringify(draftSegments) !== JSON.stringify(savedSegments),
		[draftSegments, savedSegments]
	);

	useEffect(() => {
		if (!mediaFile) {
			setMediaUrl(null);
			return;
		}

		const nextUrl = URL.createObjectURL(mediaFile);
		setMediaUrl(nextUrl);
		return () => URL.revokeObjectURL(nextUrl);
	}, [mediaFile]);

	useEffect(() => {
		const storedHotWords = localStorage.getItem(HOT_WORDS_STORAGE_KEY);
		if (storedHotWords) setHotWordsText(storedHotWords);
	}, []);

	useEffect(() => {
		localStorage.setItem(HOT_WORDS_STORAGE_KEY, hotWordsText);
	}, [hotWordsText]);

	useEffect(() => {
		if (activeCaptionTrack) setSelectedTrackId(activeCaptionTrack);
	}, [activeCaptionTrack]);

	useEffect(() => {
		if (selectedTrack) {
			setDraftSegments(selectedTrack.segments);
			setSavedSegments(selectedTrack.segments);
			setActiveSegmentId(selectedTrack.segments[0]?.id ?? null);
			return;
		}

		if (result) {
			setDraftSegments(result.segments);
			setSavedSegments(result.segments);
			setActiveSegmentId(result.segments[0]?.id ?? null);
		}
	}, [selectedTrack, result]);

	useEffect(() => {
		const activeSegment = draftSegments.find(
			(segment) => currentTime >= segment.start && currentTime <= segment.end
		);
		if (activeSegment) setActiveSegmentId(activeSegment.id);
	}, [currentTime, draftSegments]);

	const currentResult = useMemo<TranscriptionResult>(
		() => ({
			text: draftSegments.map((segment) => segment.text).join(" "),
			segments: draftSegments,
			language: selectedTrack?.language ?? result?.language ?? "auto",
		}),
		[draftSegments, result?.language, selectedTrack?.language]
	);

	const jumpToSegment = useCallback(
		({ segment }: { segment: TranscriptionSegment }) => {
			setActiveSegmentId(segment.id);
			setCurrentTime(segment.start);
			if (videoRef.current) videoRef.current.currentTime = segment.start;
			if (audioRef.current) audioRef.current.currentTime = segment.start;
		},
		[]
	);

	const updateSegment = useCallback(
		({
			segmentId,
			updates,
		}: {
			segmentId: number;
			updates: Partial<TranscriptionSegment>;
		}) => {
			setDraftSegments((segments) =>
				segments.map((segment) =>
					segment.id === segmentId ? { ...segment, ...updates } : segment
				)
			);
		},
		[]
	);

	const saveDraft = useCallback(() => {
		if (draftSegments.length === 0) return;

		if (selectedTrackId) {
			updateCaptionTrack(selectedTrackId, { segments: draftSegments });
			setSavedSegments(draftSegments);
			toast.success("Caption workbench saved");
			return;
		}

		const trackId = addCaptionTrack({
			name: `Workbench captions (${currentResult.language})`,
			language: currentResult.language,
			segments: draftSegments,
			isActive: true,
			source: "transcription",
		});
		setSelectedTrackId(trackId);
		setActiveCaptionTrack(trackId);
		setSavedSegments(draftSegments);
		toast.success("Caption track created");
	}, [
		addCaptionTrack,
		currentResult.language,
		draftSegments,
		selectedTrackId,
		setActiveCaptionTrack,
		updateCaptionTrack,
	]);

	const undoDraft = useCallback(() => {
		setDraftSegments(savedSegments);
		toast.info("Restored last saved captions");
	}, [savedSegments]);

	const applyReplace = useCallback(() => {
		setDraftSegments((segments) =>
			applyBatchReplace({
				segments,
				rule: {
					find: replaceFind,
					replace: replaceWith,
					caseSensitive,
				},
			})
		);
	}, [caseSensitive, replaceFind, replaceWith]);

	const applyTextTransform = useCallback(() => {
		setDraftSegments((segments) =>
			transformSegments({ segments, options: textOptions })
		);
	}, [textOptions]);

	const createBilingualTrack = useCallback(() => {
		if (draftSegments.length === 0) return;

		const trackId = addCaptionTrack({
			name: "Bilingual draft",
			language: `${currentResult.language}+translation`,
			segments: draftSegments.map((segment) => ({
				...segment,
				text: `${segment.text}\n${segment.text}`,
			})),
			isActive: true,
			source: "manual",
		});
		setSelectedTrackId(trackId);
		setActiveCaptionTrack(trackId);
		toast.success("Bilingual caption track created");
	}, [
		addCaptionTrack,
		currentResult.language,
		draftSegments,
		setActiveCaptionTrack,
	]);

	const exportDraft = useCallback(async () => {
		if (draftSegments.length === 0) return;

		try {
			await saveCaptions(draftSegments, exportFormat, "qcut-captions", {
				language: currentResult.language,
			});
			toast.success(`Exported ${exportFormat.toUpperCase()} captions`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Caption export failed";
			toast.error(message);
		}
	}, [currentResult.language, draftSegments, exportFormat]);

	const runRemoteRewrite = useCallback(
		async ({
			action,
		}: {
			action: Extract<CaptionPostProcessAction, "polish" | "localize">;
		}) => {
			const prompt = buildCaptionRewritePrompt({
				action,
				hotWords,
				segments: draftSegments,
				targetLanguage: localizationLanguage,
			});
			let streamedText = "";

			await new Promise<void>((resolve, reject) => {
				platform().geminiChat.removeListeners();
				platform().geminiChat.onStreamChunk((data) => {
					streamedText += data.text;
				});
				platform().geminiChat.onStreamComplete(() => resolve());
				platform().geminiChat.onStreamError((data) =>
					reject(new Error(data.message))
				);
				void platform()
					.geminiChat.send({
						messages: [{ role: "user", content: prompt }],
					})
					.then((response) => {
						if (!response.success) {
							reject(new Error(response.error || "Gemini rewrite failed"));
						}
					})
					.catch((error) => reject(error));
			});

			return applyCaptionRewrites({
				segments: draftSegments,
				rewrites: parseCaptionRewriteResponse({ content: streamedText }),
			});
		},
		[draftSegments, hotWords, localizationLanguage]
	);

	const runPostProcess = useCallback(
		async ({ action }: { action: CaptionPostProcessAction }) => {
			if (draftSegments.length === 0) return;

			setIsAiProcessing(true);
			let postProcessResult;
			try {
				postProcessResult =
					action === "polish" || action === "localize"
						? await runRemoteRewrite({ action })
						: applyCaptionPostProcess({
								action,
								segments: draftSegments,
								targetLanguage: localizationLanguage,
							});
			} catch (error) {
				postProcessResult = applyCaptionPostProcess({
					action,
					segments: draftSegments,
					targetLanguage: localizationLanguage,
				});
				const message =
					error instanceof Error ? error.message : "Gemini rewrite failed";
				toast.warning(`Using local fallback: ${message}`);
			} finally {
				setIsAiProcessing(false);
			}

			setDraftSegments(postProcessResult.segments);
			if (action === "highlight-quotes") {
				setSelectedStyleId("knowledge-highlight");
			}

			toast.success(
				`Updated ${postProcessResult.changedCount} caption segments`
			);
		},
		[draftSegments, localizationLanguage, runRemoteRewrite]
	);

	const handleBatchFiles = useCallback(({ files }: { files: FileList }) => {
		const queuedItems: BatchQueueItem[] = [];
		for (const file of Array.from(files)) {
			queuedItems.push({
				id: `${file.name}-${file.size}-${file.lastModified}`,
				file,
				name: file.name,
				size: file.size,
				status: "queued",
				retries: 0,
			});
		}
		setBatchQueue((queue) => [...queue, ...queuedItems]);
	}, []);

	const processBatchItem = useCallback(
		async ({ item }: { item: BatchQueueItem }) => {
			setBatchQueue((queue) =>
				queue.map((queuedItem) =>
					queuedItem.id === item.id
						? { ...queuedItem, status: "processing", error: undefined }
						: queuedItem
				)
			);

			try {
				const transcriptionResult = await onTranscribeFile({ file: item.file });
				if (!transcriptionResult) {
					throw new Error("No transcription result returned");
				}

				const trackId = addCaptionTrack({
					name: `${item.name} captions`,
					language: transcriptionResult.language,
					segments: transcriptionResult.segments,
					isActive: false,
					source: "transcription",
				});

				setBatchQueue((queue) =>
					queue.map((queuedItem) =>
						queuedItem.id === item.id
							? {
									...queuedItem,
									status: "ready",
									trackId,
									segmentCount: transcriptionResult.segments.length,
									error: undefined,
								}
							: queuedItem
					)
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Batch transcription failed";
				setBatchQueue((queue) =>
					queue.map((queuedItem) =>
						queuedItem.id === item.id
							? {
									...queuedItem,
									status: "failed",
									retries: queuedItem.retries + 1,
									error: message,
								}
							: queuedItem
					)
				);
			}
		},
		[addCaptionTrack, onTranscribeFile]
	);

	const runBatchQueue = useCallback(() => {
		const runnableItems = batchQueue.filter(
			(item) => item.status === "queued" || item.status === "failed"
		);
		if (runnableItems.length === 0) return;

		setIsBatchRunning(true);
		void runnableItems
			.reduce(
				(chain, item) => chain.then(() => processBatchItem({ item })),
				Promise.resolve()
			)
			.finally(() => {
				setIsBatchRunning(false);
				toast.success("Batch transcription queue finished");
			});
	}, [batchQueue, processBatchItem]);

	const retryFailedBatchItems = useCallback(() => {
		setBatchQueue((queue) =>
			queue.map((item) =>
				item.status === "failed"
					? { ...item, status: "queued", error: undefined }
					: item
			)
		);
	}, []);

	const clearCompletedBatchItems = useCallback(() => {
		setBatchQueue((queue) => queue.filter((item) => item.status !== "ready"));
	}, []);

	const localizeReadyBatchTracks = useCallback(() => {
		let localizedCount = 0;
		for (const item of batchQueue) {
			if (item.status !== "ready" || !item.trackId) continue;
			const track = captionTracks.find(
				(candidate) => candidate.id === item.trackId
			);
			if (!track) continue;

			const result = applyCaptionPostProcess({
				action: "localize",
				segments: track.segments,
				targetLanguage: localizationLanguage,
			});

			addCaptionTrack({
				name: `${track.name} (${localizationLanguage})`,
				language: localizationLanguage,
				segments: result.segments,
				isActive: false,
				source: "manual",
			});
			localizedCount += 1;
		}

		toast.success(`Created ${localizedCount} localized batch tracks`);
	}, [addCaptionTrack, batchQueue, captionTracks, localizationLanguage]);

	const addReadyBatchTracksToTimeline = useCallback(() => {
		if (!selectedPreset) return;

		let addedCount = 0;
		for (const item of batchQueue) {
			if (item.status !== "ready" || !item.trackId) continue;
			const track = captionTracks.find(
				(candidate) => candidate.id === item.trackId
			);
			if (!track) continue;

			onAddToTimeline({
				result: {
					text: track.segments.map((segment) => segment.text).join(" "),
					segments: track.segments,
					language: track.language,
				},
				style: selectedPreset.style,
			});
			addedCount += 1;
		}

		toast.success(`Added ${addedCount} styled batch tracks to timeline`);
	}, [batchQueue, captionTracks, onAddToTimeline, selectedPreset]);

	const activeSegment = draftSegments.find(
		(segment) => segment.id === activeSegmentId
	);

	if (!result && captionTracks.length === 0) return null;

	return (
		<div
			className="min-h-0 space-y-3 border-t pt-4"
			data-testid="caption-workbench"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<Label className="text-sm font-semibold">Caption Workbench</Label>
					<div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
						<span>{draftSegments.length} segments</span>
						<span>{formatClockTime({ seconds: duration })}</span>
						{hasUnsavedChanges && (
							<span className="text-amber-500">Unsaved</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={undoDraft}
						disabled={!hasUnsavedChanges}
					>
						<RefreshCcw className="mr-2 size-4" />
						Undo
					</Button>
					<Button type="button" size="sm" onClick={saveDraft}>
						<Save className="mr-2 size-4" />
						Save
					</Button>
				</div>
			</div>

			<div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
				<div className="space-y-3">
					<PreviewLinkage
						activeSegment={activeSegment}
						currentTime={currentTime}
						duration={duration}
						mediaFile={mediaFile}
						mediaUrl={mediaUrl}
						onTimeChange={setCurrentTime}
						videoRef={videoRef}
						audioRef={audioRef}
					/>
					<SegmentWaveform
						activeSegmentId={activeSegmentId}
						duration={duration}
						segments={draftSegments}
						onSelectSegment={jumpToSegment}
					/>
				</div>

				<div className="space-y-2 rounded-md border p-3">
					<Label className="text-xs">Caption Tracks</Label>
					<Select
						value={selectedTrackId ?? "latest"}
						onValueChange={(value) => {
							const nextTrackId = value === "latest" ? null : value;
							setSelectedTrackId(nextTrackId);
							setActiveCaptionTrack(nextTrackId);
						}}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select track" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="latest">Latest transcription</SelectItem>
							{captionTracks.map((track) => (
								<SelectItem key={track.id} value={track.id}>
									{track.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="w-full"
						onClick={createBilingualTrack}
					>
						<Copy className="mr-2 size-4" />
						Bilingual Track
					</Button>
				</div>
			</div>

			<Tabs defaultValue="edit" className="min-h-0">
				<TabsList className="grid h-auto w-full grid-cols-4 xl:grid-cols-7">
					<TabsTrigger value="edit">Edit</TabsTrigger>
					<TabsTrigger value="quality">Quality</TabsTrigger>
					<TabsTrigger value="tools">Tools</TabsTrigger>
					<TabsTrigger value="style">Style</TabsTrigger>
					<TabsTrigger value="export">Export</TabsTrigger>
					<TabsTrigger value="ai">AI</TabsTrigger>
					<TabsTrigger value="batch">Batch</TabsTrigger>
				</TabsList>

				<TabsContent value="edit">
					<ScrollArea className="h-80 rounded-md border">
						<div className="divide-y">
							{draftSegments.map((segment) => (
								<SegmentEditor
									key={segment.id}
									hotWords={hotWords}
									isActive={segment.id === activeSegmentId}
									segment={segment}
									onChangeSegment={updateSegment}
									onJumpToSegment={jumpToSegment}
									onMergeSegment={({ segmentId }) =>
										setDraftSegments((segments) =>
											mergeAdjacentSegments({ segments, segmentId })
										)
									}
									onSplitSegment={({ segmentId }) =>
										setDraftSegments((segments) =>
											splitSegment({ segments, segmentId })
										)
									}
								/>
							))}
						</div>
					</ScrollArea>
				</TabsContent>

				<TabsContent value="quality">
					<div className="space-y-3 rounded-md border p-3">
						<div className="grid grid-cols-3 gap-2">
							<MetricTile label="Danger" value={qualitySummary.dangerCount} />
							<MetricTile label="Warning" value={qualitySummary.warningCount} />
							<MetricTile label="Review" value={qualitySummary.infoCount} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="caption-hotwords">Hot words / names</Label>
							<Textarea
								id="caption-hotwords"
								value={hotWordsText}
								onChange={(event) => setHotWordsText(event.target.value)}
								placeholder="QCut, Peter, product names..."
								className="min-h-20"
							/>
						</div>
						<ScrollArea className="h-48 rounded-md border">
							<div className="divide-y">
								{draftSegments.map((segment) => (
									<QualityRow
										key={segment.id}
										hotWords={hotWords}
										segment={segment}
										onJumpToSegment={jumpToSegment}
									/>
								))}
							</div>
						</ScrollArea>
					</div>
				</TabsContent>

				<TabsContent value="tools">
					<div className="grid gap-3 xl:grid-cols-2">
						<div className="space-y-3 rounded-md border p-3">
							<div className="flex items-center gap-2">
								<ListChecks className="size-4 text-muted-foreground" />
								<Label>Batch Replace</Label>
							</div>
							<Input
								value={replaceFind}
								onChange={(event) => setReplaceFind(event.target.value)}
								placeholder="Find"
							/>
							<Input
								value={replaceWith}
								onChange={(event) => setReplaceWith(event.target.value)}
								placeholder="Replace with"
							/>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox
									checked={caseSensitive}
									onCheckedChange={(checked) =>
										setCaseSensitive(checked === true)
									}
								/>
								Case sensitive
							</label>
							<Button type="button" onClick={applyReplace} className="w-full">
								<Wand2 className="mr-2 size-4" />
								Replace All
							</Button>
						</div>

						<div className="space-y-3 rounded-md border p-3">
							<div className="flex items-center gap-2">
								<Type className="size-4 text-muted-foreground" />
								<Label>Text Rules</Label>
							</div>
							<Select
								value={textOptions.punctuationMode}
								onValueChange={(value) =>
									setTextOptions((options) => ({
										...options,
										punctuationMode:
											value as CaptionTextTransformOptions["punctuationMode"],
									}))
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="keep">Keep punctuation</SelectItem>
									<SelectItem value="remove-end">
										Remove end punctuation
									</SelectItem>
									<SelectItem value="add-periods">
										Add sentence endings
									</SelectItem>
								</SelectContent>
							</Select>
							<NumberField
								label="Max chars per line"
								value={textOptions.maxCharsPerLine}
								onChange={(value) =>
									setTextOptions((options) => ({
										...options,
										maxCharsPerLine: value,
									}))
								}
							/>
							<NumberField
								label="Compress to chars"
								value={textOptions.compressToChars}
								onChange={(value) =>
									setTextOptions((options) => ({
										...options,
										compressToChars: value,
									}))
								}
							/>
							<label className="flex items-center gap-2 text-sm">
								<Checkbox
									checked={textOptions.removeFillers}
									onCheckedChange={(checked) =>
										setTextOptions((options) => ({
											...options,
											removeFillers: checked === true,
										}))
									}
								/>
								Remove filler words
							</label>
							<Button
								type="button"
								onClick={applyTextTransform}
								className="w-full"
							>
								<Sparkles className="mr-2 size-4" />
								Apply Rules
							</Button>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="style">
					<div className="grid gap-3 xl:grid-cols-2">
						{CAPTION_STYLE_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								onClick={() => setSelectedStyleId(preset.id)}
								className={cn(
									"rounded-md border p-3 text-left transition-colors hover:bg-muted",
									preset.id === selectedStyleId && "border-primary bg-primary/5"
								)}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-medium text-sm">{preset.name}</span>
									<Badge variant="outline">{preset.platform}</Badge>
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									{preset.description}
								</p>
							</button>
						))}
					</div>
					<Button
						type="button"
						className="mt-3 w-full"
						onClick={() =>
							selectedPreset &&
							onAddToTimeline({
								result: currentResult,
								style: selectedPreset.style,
							})
						}
					>
						<SplitSquareHorizontal className="mr-2 size-4" />
						Add Styled Captions to Timeline
					</Button>
				</TabsContent>

				<TabsContent value="export">
					<div className="space-y-3 rounded-md border p-3">
						<Select
							value={exportFormat}
							onValueChange={(value) => setExportFormat(value as CaptionFormat)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CAPTION_EXPORT_FORMATS.map((format) => (
									<SelectItem key={format} value={format}>
										{format.toUpperCase()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
							<div className="rounded-md border p-2">
								Burn-in: timeline export
							</div>
							<div className="rounded-md border p-2">Sidecar: file export</div>
							<div className="rounded-md border p-2">Douyin / Xiaohongshu</div>
							<div className="rounded-md border p-2">
								Bilibili / YouTube Shorts
							</div>
						</div>
						<Button type="button" onClick={exportDraft} className="w-full">
							<Download className="mr-2 size-4" />
							Export Captions
						</Button>
					</div>
				</TabsContent>

				<TabsContent value="ai">
					<div className="space-y-3 rounded-md border p-3 text-sm">
						<div className="grid gap-2 xl:grid-cols-2">
							<AiAction
								label="Polish spoken subtitles"
								disabled={isAiProcessing}
								onClick={() => runPostProcess({ action: "polish" })}
							/>
							<AiAction
								label="Re-segment for rhythm"
								disabled={isAiProcessing}
								onClick={() => runPostProcess({ action: "resegment" })}
							/>
							<AiAction
								label="Highlight quotable moments"
								disabled={isAiProcessing}
								onClick={() => runPostProcess({ action: "highlight-quotes" })}
							/>
							<AiAction
								label="Remove filler words"
								disabled={isAiProcessing}
								onClick={() => runPostProcess({ action: "remove-fillers" })}
							/>
						</div>
						<div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
							<Input
								value={localizationLanguage}
								onChange={(event) =>
									setLocalizationLanguage(event.target.value)
								}
								placeholder="Target language"
							/>
							<Button
								type="button"
								variant="outline"
								disabled={isAiProcessing}
								onClick={() => runPostProcess({ action: "localize" })}
							>
								<Sparkles className="mr-2 size-4" />
								Create Localization Draft
							</Button>
						</div>
					</div>
				</TabsContent>

				<TabsContent value="batch">
					<div className="space-y-3 rounded-md border p-3">
						<input
							ref={batchInputRef}
							type="file"
							multiple
							className="hidden"
							accept="video/*,audio/*"
							onChange={(event) =>
								event.target.files &&
								handleBatchFiles({ files: event.target.files })
							}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => batchInputRef.current?.click()}
							className="w-full"
						>
							<FileStack className="mr-2 size-4" />
							Add Batch Files
						</Button>
						<div className="grid grid-cols-3 gap-2">
							<Button
								type="button"
								onClick={runBatchQueue}
								disabled={isBatchRunning || batchQueue.length === 0}
							>
								<Sparkles className="mr-2 size-4" />
								Run Queue
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={retryFailedBatchItems}
								disabled={isBatchRunning}
							>
								<RefreshCcw className="mr-2 size-4" />
								Retry Failed
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={clearCompletedBatchItems}
								disabled={isBatchRunning}
							>
								Clear Ready
							</Button>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={localizeReadyBatchTracks}
								disabled={isBatchRunning || batchQueue.length === 0}
							>
								<Sparkles className="mr-2 size-4" />
								Localize Ready
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={addReadyBatchTracksToTimeline}
								disabled={isBatchRunning || batchQueue.length === 0}
							>
								<SplitSquareHorizontal className="mr-2 size-4" />
								Add Styled Ready
							</Button>
						</div>
						<div className="grid grid-cols-3 gap-2 text-xs">
							<MetricTile label="Queued" value={batchQueue.length} />
							<MetricTile
								label="Retries"
								value={batchQueue.reduce((sum, item) => sum + item.retries, 0)}
							/>
							<MetricTile label="Est. credits" value={batchQueue.length * 10} />
						</div>
						<ScrollArea className="h-36 rounded-md border">
							<div className="divide-y">
								{batchQueue.map((item) => (
									<div
										key={item.id}
										className="flex items-center justify-between gap-3 p-2 text-sm"
									>
										<span className="truncate">{item.name}</span>
										<div className="flex shrink-0 items-center gap-2">
											{item.segmentCount !== undefined && (
												<span className="text-xs text-muted-foreground">
													{item.segmentCount} segments
												</span>
											)}
											<Badge
												variant={
													item.status === "failed" ? "destructive" : "secondary"
												}
											>
												{item.status}
											</Badge>
										</div>
									</div>
								))}
								{batchQueue.length === 0 && (
									<p className="p-3 text-sm text-muted-foreground">
										No batch files queued
									</p>
								)}
							</div>
						</ScrollArea>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}

function PreviewLinkage({
	activeSegment,
	currentTime,
	duration,
	mediaFile,
	mediaUrl,
	onTimeChange,
	videoRef,
	audioRef,
}: {
	activeSegment?: TranscriptionSegment;
	currentTime: number;
	duration: number;
	mediaFile: File | null;
	mediaUrl: string | null;
	onTimeChange: (time: number) => void;
	videoRef: RefObject<HTMLVideoElement | null>;
	audioRef: RefObject<HTMLAudioElement | null>;
}) {
	const isVideo = mediaFile?.type.startsWith("video/");
	const isAudio = mediaFile?.type.startsWith("audio/");

	return (
		<div className="relative overflow-hidden rounded-md border bg-black">
			<div className="aspect-video">
				{isVideo && mediaUrl && (
					<video
						ref={videoRef}
						src={mediaUrl}
						controls
						className="h-full w-full"
						onTimeUpdate={(event) =>
							onTimeChange(event.currentTarget.currentTime)
						}
					/>
				)}
				{isAudio && mediaUrl && (
					<div className="flex h-full items-center justify-center p-4">
						<audio
							ref={audioRef}
							src={mediaUrl}
							controls
							className="w-full"
							onTimeUpdate={(event) =>
								onTimeChange(event.currentTarget.currentTime)
							}
						/>
					</div>
				)}
				{!mediaUrl && (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						Video preview links after a media file is transcribed
					</div>
				)}
			</div>
			<div className="pointer-events-none absolute inset-x-4 bottom-4 text-center">
				<div className="inline-block max-w-full rounded bg-black/70 px-3 py-2 text-xl font-bold text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.85)]">
					{activeSegment?.text ?? " "}
				</div>
			</div>
			<div className="absolute left-3 top-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
				{formatClockTime({ seconds: currentTime })} /{" "}
				{formatClockTime({ seconds: duration })}
			</div>
		</div>
	);
}

function SegmentWaveform({
	activeSegmentId,
	duration,
	segments,
	onSelectSegment,
}: {
	activeSegmentId: number | null;
	duration: number;
	segments: TranscriptionSegment[];
	onSelectSegment: (args: { segment: TranscriptionSegment }) => void;
}) {
	return (
		<div className="flex h-16 items-end gap-1 rounded-md border p-2">
			{segments.map((segment) => {
				const confidence = getSegmentConfidence({ segment });
				const width = `${Math.max(2, ((segment.end - segment.start) / Math.max(duration, 1)) * 100)}%`;
				return (
					<button
						key={segment.id}
						type="button"
						title={`${formatClockTime({ seconds: segment.start })} ${segment.text}`}
						onClick={() => onSelectSegment({ segment })}
						className={cn(
							"min-w-1 rounded-t bg-cyan-500/70 transition-colors hover:bg-cyan-400",
							confidence < 0.72 && "bg-amber-500/80",
							segment.id === activeSegmentId && "bg-primary"
						)}
						style={{
							width,
							height: `${Math.max(18, confidence * 52)}px`,
						}}
					/>
				);
			})}
		</div>
	);
}

function SegmentEditor({
	hotWords,
	isActive,
	segment,
	onChangeSegment,
	onJumpToSegment,
	onMergeSegment,
	onSplitSegment,
}: {
	hotWords: string[];
	isActive: boolean;
	segment: TranscriptionSegment;
	onChangeSegment: (args: {
		segmentId: number;
		updates: Partial<TranscriptionSegment>;
	}) => void;
	onJumpToSegment: (args: { segment: TranscriptionSegment }) => void;
	onMergeSegment: (args: { segmentId: number }) => void;
	onSplitSegment: (args: { segmentId: number }) => void;
}) {
	const flags = getQualityFlags({ segment, hotWords });
	const confidence = Math.round(getSegmentConfidence({ segment }) * 100);

	return (
		<div className={cn("space-y-2 p-3", isActive && "bg-primary/5")}>
			<div className="flex items-center justify-between gap-2">
				<button
					type="button"
					onClick={() => onJumpToSegment({ segment })}
					className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
				>
					<Clock className="size-3.5" />
					{formatClockTime({ seconds: segment.start })} -{" "}
					{formatClockTime({ seconds: segment.end })}
				</button>
				<div className="flex items-center gap-1">
					<Badge variant={confidence < 72 ? "destructive" : "secondary"}>
						{confidence}%
					</Badge>
					{flags.map((flag) => (
						<Badge
							key={flag.id}
							variant={flag.severity === "danger" ? "destructive" : "outline"}
						>
							{flag.label}
						</Badge>
					))}
				</div>
			</div>

			<Textarea
				value={segment.text}
				autoResize
				onChange={(event) =>
					onChangeSegment({
						segmentId: segment.id,
						updates: { text: event.target.value },
					})
				}
				className="min-h-16 resize-none"
			/>

			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Start"
					value={segment.start}
					step={0.05}
					onChange={(value) =>
						onChangeSegment({
							segmentId: segment.id,
							updates: { start: value, seek: value * 1000 },
						})
					}
				/>
				<NumberField
					label="End"
					value={segment.end}
					step={0.05}
					onChange={(value) =>
						onChangeSegment({
							segmentId: segment.id,
							updates: { end: value },
						})
					}
				/>
			</div>

			<div className="flex gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onSplitSegment({ segmentId: segment.id })}
				>
					<Scissors className="mr-2 size-4" />
					Split
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onMergeSegment({ segmentId: segment.id })}
				>
					<SplitSquareHorizontal className="mr-2 size-4" />
					Merge Next
				</Button>
			</div>
		</div>
	);
}

function QualityRow({
	hotWords,
	segment,
	onJumpToSegment,
}: {
	hotWords: string[];
	segment: TranscriptionSegment;
	onJumpToSegment: (args: { segment: TranscriptionSegment }) => void;
}) {
	const flags = getQualityFlags({ segment, hotWords });
	const confidence = Math.round(getSegmentConfidence({ segment }) * 100);

	return (
		<button
			type="button"
			onClick={() => onJumpToSegment({ segment })}
			className="w-full p-3 text-left hover:bg-muted"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0 text-sm">
					<HighlightedText text={segment.text} hotWords={hotWords} />
				</div>
				<Badge variant={confidence < 72 ? "destructive" : "secondary"}>
					{confidence}%
				</Badge>
			</div>
			<div className="mt-2 flex flex-wrap gap-1">
				{flags.map((flag) => (
					<Badge
						key={flag.id}
						variant={flag.severity === "danger" ? "destructive" : "outline"}
					>
						{flag.label}
					</Badge>
				))}
				{flags.length === 0 && (
					<span className="text-xs text-muted-foreground">Looks clean</span>
				)}
			</div>
		</button>
	);
}

function HighlightedText({
	hotWords,
	text,
}: {
	hotWords: string[];
	text: string;
}) {
	const parts = getCaptionTextHighlights({ hotWords, text });

	return (
		<span>
			{parts.map((part, index) => (
				<mark
					key={`${part.text}-${index}`}
					className={cn(
						"bg-transparent text-inherit",
						part.kind === "hotword" &&
							"rounded bg-cyan-500/20 px-1 text-cyan-200",
						part.kind === "suspicious" &&
							"rounded bg-amber-500/25 px-1 text-amber-100 underline decoration-amber-300 decoration-wavy",
						part.kind === "filler" &&
							"rounded bg-rose-500/20 px-1 text-rose-100 line-through decoration-rose-300"
					)}
				>
					{part.text}
				</mark>
			))}
		</span>
	);
}

function NumberField({
	label,
	onChange,
	step = 1,
	value,
}: {
	label: string;
	onChange: (value: number) => void;
	step?: number;
	value: number;
}) {
	return (
		<label className="space-y-1 text-xs text-muted-foreground">
			<span>{label}</span>
			<Input
				type="number"
				value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
				step={step}
				onChange={(event) => onChange(Number(event.target.value))}
				className="h-8"
			/>
		</label>
	);
}

function MetricTile({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border p-2 text-center">
			<div className="text-lg font-semibold">{value}</div>
			<div className="text-xs text-muted-foreground">{label}</div>
		</div>
	);
}

function AiAction({
	disabled = false,
	label,
	onClick,
}: {
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="outline"
			className="justify-start"
			disabled={disabled}
			onClick={onClick}
		>
			<AlertTriangle className="mr-2 size-4" />
			{label}
		</Button>
	);
}

function buildCaptionRewritePrompt({
	action,
	hotWords,
	segments,
	targetLanguage,
}: {
	action: Extract<CaptionPostProcessAction, "polish" | "localize">;
	hotWords: string[];
	segments: TranscriptionSegment[];
	targetLanguage: string;
}): string {
	const instruction =
		action === "localize"
			? `Translate and localize each subtitle into ${targetLanguage}. Preserve names, brands, timing ids, and concise subtitle rhythm.`
			: "Polish each subtitle for spoken-video readability. Fix obvious recognition errors, remove disfluency, preserve meaning, and keep each line concise.";
	const payload = segments.map((segment) => ({
		id: segment.id,
		text: segment.text,
	}));

	return [
		instruction,
		`Protected terms: ${hotWords.length > 0 ? hotWords.join(", ") : "none"}.`,
		'Return only a JSON array. Each item must be {"id": number, "text": string}. Do not include markdown.',
		JSON.stringify(payload),
	].join("\n\n");
}

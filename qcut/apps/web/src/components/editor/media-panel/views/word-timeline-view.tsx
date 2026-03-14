"use client";

import { platform } from "@qcut/platform-core";

/**
 * Word Timeline View Component
 *
 * Displays word-level transcription data from JSON files or transcribed media.
 * Features:
 * - Drag & drop JSON file import
 * - Drag & drop video/audio for transcription (ElevenLabs Scribe v2)
 * - Click word to seek timeline to that timestamp
 * - Toggle word deletion (red color + strikethrough)
 * - Tooltip showing word timing on hover
 *
 * @module components/editor/media-panel/views/word-timeline-view
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useProjectStore } from "@/stores/project-store";
import { useElevenLabsTranscription } from "@/hooks/media/use-elevenlabs-transcription";
import { X, Loader2, AlertCircle, SearchIcon } from "lucide-react";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";
import { toast } from "sonner";
import { WordSearch } from "./word-timeline/word-search";
import {
	formatTime,
	formatDuration,
	calculateRemovedDuration,
} from "./word-timeline/helpers";
import { WordChip } from "./word-timeline/word-chip";
import { DropZone } from "./word-timeline/drop-zone";

/**
 * Render the word timeline UI for editing transcriptions and managing filler-word filters.
 *
 * The component synchronizes selection with playback, allows accepting/resetting AI filter
 * suggestions, supports importing media/JSON and triggering transcription, provides keyboard
 * shortcuts for common actions, and shows error/empty states and removal statistics.
 *
 * @returns The React element for the word timeline view
 */
export function WordTimelineView() {
	const {
		data,
		fileName,
		selectedWordId,
		isLoading,
		isAnalyzing,
		error,
		analysisError,
		loadFromJson,
		clearData,
		setFilterState,
		setMultipleFilterStates,
		acceptAllAiSuggestions,
		resetAllFilters,
		undoLastFilterChange,
		selectWord,
		getVisibleWords,
	} = useWordTimelineStore();

	const { seek, currentTime, isPlaying } = usePlaybackStore();
	const [previewSkipFiltered, setPreviewSkipFiltered] = useState(true);
	const [showSearch, setShowSearch] = useState(false);

	// Transcription hook
	const {
		transcribeMedia,
		isTranscribing,
		progress: transcriptionProgress,
		error: transcriptionError,
		clearError: clearTranscriptionError,
	} = useElevenLabsTranscription();

	// Get only words (not spacing)
	const words = getVisibleWords();
	const allWords = data?.words || [];

	// Auto-select word based on current playback time (karaoke-style sync)
	useEffect(() => {
		if (!isPlaying || words.length === 0) return;

		// Find the word that contains the current time
		const currentWord = words.find(
			(word) => currentTime >= word.start && currentTime < word.end
		);

		if (currentWord && currentWord.id !== selectedWordId) {
			selectWord(currentWord.id);
		}
	}, [currentTime, isPlaying, words, selectedWordId, selectWord]);

	useEffect(() => {
		try {
			if (!previewSkipFiltered || !isPlaying || allWords.length === 0) {
				return;
			}

			const currentFilteredWord = allWords.find(
				(word) =>
					(word.filterState === WORD_FILTER_STATE.AI ||
						word.filterState === WORD_FILTER_STATE.USER_REMOVE) &&
					currentTime >= word.start &&
					currentTime < word.end
			);
			if (!currentFilteredWord) {
				return;
			}

			let skipEnd = currentFilteredWord.end;
			const filteredWords = allWords
				.filter(
					(word) =>
						word.filterState === WORD_FILTER_STATE.AI ||
						word.filterState === WORD_FILTER_STATE.USER_REMOVE
				)
				.sort((left, right) => left.start - right.start);

			for (const word of filteredWords) {
				if (word.start <= skipEnd + 0.1 && word.end >= skipEnd) {
					skipEnd = Math.max(skipEnd, word.end);
				}
			}

			if (skipEnd > currentTime + 0.02) {
				seek(skipEnd);
			}
		} catch {
			return;
		}
	}, [allWords, currentTime, isPlaying, previewSkipFiltered, seek]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			try {
				const target = event.target as HTMLElement | null;
				const isTyping =
					!!target &&
					(target.tagName === "INPUT" ||
						target.tagName === "TEXTAREA" ||
						target.isContentEditable);
				if (isTyping) {
					return;
				}

				const isMac = navigator.platform.toLowerCase().includes("mac");
				const commandOrCtrl = isMac ? event.metaKey : event.ctrlKey;

				if (commandOrCtrl && event.key.toLowerCase() === "a") {
					event.preventDefault();
					acceptAllAiSuggestions();
					return;
				}

				if (commandOrCtrl && event.key.toLowerCase() === "z") {
					event.preventDefault();
					undoLastFilterChange();
					return;
				}

				if (!selectedWordId) {
					return;
				}

				if (event.key === "Delete" || event.key === "Backspace") {
					event.preventDefault();
					setFilterState(selectedWordId, WORD_FILTER_STATE.USER_REMOVE);
					return;
				}

				if (event.key === "Enter" || event.key === " ") {
					const selectedWord = allWords.find(
						(word) => word.id === selectedWordId
					);
					if (
						selectedWord &&
						selectedWord.filterState !== WORD_FILTER_STATE.NONE
					) {
						event.preventDefault();
						setFilterState(selectedWordId, WORD_FILTER_STATE.USER_KEEP);
					}
				}
			} catch {
				return;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		acceptAllAiSuggestions,
		allWords,
		selectedWordId,
		setFilterState,
		undoLastFilterChange,
	]);

	const handleJsonSelect = useCallback(
		(file: File) => {
			console.log("[WordTimeline] handleJsonSelect called");
			console.log("[WordTimeline] JSON file:", file.name, "size:", file.size);
			loadFromJson(file);
		},
		[loadFromJson]
	);

	const handleMediaSelect = useCallback(
		async (filePath: string) => {
			console.log("[WordTimeline] handleMediaSelect called, path:", filePath);

			const mediaItems = useMediaStore.getState().mediaItems;
			const addMediaItem = useMediaStore.getState().addMediaItem;
			const projectId = useProjectStore.getState().activeProject?.id;
			const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();

			// Try to find existing media item by path or filename
			let mediaItem = mediaItems.find((item) => {
				if (item.localPath) {
					const itemPath = item.localPath.replace(/\\/g, "/").toLowerCase();
					if (
						itemPath === normalizedPath ||
						normalizedPath.endsWith(itemPath.split("/").pop() || "")
					) {
						return true;
					}
				}
				if (item.importMetadata?.originalPath) {
					const originalPath = item.importMetadata.originalPath
						.replace(/\\/g, "/")
						.toLowerCase();
					if (
						originalPath === normalizedPath ||
						normalizedPath.endsWith(originalPath.split("/").pop() || "")
					) {
						return true;
					}
				}
				const fName = filePath.split(/[/\\]/).pop()?.toLowerCase();
				return !!(fName && item.name.toLowerCase() === fName);
			});

			// If not in media store, import it first
			if (!mediaItem && projectId) {
				console.log("[WordTimeline] Media not in store, importing...");
				try {
					const { processMediaFiles } = await import(
						"@/lib/media/media-processing"
					);

					// Read file from disk via Electron to create a File object
					const fileName = filePath.split(/[/\\]/).pop() || "media";
					const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
					const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(
						ext
					);
					const mimeType = isVideo
						? `video/${ext.slice(1)}`
						: `audio/${ext.slice(1)}`;

					let file: File;
					if (platform().files?.readFile) {
						const buffer = await platform().files.readFile(filePath);
						if (buffer) {
							const blob = new Blob([new Uint8Array(buffer)], {
								type: mimeType,
							});
							file = new File([blob], fileName, { type: mimeType });
						} else {
							throw new Error("Failed to read file");
						}
					} else {
						throw new Error("Electron API not available");
					}

					const processedItems = await processMediaFiles([file]);
					if (processedItems.length > 0) {
						const newId = await addMediaItem(projectId, {
							...processedItems[0],
							localPath: filePath,
							importMetadata: {
								importMethod: "copy",
								originalPath: filePath,
								importedAt: Date.now(),
								fileSize: file.size,
							},
						});
						mediaItem =
							useMediaStore.getState().mediaItems.find((m) => m.id === newId) ??
							undefined;
						if (mediaItem) {
							console.log(
								"[WordTimeline] Imported to media store:",
								mediaItem.name
							);
							toast.success(`Imported "${mediaItem.name}" to media library`);
						}
					}
				} catch (err) {
					console.error("[WordTimeline] Media import failed:", err);
					// Continue with transcription even if import fails
				}
			}

			// Add to timeline (skip if already present)
			if (mediaItem) {
				const timelineState = useTimelineStore.getState();
				const alreadyOnTimeline = timelineState.tracks.some((track) =>
					track.elements.some(
						(el) => el.type === "media" && el.mediaId === mediaItem!.id
					)
				);
				if (!alreadyOnTimeline) {
					timelineState.addMediaToNewTrack(mediaItem);
					toast.success(`Added "${mediaItem.name}" to timeline`);
				}
			}

			// Start transcription
			try {
				const result = await transcribeMedia(filePath);
				if (result) {
					const wordCount = result.words.filter(
						(w) => w.type === "word"
					).length;
					toast.success(`Transcription complete: ${wordCount} words`);
				}
			} catch (err) {
				console.error("[WordTimeline] Transcription error:", err);
				toast.error("Transcription failed");
			}
		},
		[transcribeMedia]
	);

	const handleWordPrimaryAction = useCallback(
		(word: WordItem) => {
			try {
				selectWord(word.id);
				if (word.filterState === WORD_FILTER_STATE.NONE) {
					seek(word.start);
					toast.info(`Seeked to ${formatTime(word.start)}`);
					return;
				}

				if (
					word.filterState === WORD_FILTER_STATE.AI ||
					word.filterState === WORD_FILTER_STATE.USER_REMOVE
				) {
					setFilterState(word.id, WORD_FILTER_STATE.USER_KEEP);
					return;
				}

				if (word.filterState === WORD_FILTER_STATE.USER_KEEP) {
					setFilterState(word.id, WORD_FILTER_STATE.USER_REMOVE);
				}
			} catch {
				return;
			}
		},
		[seek, selectWord, setFilterState]
	);

	const handleWordQuickRemove = useCallback(
		(word: WordItem) => {
			try {
				setFilterState(word.id, WORD_FILTER_STATE.USER_REMOVE);
			} catch {
				return;
			}
		},
		[setFilterState]
	);

	const handleAcceptAllAi = useCallback(() => {
		try {
			acceptAllAiSuggestions();
			toast.success("Accepted all AI suggestions");
		} catch {
			return;
		}
	}, [acceptAllAiSuggestions]);

	const handleResetAll = useCallback(async () => {
		try {
			await resetAllFilters();
			toast.info("Filters reset to AI defaults");
		} catch {
			return;
		}
	}, [resetAllFilters]);

	const handleSelectAllAi = useCallback(() => {
		try {
			const aiWordIds = allWords
				.filter((word) => word.filterState === WORD_FILTER_STATE.AI)
				.map((word) => word.id);
			setMultipleFilterStates(aiWordIds, WORD_FILTER_STATE.USER_REMOVE);
			toast.success(`Marked ${aiWordIds.length} AI words for removal`);
		} catch {
			return;
		}
	}, [allWords, setMultipleFilterStates]);

	const handlePreviewToggle = useCallback(() => {
		setPreviewSkipFiltered((previous) => !previous);
	}, []);

	const handlePreviewToggleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			try {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					handlePreviewToggle();
				}
			} catch {
				return;
			}
		},
		[handlePreviewToggle]
	);

	const handleClear = useCallback(() => {
		clearData();
		clearTranscriptionError();
		toast.info("Word timeline cleared");
	}, [clearData, clearTranscriptionError]);

	const handleCloseSearch = useCallback(() => {
		setShowSearch(false);
	}, []);

	// Search state
	const [searchHighlightedWords, setSearchHighlightedWords] = useState<
		Set<string>
	>(new Set());
	const [searchActiveWordId, setSearchActiveWordId] = useState<string | null>(
		null
	);

	const handleSearchSeek = useCallback(
		(word: WordItem) => {
			selectWord(word.id);
			seek(word.start);
		},
		[selectWord, seek]
	);

	// Calculate stats
	const aiFilteredCount = words.filter(
		(word) => word.filterState === WORD_FILTER_STATE.AI
	).length;
	const userRemovedCount = words.filter(
		(word) => word.filterState === WORD_FILTER_STATE.USER_REMOVE
	).length;
	const userKeptCount = words.filter(
		(word) => word.filterState === WORD_FILTER_STATE.USER_KEEP
	).length;

	const removedDuration = useMemo(() => {
		return calculateRemovedDuration({ words: allWords });
	}, [allWords]);

	const lastWord = words[words.length - 1];
	const totalDuration = lastWord?.end || 0;
	const removedPercent =
		totalDuration > 0 ? (removedDuration / totalDuration) * 100 : 0;

	// Combined error state
	const displayError = error || transcriptionError || analysisError;

	// Error state
	if (displayError && !data) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-4 text-center">
				<AlertCircle className="w-12 h-12 text-destructive mb-4">
					<title>Error</title>
				</AlertCircle>
				<p className="text-sm text-destructive font-medium">
					{transcriptionError ? "Transcription failed" : "Failed to load file"}
				</p>
				<p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
					{displayError}
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleClear}
					className="mt-4"
				>
					Try Again
				</Button>
			</div>
		);
	}

	// Empty state - show intro + drop zone
	if (!data) {
		return (
			<div className="h-full flex flex-col">
				<div className="px-4 pt-4 pb-2 text-center">
					<h2 className="text-base font-semibold">SmartEdit</h2>
					<p className="text-xs text-muted-foreground mt-1">
						AI-powered speech editing for talking videos.
					</p>
					<div className="flex flex-wrap justify-center gap-1.5 mt-3">
						{[
							"Remove filler",
							"Remove repetition",
							"Generate captions",
							"Jump by word",
						].map((feature) => (
							<span
								key={feature}
								className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-[11px] text-muted-foreground"
							>
								{feature}
							</span>
						))}
					</div>
				</div>
				<DropZone
					onJsonSelect={handleJsonSelect}
					onMediaSelect={handleMediaSelect}
					isLoading={isLoading}
					isTranscribing={isTranscribing}
					transcriptionProgress={transcriptionProgress}
				/>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between p-2 border-b bg-muted/30">
				<div className="flex items-center gap-2 min-w-0">
					<span
						className="text-sm font-medium truncate max-w-[180px]"
						title={fileName || ""}
					>
						{fileName}
					</span>
					<span className="text-xs text-muted-foreground shrink-0">
						({words.length} words)
					</span>
					{isAnalyzing && (
						<span className="inline-flex items-center gap-1 text-[10px] text-orange-700 shrink-0">
							<Loader2 className="w-3 h-3 animate-spin" />
							Analyzing for fillers...
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant={showSearch ? "outline" : "text"}
						size="icon"
						onClick={() => setShowSearch((v) => !v)}
						className="h-7 w-7"
						title="Search words"
					>
						<SearchIcon className="w-3.5 h-3.5">
							<title>Search</title>
						</SearchIcon>
					</Button>
					<Button
						type="button"
						variant={previewSkipFiltered ? "outline" : "text"}
						size="sm"
						onClick={handlePreviewToggle}
						onKeyDown={handlePreviewToggleKeyDown}
						className="h-7 px-2 text-[11px]"
					>
						Preview: {previewSkipFiltered ? "Skip filtered" : "Normal"}
					</Button>
					<Button
						type="button"
						variant="text"
						size="icon"
						onClick={handleClear}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								handleClear();
							}
						}}
						className="shrink-0 h-7 w-7"
						title="Clear"
					>
						<X className="w-4 h-4">
							<title>Clear</title>
						</X>
					</Button>
				</div>
			</div>

			{/* Search bar */}
			{showSearch && (
				<WordSearch
					words={words}
					onSeekToWord={handleSearchSeek}
					onHighlightedWordsChange={setSearchHighlightedWords}
					onActiveMatchChange={setSearchActiveWordId}
					onClose={handleCloseSearch}
				/>
			)}

			{/* Word List */}
			<ScrollArea className="flex-1">
				<div className="p-3">
					<div className="flex flex-wrap gap-1.5">
						{words.map((word) => (
							<WordChip
								key={word.id}
								word={word}
								isSelected={selectedWordId === word.id}
								isSearchMatch={searchHighlightedWords.has(word.id)}
								isActiveMatch={searchActiveWordId === word.id}
								onPrimaryAction={handleWordPrimaryAction}
								onQuickRemove={handleWordQuickRemove}
							/>
						))}
					</div>
				</div>
			</ScrollArea>

			{/* Footer - Stats */}
			<div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground">
				{analysisError && (
					<p className="text-[10px] text-destructive mb-1">{analysisError}</p>
				)}
				<div className="flex justify-between items-center gap-2">
					<span className="truncate">
						{aiFilteredCount} AI, {userRemovedCount} removed, {userKeptCount}{" "}
						kept
					</span>
					<span>Duration: {formatDuration(totalDuration)}</span>
				</div>
				<div className="flex justify-between items-center mt-1 gap-2">
					<span className="truncate">
						Removes {formatDuration(removedDuration)} (
						{removedPercent.toFixed(1)}
						%)
					</span>
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={handleSelectAllAi}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleSelectAllAi();
								}
							}}
						>
							Remove AI
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={handleAcceptAllAi}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleAcceptAllAi();
								}
							}}
						>
							Accept All
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-6 text-[10px] px-2"
							onClick={handleResetAll}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleResetAll();
								}
							}}
						>
							Reset All
						</Button>
					</div>
				</div>
				<p className="text-[10px] text-muted-foreground/70 mt-1">
					Click toggles state-aware action, right-click quick-removes,
					Ctrl/Cmd+Z undo
				</p>
			</div>
		</div>
	);
}

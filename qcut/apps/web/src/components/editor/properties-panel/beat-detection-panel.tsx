/**
 * Beat Detection Panel — UI controls for audio beat analysis.
 *
 * Shows "Detect Beats" button, progress bar, results display,
 * sensitivity slider, and "Auto-Cut on Beats" action.
 */

import { useCallback } from "react";
import { Music, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { useBeatDetection } from "@/hooks/use-beat-detection";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import { splitOnBeats } from "@/stores/timeline/split-operations";
import type { OperationContext } from "@/stores/timeline/types";

interface BeatDetectionPanelProps {
	elementId: string;
	trackId: string;
	audioUrl: string | undefined;
}

/** Panel for audio beat detection with analyze, auto-cut, and sensitivity controls. */
export function BeatDetectionPanel({
	elementId,
	trackId,
	audioUrl,
}: BeatDetectionPanelProps) {
	const {
		result,
		isAnalyzing,
		progress,
		error,
		sensitivity,
		setSensitivity,
		analyze,
		clear,
	} = useBeatDetection(elementId);

	const handleAnalyze = useCallback(() => {
		if (!audioUrl) return;
		analyze(audioUrl);
	}, [audioUrl, analyze]);

	const handleAutoCut = useCallback(() => {
		// Read store fresh each call — getTracks must return latest state
		// after each split modifies tracks via updateTracksAndSave.
		const getStore = () => useTimelineStore.getState();
		const ctx: OperationContext = {
			getTracks: () => getStore().tracks,
			getSelectedElements: () => getStore().selectedElements,
			isRippleEnabled: () => getStore().rippleEditingEnabled,
			updateTracks: (t) => getStore().restoreTracks(t),
			updateTracksAndSave: (t) => {
				const s = getStore();
				s.restoreTracks(t);
				s.saveImmediate();
			},
			pushHistory: () => getStore().pushHistory(),
			addTrack: (type) => getStore().addTrack(type),
			insertTrackAt: (type, index) => getStore().insertTrackAt(type, index),
			selectElement: (tid, eid) => getStore().selectElement(tid, eid),
			deselectElement: (tid, eid) => getStore().deselectElement(tid, eid),
		};

		// Compute timeline cut points from beat store
		const tracks = getStore().tracks;
		const track = tracks.find((t) => t.id === trackId);
		const element = track?.elements.find((e) => e.id === elementId);
		if (!element) return;

		const beatStore = useBeatDetectionStore.getState();
		if (beatStore.activeElementId !== elementId) {
			beatStore.setActiveElement(elementId);
		}

		const trimStart = element.trimStart ?? 0;
		const elementStart = element.startTime;
		const elementEnd =
			element.startTime +
			(element.duration - (element.trimStart ?? 0) - (element.trimEnd ?? 0));

		// Get audio-relative cut points and map to timeline coordinates
		const audioCuts = beatStore.getCutPoints(
			trimStart,
			trimStart + (elementEnd - elementStart)
		);
		const timelineCuts = audioCuts.map((t) => t - trimStart + elementStart);

		splitOnBeats(ctx, trackId, elementId, timelineCuts);
	}, [trackId, elementId]);

	if (!audioUrl) return null;

	return (
		<PropertyGroup title="Beat Detection" defaultExpanded={true}>
			<div className="space-y-3">
				{/* Sensitivity control */}
				<PropertyItem direction="column">
					<PropertyItemLabel>Sensitivity</PropertyItemLabel>
					<PropertyItemValue>
						<div className="flex items-center gap-2">
							<Slider
								aria-label="Beat detection sensitivity"
								value={[sensitivity * 10]}
								min={5}
								max={30}
								step={1}
								onValueChange={([v]) => setSensitivity(v / 10)}
								className="w-full"
							/>
							<span className="text-xs w-8">{sensitivity.toFixed(1)}</span>
						</div>
					</PropertyItemValue>
				</PropertyItem>

				{/* Analyze button */}
				{!result && !isAnalyzing && (
					<Button
						size="sm"
						variant="outline"
						className="w-full gap-2"
						onClick={handleAnalyze}
						aria-label="Detect beats"
					>
						<Music className="size-3.5" />
						Detect Beats
					</Button>
				)}

				{/* Progress bar */}
				{isAnalyzing && (
					<div className="space-y-1">
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>Analyzing...</span>
							<span>{Math.round(progress * 100)}%</span>
						</div>
						<div className="h-1.5 w-full rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-primary transition-all"
								style={{ width: `${progress * 100}%` }}
							/>
						</div>
					</div>
				)}

				{/* Error */}
				{error && <p className="text-xs text-destructive">{error}</p>}

				{/* Results */}
				{result && (
					<>
						<div className="grid grid-cols-3 gap-2 text-xs">
							<div className="text-center">
								<div className="font-medium">{result.bpm}</div>
								<div className="text-muted-foreground">BPM</div>
							</div>
							<div className="text-center">
								<div className="font-medium">
									{Math.round(result.confidence * 100)}%
								</div>
								<div className="text-muted-foreground">Confidence</div>
							</div>
							<div className="text-center">
								<div className="font-medium">{result.beats.length}</div>
								<div className="text-muted-foreground">Beats</div>
							</div>
						</div>

						<div className="flex gap-2">
							<Button
								size="sm"
								variant="default"
								className="flex-1 gap-2"
								onClick={handleAutoCut}
								disabled={result.beats.length === 0}
								aria-label="Auto-cut on beats"
							>
								<Scissors className="size-3.5" />
								Auto-Cut
							</Button>
							<Button
								size="sm"
								variant="secondary"
								onClick={() => {
									clear();
								}}
								aria-label="Clear beat detection results"
							>
								Clear
							</Button>
						</div>

						{/* Re-analyze with different sensitivity */}
						<Button
							size="sm"
							variant="secondary"
							className="w-full gap-2 text-xs"
							onClick={() => {
								clear();
								handleAnalyze();
							}}
							aria-label="Re-analyze beats"
						>
							<Music className="size-3.5" />
							Re-analyze
						</Button>
					</>
				)}
			</div>
		</PropertyGroup>
	);
}

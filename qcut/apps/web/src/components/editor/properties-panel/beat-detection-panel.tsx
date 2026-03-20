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

interface BeatDetectionPanelProps {
	elementId: string;
	trackId: string;
	audioUrl: string | undefined;
}

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
		const store = useTimelineStore.getState();
		const tracks = store.tracks;
		const track = tracks.find((t) => t.id === trackId);
		const element = track?.elements.find((e) => e.id === elementId);
		if (!element) return;

		const ctx = {
			getTracks: () => store.tracks,
			getSelectedElements: () => store.selectedElements,
			isRippleEnabled: () => store.rippleEditingEnabled,
			updateTracks: (t: typeof tracks) => store.restoreTracks(t),
			updateTracksAndSave: (t: typeof tracks) => {
				store.restoreTracks(t);
				store.saveImmediate();
			},
			pushHistory: () => store.pushHistory(),
			addTrack: (type: Parameters<typeof store.addTrack>[0]) =>
				store.addTrack(type),
			insertTrackAt: (
				type: Parameters<typeof store.insertTrackAt>[0],
				index: number
			) => store.insertTrackAt(type, index),
			selectElement: (tid: string, eid: string) =>
				store.selectElement(tid, eid),
			deselectElement: (tid: string, eid: string) =>
				store.deselectElement(tid, eid),
		};

		splitOnBeats(ctx, trackId, elementId);
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

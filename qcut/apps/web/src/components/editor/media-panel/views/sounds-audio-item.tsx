import {
	assetManifestIdentity,
	assetManifestVersionKey,
	createInitialAssetRuntimeState,
} from "@qcut/editor-core";
import {
	AudioWaveform,
	Check,
	Heart,
	Loader2,
	Music2,
	Pause,
	Play,
	Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	createFreesoundAssetEntry,
	resolveFreesoundLicense,
} from "@/lib/assets/freesound-asset";
import { cn } from "@/lib/utils";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useSoundsStore } from "@/stores/media/sounds-store";
import type { SoundEffect } from "@/types/sounds";

export type AudioAssetKind = "sound-effect" | "music";

interface AudioLibraryItemProps {
	sound: SoundEffect;
	assetKind: AudioAssetKind;
	isPlaying: boolean;
	onPlay: () => void;
	onToggleSaved: () => void;
}

function formatDuration({ duration }: { duration: number }): string {
	const roundedSeconds = Math.max(0, Math.round(duration));
	const minutes = Math.floor(roundedSeconds / 60);
	const seconds = String(roundedSeconds % 60).padStart(2, "0");
	return `${minutes}:${seconds}`;
}

export function AudioLibraryItem({
	sound,
	assetKind,
	isPlaying,
	onPlay,
	onToggleSaved,
}: AudioLibraryItemProps) {
	const [isAdding, setIsAdding] = useState(false);
	const asset = useMemo(
		() => createFreesoundAssetEntry({ sound, kind: assetKind }),
		[assetKind, sound]
	);
	const identity = assetManifestIdentity({ kind: asset.kind, id: asset.id });
	const assetKey = assetManifestVersionKey({
		kind: asset.kind,
		id: asset.id,
		version: asset.version,
	});
	const favorite = useAssetLibraryStore(
		(state) => state.favorites[identity] === true
	);
	const persistedRuntime = useAssetLibraryStore(
		(state) => state.runtimeByAssetKey[assetKey]
	);
	const runtime = persistedRuntime ?? createInitialAssetRuntimeState({ asset });
	const addSoundToTimeline = useSoundsStore(
		(state) => state.addSoundToTimeline
	);
	const license = resolveFreesoundLicense({ licenseUrl: sound.license });
	const licenseLabel = license.spdxId ?? license.name;

	const handleAdd = async () => {
		setIsAdding(true);
		try {
			await addSoundToTimeline(sound, assetKind);
		} finally {
			setIsAdding(false);
		}
	};

	const MediaIcon = assetKind === "music" ? Music2 : AudioWaveform;
	return (
		<div
			className="flex min-h-14 items-center gap-2 border-b border-border/45 py-2"
			data-testid={`audio-library-item-${assetKind}-${sound.id}`}
		>
			<Button
				type="button"
				variant="outline"
				size="icon"
				className="relative size-10 shrink-0"
				aria-label={isPlaying ? `Pause ${sound.name}` : `Preview ${sound.name}`}
				title={isPlaying ? "Pause preview" : "Play preview"}
				onClick={onPlay}
				onKeyDown={(event) => {
					if (event.key === " ") {
						event.preventDefault();
						onPlay();
					}
				}}
			>
				<MediaIcon className="absolute size-5 text-muted-foreground">
					<title>{assetKind === "music" ? "Music" : "Sound effect"}</title>
				</MediaIcon>
				{isPlaying ? (
					<Pause className="relative size-4 fill-background text-foreground">
						<title>Pause</title>
					</Pause>
				) : (
					<Play className="relative size-4 fill-background text-foreground">
						<title>Play</title>
					</Play>
				)}
			</Button>

			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium" title={sound.name}>
					{sound.name}
				</div>
				<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
					<span className="max-w-24 truncate">{sound.username}</span>
					<span aria-hidden="true">·</span>
					<span className="tabular-nums">
						{formatDuration({ duration: sound.duration })}
					</span>
					<span aria-hidden="true">·</span>
					<span className="truncate" title={license.name}>
						{licenseLabel}
					</span>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-8"
					disabled={isAdding}
					aria-label={`Add ${sound.name} to timeline`}
					title="Add to timeline"
					onClick={handleAdd}
					onKeyDown={(event) => {
						if (event.key === " ") {
							event.preventDefault();
							void handleAdd();
						}
					}}
				>
					{isAdding || runtime.downloadStatus === "downloading" ? (
						<Loader2 className="size-4 animate-spin">
							<title>Adding audio</title>
						</Loader2>
					) : runtime.cacheStatus === "cached" ? (
						<Check className="size-4 text-emerald-400">
							<title>Audio cached</title>
						</Check>
					) : (
						<Plus className="size-4">
							<title>Add to timeline</title>
						</Plus>
					)}
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					className={cn(
						"size-8 text-muted-foreground",
						favorite && "text-amber-300"
					)}
					aria-label={
						favorite
							? `Remove ${sound.name} from favorites`
							: `Favorite ${sound.name}`
					}
					title={favorite ? "Remove from favorites" : "Add to favorites"}
					onClick={onToggleSaved}
					onKeyDown={(event) => {
						if (event.key === " ") {
							event.preventDefault();
							onToggleSaved();
						}
					}}
				>
					<Heart className={cn("size-4", favorite && "fill-current")}>
						<title>{favorite ? "Favorited" : "Favorite audio"}</title>
					</Heart>
				</Button>
			</div>
		</div>
	);
}

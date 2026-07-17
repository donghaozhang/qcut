import { ListMusic, Pause, Play, Volume2, X } from "lucide-react";
import AudioWaveform from "@/components/editor/audio-waveform";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useTranslation } from "@/lib/i18n";
import type { SoundEffect } from "@/types/sounds";
import { formatAudioDuration } from "./sounds-audio-item";

export function AudioPreviewPlayer({
	sound,
	isPlaying,
	currentTime,
	duration,
	volume,
	continuousPlayback,
	onToggle,
	onSeek,
	onVolumeChange,
	onContinuousPlaybackChange,
	onClose,
}: {
	sound: SoundEffect;
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	continuousPlayback: boolean;
	onToggle: () => void;
	onSeek: ({ time }: { time: number }) => void;
	onVolumeChange: ({ value }: { value: number }) => void;
	onContinuousPlaybackChange: ({ enabled }: { enabled: boolean }) => void;
	onClose: () => void;
}) {
	const { locale, t } = useTranslation();
	const name =
		locale === "zh" ? (sound.localizedName ?? sound.name) : sound.name;
	const resolvedDuration = duration || sound.duration;
	const progress =
		resolvedDuration > 0
			? Math.min(100, Math.max(0, (currentTime / resolvedDuration) * 100))
			: 0;

	return (
		<div
			className="absolute inset-x-0 bottom-0 z-20 flex h-[62px] items-center gap-2 border-t border-border bg-panel/95 px-3 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur"
			data-testid="audio-preview-player"
		>
			<Button
				type="button"
				variant="secondary"
				size="icon"
				className="size-8 shrink-0 rounded-full"
				aria-label={
					isPlaying
						? t("audioLibrary.player.pause")
						: t("audioLibrary.player.play")
				}
				title={
					isPlaying
						? t("audioLibrary.player.pause")
						: t("audioLibrary.player.play")
				}
				onClick={onToggle}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onToggle();
					}
				}}
			>
				{isPlaying ? (
					<Pause className="size-3.5 fill-current" />
				) : (
					<Play className="size-3.5 fill-current" />
				)}
			</Button>

			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2 text-[10px]">
					<span className="truncate font-medium">{name}</span>
					<span className="shrink-0 tabular-nums text-muted-foreground">
						{formatAudioDuration({ duration: currentTime })} /{" "}
						{formatAudioDuration({ duration: resolvedDuration })}
					</span>
				</div>
				<div className="relative mt-1 h-5 overflow-hidden rounded-sm bg-muted/40">
					<AudioWaveform
						audioUrl={sound.previewUrl ?? sound.downloadUrl ?? ""}
						cacheKey={`audio-preview-player:${sound.id}`}
						height={20}
						className="w-full opacity-80"
						ariaLabel={t("audioLibrary.card.waveform", { name })}
						showStatus={false}
					/>
					<div
						className="pointer-events-none absolute inset-y-0 left-0 border-r border-primary bg-primary/20"
						style={{ width: `${progress}%` }}
					/>
					<input
						type="range"
						min={0}
						max={Math.max(0.01, resolvedDuration)}
						step={0.01}
						value={Math.min(currentTime, resolvedDuration)}
						className="absolute inset-0 h-full w-full cursor-pointer opacity-0 accent-primary focus-visible:opacity-100"
						aria-label={t("audioLibrary.player.progress")}
						data-testid="audio-preview-waveform-seek"
						onChange={(event) =>
							onSeek({ time: Number(event.currentTarget.value) })
						}
					/>
				</div>
			</div>

			<div className="hidden w-24 items-center gap-1.5 sm:flex">
				<Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
				<input
					type="range"
					min={0}
					max={1}
					step={0.01}
					value={volume}
					className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
					aria-label={t("audioLibrary.player.volume")}
					onChange={(event) =>
						onVolumeChange({ value: Number(event.currentTarget.value) })
					}
				/>
			</div>

			<Toggle
				type="button"
				size="sm"
				className="size-7 min-w-7 shrink-0 p-0"
				pressed={continuousPlayback}
				aria-label={t("audioLibrary.player.continuous")}
				title={t("audioLibrary.player.continuous")}
				onPressedChange={(enabled) => onContinuousPlaybackChange({ enabled })}
			>
				<ListMusic className="size-3.5" />
			</Toggle>

			<Button
				type="button"
				variant="text"
				size="icon"
				className="size-7 shrink-0"
				aria-label={t("audioLibrary.player.close")}
				title={t("audioLibrary.player.close")}
				onClick={onClose}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onClose();
					}
				}}
			>
				<X className="size-3.5" />
			</Button>
		</div>
	);
}

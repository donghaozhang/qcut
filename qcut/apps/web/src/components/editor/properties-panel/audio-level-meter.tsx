import { AlertTriangle } from "lucide-react";
import type { AudioMeterReading } from "@/lib/audio/audio-metering";
import { SILENT_AUDIO_METER } from "@/lib/audio/audio-metering";
import { cn } from "@/lib/utils";
import { useAudioMeterStore } from "@/stores/editor/audio-meter-store";

function meterWidth({ value }: { value: number }): string {
	return `${Math.min(100, Math.max(0, ((value + 60) / 60) * 100))}%`;
}

function displayDb({ value }: { value: number }): string {
	return value <= -119 ? "-∞" : value.toFixed(1);
}

function MeterRow({
	label,
	reading,
}: {
	label: string;
	reading: AudioMeterReading;
}) {
	return (
		<div className="space-y-1" data-clipping={reading.clipping || undefined}>
			<div className="flex h-4 items-center gap-2 text-[10px] tabular-nums">
				<span className="w-11 shrink-0 text-muted-foreground">{label}</span>
				<span className="w-16">P {displayDb({ value: reading.peakDb })}</span>
				<span className="w-16">R {displayDb({ value: reading.rmsDb })}</span>
				<span className="min-w-0 flex-1 truncate">
					M {displayDb({ value: reading.lufsMomentary })} LUFS
				</span>
				<span className="w-14 text-right">
					GR {Math.abs(reading.gainReductionDb).toFixed(1)}
				</span>
				{reading.clipping ? (
					<AlertTriangle className="size-3 shrink-0 text-destructive" />
				) : (
					<span className="size-3 shrink-0" />
				)}
			</div>
			<div className="relative h-1.5 overflow-hidden rounded-sm bg-muted">
				<div
					className={cn(
						"absolute inset-y-0 left-0 transition-[width] duration-75",
						reading.clipping ? "bg-destructive" : "bg-primary"
					)}
					style={{ width: meterWidth({ value: reading.peakDb }) }}
				/>
				<div
					className="absolute inset-y-0 w-px bg-foreground/80"
					style={{ left: meterWidth({ value: reading.rmsDb }) }}
				/>
			</div>
		</div>
	);
}

export function AudioLevelMeter({ trackId }: { trackId: string }) {
	const track = useAudioMeterStore(
		(state) => state.tracks[trackId] ?? SILENT_AUDIO_METER
	);
	const master = useAudioMeterStore((state) => state.master);
	return (
		<section
			className="space-y-2 border-b border-border/70 py-3"
			data-testid="audio-level-meter"
		>
			<MeterRow label="轨道" reading={track} />
			<MeterRow label="主输出" reading={master} />
		</section>
	);
}

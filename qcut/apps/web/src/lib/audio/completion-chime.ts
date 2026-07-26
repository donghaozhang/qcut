/**
 * Short synthesized chime for export completion — no audio asset needed.
 * Success plays an ascending two-note figure, failure a single low tone.
 */
export function playCompletionChime({
	kind,
}: {
	kind: "success" | "error";
}): void {
	try {
		const AudioContextCtor =
			window.AudioContext ??
			(window as { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext;
		if (!AudioContextCtor) return;
		const context = new AudioContextCtor();
		const notes =
			kind === "success"
				? [
						{ frequency: 660, start: 0, duration: 0.12 },
						{ frequency: 880, start: 0.14, duration: 0.22 },
					]
				: [{ frequency: 220, start: 0, duration: 0.35 }];
		for (const note of notes) {
			const oscillator = context.createOscillator();
			const gain = context.createGain();
			oscillator.type = "sine";
			oscillator.frequency.value = note.frequency;
			const startAt = context.currentTime + note.start;
			gain.gain.setValueAtTime(0.0001, startAt);
			gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);
			oscillator.connect(gain);
			gain.connect(context.destination);
			oscillator.start(startAt);
			oscillator.stop(startAt + note.duration + 0.05);
		}
		const totalMs = 800;
		window.setTimeout(() => {
			void context.close();
		}, totalMs);
	} catch {
		// A blocked or missing audio context must never break the export flow.
	}
}

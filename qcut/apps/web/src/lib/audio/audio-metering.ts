export interface AudioMeterReading {
	peakDb: number;
	rmsDb: number;
	lufsMomentary: number;
	clipping: boolean;
	gainReductionDb: number;
	timestamp: number;
}

export const SILENT_AUDIO_METER: AudioMeterReading = {
	peakDb: -120,
	rmsDb: -120,
	lufsMomentary: -120,
	clipping: false,
	gainReductionDb: 0,
	timestamp: 0,
};

function amplitudeToDb({ amplitude }: { amplitude: number }): number {
	if (!Number.isFinite(amplitude) || amplitude <= 0) return -120;
	return Math.max(-120, 20 * Math.log10(amplitude));
}

function meanSquare({ samples }: { samples: Float32Array }): number {
	if (samples.length === 0) return 0;
	let total = 0;
	for (const sample of samples) total += sample * sample;
	return total / samples.length;
}

export function calculateAudioMeterReading({
	samples,
	kWeightedSamples = samples,
	gainReductionDb = 0,
	timestamp = performance.now(),
}: {
	samples: Float32Array<ArrayBufferLike>;
	kWeightedSamples?: Float32Array<ArrayBufferLike>;
	gainReductionDb?: number;
	timestamp?: number;
}): AudioMeterReading {
	let peak = 0;
	for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
	const rmsPower = meanSquare({ samples });
	const loudnessPower = meanSquare({ samples: kWeightedSamples });
	const lufsMomentary =
		loudnessPower > 0
			? Math.max(-120, -0.691 + 10 * Math.log10(loudnessPower))
			: -120;
	return {
		peakDb: amplitudeToDb({ amplitude: peak }),
		rmsDb: amplitudeToDb({ amplitude: Math.sqrt(rmsPower) }),
		lufsMomentary,
		clipping: peak >= 0.999,
		gainReductionDb: Math.min(0, gainReductionDb),
		timestamp,
	};
}

export function combineAudioMeterReadings({
	readings,
	timestamp = performance.now(),
}: {
	readings: AudioMeterReading[];
	timestamp?: number;
}): AudioMeterReading {
	if (readings.length === 0) return { ...SILENT_AUDIO_METER, timestamp };
	let peakLinear = 0;
	let rmsPower = 0;
	let loudnessPower = 0;
	let gainReductionDb = 0;
	let clipping = false;
	for (const reading of readings) {
		peakLinear += 10 ** (reading.peakDb / 20);
		rmsPower += 10 ** (reading.rmsDb / 10);
		loudnessPower += 10 ** ((reading.lufsMomentary + 0.691) / 10);
		gainReductionDb = Math.min(gainReductionDb, reading.gainReductionDb);
		clipping ||= reading.clipping;
	}
	return {
		peakDb: amplitudeToDb({ amplitude: Math.min(peakLinear, 4) }),
		rmsDb: rmsPower > 0 ? Math.max(-120, 10 * Math.log10(rmsPower)) : -120,
		lufsMomentary:
			loudnessPower > 0
				? Math.max(-120, -0.691 + 10 * Math.log10(loudnessPower))
				: -120,
		clipping: clipping || peakLinear >= 0.999,
		gainReductionDb,
		timestamp,
	};
}

export interface AudioLoudnessAnalysis {
	integratedLufs: number;
	truePeakDb: number;
	duration: number;
}

function energyToLufs({ energy }: { energy: number }) {
	if (energy <= Number.EPSILON) return -70;
	return -0.691 + 10 * Math.log10(energy);
}

function peakToDb({ peak }: { peak: number }) {
	if (peak <= Number.EPSILON) return -120;
	return 20 * Math.log10(peak);
}

export function measurePcmLoudness({
	channels,
	sampleRate,
}: {
	channels: Float32Array[];
	sampleRate: number;
}): AudioLoudnessAnalysis {
	if (channels.length === 0 || channels[0].length === 0 || sampleRate <= 0) {
		return { integratedLufs: -70, truePeakDb: -120, duration: 0 };
	}
	const sampleCount = Math.min(...channels.map((channel) => channel.length));
	const blockSize = Math.max(1, Math.round(sampleRate * 0.4));
	const hopSize = Math.max(1, Math.round(sampleRate * 0.1));
	const blockEnergies: number[] = [];
	let peak = 0;
	for (const channel of channels) {
		for (let index = 0; index < sampleCount; index += 1) {
			peak = Math.max(peak, Math.abs(channel[index]));
		}
	}
	for (let start = 0; start < sampleCount; start += hopSize) {
		const end = Math.min(sampleCount, start + blockSize);
		if (end - start < Math.min(blockSize, sampleRate * 0.1)) break;
		let energy = 0;
		for (const channel of channels) {
			for (let index = start; index < end; index += 1) {
				energy += channel[index] ** 2;
			}
		}
		energy /= (end - start) * channels.length;
		if (energyToLufs({ energy }) >= -70) blockEnergies.push(energy);
	}
	if (blockEnergies.length === 0) {
		return {
			integratedLufs: -70,
			truePeakDb: peakToDb({ peak }),
			duration: sampleCount / sampleRate,
		};
	}
	const preliminaryEnergy =
		blockEnergies.reduce((sum, energy) => sum + energy, 0) /
		blockEnergies.length;
	const relativeGate = energyToLufs({ energy: preliminaryEnergy }) - 10;
	const gated = blockEnergies.filter(
		(energy) => energyToLufs({ energy }) >= relativeGate
	);
	const integratedEnergy =
		gated.reduce((sum, energy) => sum + energy, 0) / gated.length;
	return {
		integratedLufs: energyToLufs({ energy: integratedEnergy }),
		truePeakDb: peakToDb({ peak }),
		duration: sampleCount / sampleRate,
	};
}

async function renderKWeighted({
	buffer,
}: {
	buffer: AudioBuffer;
}): Promise<AudioBuffer> {
	if (typeof OfflineAudioContext === "undefined") return buffer;
	const offline = new OfflineAudioContext(
		buffer.numberOfChannels,
		buffer.length,
		buffer.sampleRate
	);
	const source = offline.createBufferSource();
	const highpass = offline.createBiquadFilter();
	const shelf = offline.createBiquadFilter();
	source.buffer = buffer;
	highpass.type = "highpass";
	highpass.frequency.value = 38;
	highpass.Q.value = 0.5;
	shelf.type = "highshelf";
	shelf.frequency.value = 1_682;
	shelf.gain.value = 4;
	source.connect(highpass);
	highpass.connect(shelf);
	shelf.connect(offline.destination);
	source.start();
	return offline.startRendering();
}

export async function analyzeMediaLoudness({
	file,
	url,
}: {
	file?: File;
	url?: string;
}): Promise<AudioLoudnessAnalysis> {
	const data = file
		? await file.arrayBuffer()
		: url
			? await (await fetch(url)).arrayBuffer()
			: null;
	if (!data) throw new Error("Audio source is unavailable");
	const context = new AudioContext();
	try {
		const decoded = await context.decodeAudioData(data.slice(0));
		const weighted = await renderKWeighted({ buffer: decoded });
		return measurePcmLoudness({
			channels: Array.from(
				{ length: weighted.numberOfChannels },
				(_, channel) => weighted.getChannelData(channel)
			),
			sampleRate: weighted.sampleRate,
		});
	} finally {
		await context.close();
	}
}

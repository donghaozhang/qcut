function writeAscii({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: string;
}) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

function pcm16({ sample }: { sample: number }): number {
	const clamped = Math.max(-1, Math.min(1, sample));
	return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

export function encodeAudioBufferAsWav({
	buffer,
}: {
	buffer: AudioBuffer;
}): ArrayBuffer {
	const channelCount = Math.min(2, Math.max(1, buffer.numberOfChannels));
	const bytesPerSample = 2;
	const dataSize = buffer.length * channelCount * bytesPerSample;
	const output = new ArrayBuffer(44 + dataSize);
	const view = new DataView(output);

	writeAscii({ view, offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeAscii({ view, offset: 8, value: "WAVE" });
	writeAscii({ view, offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channelCount, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * channelCount * bytesPerSample, true);
	view.setUint16(32, channelCount * bytesPerSample, true);
	view.setUint16(34, bytesPerSample * 8, true);
	writeAscii({ view, offset: 36, value: "data" });
	view.setUint32(40, dataSize, true);

	const channels = Array.from({ length: channelCount }, (_, channel) =>
		buffer.getChannelData(channel)
	);
	let offset = 44;
	for (let frame = 0; frame < buffer.length; frame += 1) {
		for (const channel of channels) {
			view.setInt16(offset, pcm16({ sample: channel[frame] }), true);
			offset += bytesPerSample;
		}
	}
	return output;
}

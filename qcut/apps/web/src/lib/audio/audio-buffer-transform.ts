export function reverseAudioBuffer({
	context,
	buffer,
}: {
	context: BaseAudioContext;
	buffer: AudioBuffer;
}): AudioBuffer {
	const reversed = context.createBuffer(
		buffer.numberOfChannels,
		buffer.length,
		buffer.sampleRate
	);
	for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
		const from = buffer.getChannelData(channel);
		const to = reversed.getChannelData(channel);
		for (let index = 0; index < from.length; index += 1) {
			to[index] = from[from.length - index - 1];
		}
	}
	return reversed;
}

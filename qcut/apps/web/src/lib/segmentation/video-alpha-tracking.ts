import {
	alphaMaskTrackingSample,
	type MediaMaskTrackingSample,
} from "@/lib/video/media-mask-tracking";

export interface VideoAlphaTrackingResult {
	hasAlpha: boolean;
	frameRate: number;
	samples: MediaMaskTrackingSample[];
}

export async function extractVideoAlphaTracking({
	file,
	maxAnalysisWidth = 320,
	sampleEvery = 1,
}: {
	file: File;
	maxAnalysisWidth?: number;
	sampleEvery?: number;
}): Promise<VideoAlphaTrackingResult> {
	const { ALL_FORMATS, BlobSource, Input, VideoSampleSink } = await import(
		"mediabunny"
	);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("The generated mask has no video track");
		const [hasAlpha, firstTimestamp, packetStats] = await Promise.all([
			track.canBeTransparent(),
			track.getFirstTimestamp(),
			track.computePacketStats(120),
		]);
		const frameRate = Math.min(
			60,
			Math.max(1, packetStats.averagePacketRate || 30)
		);
		if (!hasAlpha) return { hasAlpha: false, frameRate, samples: [] };

		const scale = Math.min(1, maxAnalysisWidth / track.displayWidth);
		const width = Math.max(1, Math.round(track.displayWidth * scale));
		const height = Math.max(1, Math.round(track.displayHeight * scale));
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) throw new Error("Unable to analyze generated mask frames");

		const sink = new VideoSampleSink(track);
		const samples: MediaMaskTrackingSample[] = [];
		let decodedIndex = 0;
		// Streaming decode keeps only one frame alive; collecting samples first can exhaust GPU memory.
		for await (const sample of sink.samples()) {
			try {
				if (decodedIndex % Math.max(1, sampleEvery) !== 0) continue;
				context.clearRect(0, 0, width, height);
				sample.draw(context, 0, 0, width, height);
				const rgba = context.getImageData(0, 0, width, height).data;
				const alpha = new Float32Array(width * height);
				for (let index = 0; index < alpha.length; index += 1) {
					alpha[index] = rgba[index * 4 + 3] / 255;
				}
				const trackingSample = alphaMaskTrackingSample({
					alpha,
					width,
					height,
					frame: Math.max(
						0,
						Math.round((sample.timestamp - firstTimestamp) * frameRate)
					),
				});
				if (trackingSample) samples.push(trackingSample);
			} finally {
				decodedIndex += 1;
				sample.close();
			}
		}
		return { hasAlpha: true, frameRate, samples };
	} finally {
		input.dispose();
	}
}

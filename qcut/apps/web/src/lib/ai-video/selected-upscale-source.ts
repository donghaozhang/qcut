const SELECTED_VIDEO_UPSCALE_EVENT = "qcut:selected-video-upscale";

let pendingSourceFile: File | null = null;

export function requestSelectedVideoUpscale({ file }: { file: File }) {
	pendingSourceFile = file;
	window.dispatchEvent(new Event(SELECTED_VIDEO_UPSCALE_EVENT));
}

export function subscribeToSelectedVideoUpscale({
	onSource,
}: {
	onSource: ({ file }: { file: File }) => void;
}) {
	const deliverPendingSource = () => {
		if (!pendingSourceFile) return;
		const file = pendingSourceFile;
		pendingSourceFile = null;
		onSource({ file });
	};
	window.addEventListener(SELECTED_VIDEO_UPSCALE_EVENT, deliverPendingSource);
	deliverPendingSource();
	return () =>
		window.removeEventListener(
			SELECTED_VIDEO_UPSCALE_EVENT,
			deliverPendingSource
		);
}

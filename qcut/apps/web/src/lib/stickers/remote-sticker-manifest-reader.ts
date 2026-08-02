import { readRemoteManifestResponse } from "@/lib/assets/remote-manifest-reader";

const MAX_REMOTE_MANIFEST_BYTES = 1024 * 1024;

export function readRemoteStickerManifestResponse({
	manifestUrl,
	response,
}: {
	manifestUrl: string;
	response: Response;
}): Promise<Uint8Array> {
	return readRemoteManifestResponse({
		manifestUrl,
		maxBytes: MAX_REMOTE_MANIFEST_BYTES,
		response,
		resourceName: "sticker lab manifest",
	});
}

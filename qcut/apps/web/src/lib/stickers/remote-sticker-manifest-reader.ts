import { MAX_PRIVATE_STICKER_MANIFEST_BYTES } from "@qcut/editor-core/sticker-lab";
import { readRemoteManifestResponse } from "@/lib/assets/remote-manifest-reader";

export function readRemoteStickerManifestResponse({
	manifestUrl,
	response,
}: {
	manifestUrl: string;
	response: Response;
}): Promise<Uint8Array> {
	return readRemoteManifestResponse({
		manifestUrl,
		maxBytes: MAX_PRIVATE_STICKER_MANIFEST_BYTES,
		response,
		resourceName: "sticker lab manifest",
	});
}

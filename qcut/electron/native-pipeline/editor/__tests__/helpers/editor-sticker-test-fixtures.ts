import type { StickerHandlerDependencies } from "../../editor-handlers-sticker";

const ROOT_PATH = "/private/QCut Sticker Lab";
const BATCH_ID = "jianying-2026-08-23-batch-18-v2";

export function stickerLabDependencies({
	bytes,
	mimeType = "image/gif",
}: {
	bytes?: Uint8Array;
	mimeType?: "image/gif" | "image/png";
} = {}): StickerHandlerDependencies {
	const stickerId = mimeType === "image/gif" ? "18001" : "18002";
	const referenceBytes =
		bytes ??
		(mimeType === "image/gif"
			? new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
			: new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
	const fileName = `${stickerId}.${mimeType === "image/gif" ? "gif" : "png"}`;
	const checksumSha256 = "a".repeat(64);
	return {
		discoverLocalReferences: async () => ({
			rootPath: ROOT_PATH,
			catalogs: [
				{
					version: 1,
					batchId: BATCH_ID,
					referenceOnly: true,
					categories: [
						{
							id: "test",
							label: "Test",
							sourcePanel: "Test fixture",
							items: [
								{
									id: stickerId,
									displayName: `Sticker ${stickerId}`,
									fileName,
									mimeType,
									sourceKind:
										mimeType === "image/gif" ? "direct-gif" : "static-image",
									playback:
										mimeType === "image/gif"
											? {
													kind: "animated",
													frameCount: 2,
													cycleDuration: 1,
													loop: true,
												}
											: { kind: "static" },
									asset: {
										kind: "local-reference",
										rootPath: ROOT_PATH,
										batchId: BATCH_ID,
										stickerId,
										byteSize: referenceBytes.byteLength,
										checksumSha256,
									},
								},
							],
						},
					],
					itemCount: 1,
					totalBytes: referenceBytes.byteLength,
				},
			],
			warnings: [],
			summary: {
				batchCount: 1,
				categoryCount: 1,
				itemCount: 1,
				totalBytes: referenceBytes.byteLength,
			},
		}),
		readLocalReference: async ({ batchId }) => ({
			bytes: referenceBytes,
			fileName,
			mimeType,
			batchId,
			stickerId,
			checksumSha256,
		}),
	};
}

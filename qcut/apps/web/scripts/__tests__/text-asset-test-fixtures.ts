import type { TextAssetUploadPlanItem } from "../upload-text-assets-cdn";

export function createTextPackageFixtureContent({
	sourceItem,
	sourceSha256 = sourceItem.sha256,
	thumbnailItem,
	thumbnailSha256 = thumbnailItem.sha256,
}: {
	sourceItem: TextAssetUploadPlanItem;
	sourceSha256?: string;
	thumbnailItem: TextAssetUploadPlanItem;
	thumbnailSha256?: string;
}): string {
	return JSON.stringify({
		schemaVersion: 1,
		kind: "qcut-text-template-package",
		assetId: "text-demo",
		packageId: "text-demo",
		version: 1,
		cacheKey: "text-assets/demo/plain@1",
		files: {
			source: "template.json",
			thumbnail: "thumbnail.webp",
		},
		resources: [
			{
				byteSize: thumbnailItem.size,
				checksumSha256: thumbnailSha256,
				mimeType: thumbnailItem.contentType,
				path: "thumbnail.webp",
				role: "thumbnail",
				url: "/text-assets/demo/plain@1/thumbnail.webp",
			},
			{
				byteSize: sourceItem.size,
				checksumSha256: sourceSha256,
				mimeType: sourceItem.contentType,
				path: "template.json",
				role: "source",
				url: "/text-assets/demo/plain@1/template.json",
			},
		],
		source: {
			schemaVersion: 1,
			assetId: "text-demo",
			packageId: "text-demo",
			version: 1,
			template: {
				content: "花字",
				id: "text-demo-template",
				name: "Demo",
				type: "text",
			},
		},
	});
}

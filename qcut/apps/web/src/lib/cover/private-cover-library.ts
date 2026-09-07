import { z } from "zod";
import {
	coverCachedEntrySchema,
	type CoverLibraryResult,
} from "../../../../../electron/jianying-cover-contract";

const resultSchema = z.object({
	entries: z.array(
		coverCachedEntrySchema.extend({
			previewDataUrl: z
				.string()
				.regex(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/),
		})
	),
	coverage: z.literal("observed-downloaded-subset"),
	capturedAt: z.string().nullable(),
});

export async function loadPrivateCoverLibrary(): Promise<CoverLibraryResult> {
	if (window.electronAPI?.jianyingCover) {
		return resultSchema.parse(await window.electronAPI.jianyingCover.list());
	}
	if (!import.meta.env.DEV)
		return {
			entries: [],
			coverage: "observed-downloaded-subset",
			capturedAt: null,
		};
	const response = await fetch("/__qcut/private-covers", { cache: "no-store" });
	if (!response.ok)
		throw new Error(
			"Private cover cache unavailable or failed integrity validation"
		);
	return resultSchema.parse(await response.json());
}

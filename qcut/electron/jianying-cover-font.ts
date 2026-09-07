import { z } from "zod";
import {
	readPrivateJianyingFont,
	jianyingPrivateFontRoot,
} from "./jianying-font-private-cache.js";
import {
	inspectJianyingFontBytes,
	readFontkitMetadata,
} from "./jianying-font-lab-catalog.js";
import { makeJianyingFontBrowserCompatible } from "./jianying-font-browser-compatibility.js";
import type { JianyingFontLabFontSummary } from "./jianying-font-lab-contract.js";

export const privateCoverFontRequestSchema = z
	.object({
		fontId: z.string().regex(/^sha256:[a-f\d]{64}$/),
		text: z.string().max(4096).optional(),
	})
	.strict();

export async function readPrivateCoverFont({
	request,
	root = jianyingPrivateFontRoot(),
}: {
	request: unknown;
	root?: string;
}) {
	const { fontId, text } = privateCoverFontRequestSchema.parse(request);
	const sha256 = fontId.slice(7);
	const ttf = await readPrivateJianyingFont({ sha256, format: "ttf", root });
	const bytes =
		ttf ?? (await readPrivateJianyingFont({ sha256, format: "otf", root }));
	if (!bytes)
		throw new Error("Private cover font missing or checksum mismatch");
	const font: JianyingFontLabFontSummary = {
		fontId,
		cssFamily: `QCutLocal_${sha256.slice(0, 20)}`,
		...readFontkitMetadata({ bytes }),
		format: ttf ? "ttf" : "otf",
		size: bytes.length,
		sourceKinds: ["qcut-cache"],
	};
	if (text !== undefined)
		return inspectJianyingFontBytes({
			entry: { ...font, sha256, filePaths: [] },
			bytes,
			text,
		});
	return {
		font,
		bytes: Array.from(makeJianyingFontBrowserCompatible({ bytes })),
	};
}

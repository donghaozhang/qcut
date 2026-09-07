import { z } from "zod";
import {
	coverCacheRoot,
	readCoverCatalog,
	verifyCoverFile,
} from "./jianying-cover-private-cache.js";
import {
	parseCoverTextLayout,
	resolveCoverLayoutFontDependency,
	type CoverTextLayout,
} from "./jianying-cover-layout.js";
import {
	retainCoverLayoutFont,
	retainCoverLayoutWordArt,
} from "./jianying-cover-layout-assets.js";

export const coverLayoutRequestSchema = z
	.object({ packageHash: z.string().regex(/^[a-f\d]{32}$/) })
	.strict();
const pending = new Map<string, Promise<CoverTextLayout>>();

async function prepare({
	request,
	root,
	fontRoot,
	packageRoot,
}: {
	request: unknown;
	root: string;
	fontRoot?: string;
	packageRoot?: string;
}): Promise<CoverTextLayout> {
	const { packageHash } = coverLayoutRequestSchema.parse(request);
	const catalog = await readCoverCatalog({ root });
	const entry = catalog?.entries.find(
		(value) => value.packageHash === packageHash
	);
	if (!catalog || !entry) throw new Error("Unknown cached cover template");
	const definition = JSON.parse(
		(await verifyCoverFile({ root, file: entry.definition })).toString("utf8")
	);
	const layout = parseCoverTextLayout({ definition });
	const fonts: CoverTextLayout["fonts"] = {};
	const wordArt: CoverTextLayout["wordArt"] = {};
	await layout.texts.reduce(async (previous, { text, effect }) => {
		await previous;
		const reference = text.font_path;
		if (!Object.hasOwn(fonts, reference)) {
			const dependency = resolveCoverLayoutFontDependency({
				text,
				entry,
				catalog,
			});
			fonts[reference] = await retainCoverLayoutFont({
				dependency,
				root,
				fontRoot,
			});
		}
		if (effect && !Object.hasOwn(wordArt, effect.path)) {
			const dependency = entry.dependencies.find(
				(value) => value.reference === effect.path
			);
			if (!dependency)
				throw new Error(`Cover word-art dependency missing: ${effect.name}`);
			wordArt[effect.path] = await retainCoverLayoutWordArt({
				dependency,
				effect,
				root,
				packageRoot,
			});
		}
	}, Promise.resolve());
	return { packageHash, ...layout, fonts, wordArt };
}

export function preparePrivateCoverTextLayout({
	request,
	root = coverCacheRoot(),
	fontRoot,
	packageRoot,
}: {
	request: unknown;
	root?: string;
	fontRoot?: string;
	packageRoot?: string;
}) {
	const parsed = coverLayoutRequestSchema.parse(request);
	const key = JSON.stringify([root, parsed.packageHash, fontRoot, packageRoot]);
	const active = pending.get(key);
	if (active) return active;
	const task = prepare({
		request: parsed,
		root,
		fontRoot,
		packageRoot,
	}).finally(() => pending.delete(key));
	pending.set(key, task);
	return task;
}

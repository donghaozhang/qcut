import type { JianyingLutReference } from "./native-pipeline/filters/filter-lab-lut.js";

/**
 * Resolved category catalog. Declared here rather than beside the sqlite
 * reader so consumers of the pure lookups never reach into that module.
 */
export interface JianyingFilterCategoryCatalog {
	order: string[];
	byResourceId: Map<string, string[]>;
}

/**
 * Pure lookups over already-resolved filter metadata.
 *
 * These live apart from jianying-filter-metadata.ts because that module
 * statically imports `node:sqlite`. Any runtime without it — bun, and Node
 * builds where the module is unavailable — fails to import the whole file,
 * which used to take these table lookups down with it and silently drop
 * titles and categories that the caller had already resolved.
 */

function titleKey({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	return `${resourceId}/${version}`;
}

export function findJianyingFilterTitle({
	reference,
	titles,
}: {
	reference: JianyingLutReference;
	titles: ReadonlyMap<string, string>;
}) {
	return titles.get(
		titleKey({
			resourceId: reference.resourceId,
			version: reference.version,
		})
	);
}

export function findJianyingFilterCategories({
	reference,
	catalog,
}: {
	reference: JianyingLutReference;
	catalog: JianyingFilterCategoryCatalog;
}) {
	return catalog.byResourceId.get(reference.resourceId);
}

/**
 * Wire types shared by the Filter Lab metadata utility process and its
 * main-process host. Maps travel as entry arrays so payloads stay plain
 * structured-clone-friendly objects on both sides of the MessagePort.
 */
import type {
	JianyingFilterKnownCatalog,
	JianyingFilterMetadataScan,
} from "./jianying-filter-metadata.js";
import type { JianyingLutReference } from "./native-pipeline/filters/filter-lab-lut.js";

export interface JianyingFilterMetadataScanRequest {
	type: "scan";
	references: JianyingLutReference[];
	databaseRoot?: string;
}

export interface SerializedJianyingFilterMetadataScan {
	titles: [string, string][];
	categories: { order: string[]; byResourceId: [string, string[]][] };
	knownCatalog: JianyingFilterKnownCatalog;
}

export type JianyingFilterMetadataChildMessage =
	| { type: "ready" }
	| { type: "result"; scan: SerializedJianyingFilterMetadataScan }
	| { type: "error"; message: string };

export function serializeJianyingFilterMetadataScan(
	scan: JianyingFilterMetadataScan
): SerializedJianyingFilterMetadataScan {
	return {
		titles: [...scan.titles],
		categories: {
			order: [...scan.categories.order],
			byResourceId: [...scan.categories.byResourceId],
		},
		knownCatalog: scan.knownCatalog,
	};
}

export function deserializeJianyingFilterMetadataScan(
	scan: SerializedJianyingFilterMetadataScan
): JianyingFilterMetadataScan {
	return {
		titles: new Map(scan.titles),
		categories: {
			order: [...scan.categories.order],
			byResourceId: new Map(scan.categories.byResourceId),
		},
		knownCatalog: scan.knownCatalog,
	};
}

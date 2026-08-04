/**
 * Minimal raw draft structures (JYI-004).
 *
 * These shapes claim only the fields the graph reader needs; everything
 * else stays `unknown` and flows to the foreign envelope untouched. They
 * deliberately do NOT assert full coverage of any JianYing/CapCut version.
 *
 * @module @qcut/editor-core/jianying-draft/import/raw-types
 */

export interface RawDraftTimeRange {
	start?: unknown;
	duration?: unknown;
	[key: string]: unknown;
}

export interface RawDraftSegment {
	id?: unknown;
	material_id?: unknown;
	extra_material_refs?: unknown;
	source_timerange?: unknown;
	target_timerange?: unknown;
	speed?: unknown;
	[key: string]: unknown;
}

export interface RawDraftTrack {
	id?: unknown;
	type?: unknown;
	segments?: unknown;
	[key: string]: unknown;
}

export interface RawDraftContent {
	id?: unknown;
	tracks?: unknown;
	materials?: unknown;
	duration?: unknown;
	fps?: unknown;
	version?: unknown;
	new_version?: unknown;
	platform?: unknown;
	canvas_config?: unknown;
	[key: string]: unknown;
}

export function isRawRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRawDraftContent(value: unknown): RawDraftContent | null {
	return isRawRecord(value) ? (value as RawDraftContent) : null;
}

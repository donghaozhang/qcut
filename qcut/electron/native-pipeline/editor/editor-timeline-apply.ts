import { promises as fs } from "node:fs";
import { basename } from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";
import type { EditorApiClient } from "./editor-api-client.js";
import { resolveJsonInput } from "./editor-api-types.js";
import { ensureEditorProjectReady } from "./editor-project-readiness.js";

type JsonRecord = Record<string, unknown>;

interface ManifestMedia extends JsonRecord {
	alias?: string;
	id?: string;
	mediaId?: string;
	path?: string;
	url?: string;
	filename?: string;
}

interface ManifestElement extends JsonRecord {
	alias?: string;
	id?: string;
	track?: string;
	trackId?: string;
	media?: string;
	source?: string;
	type?: string;
	startTime?: number;
	duration?: number;
	endTime?: number;
}

interface ManifestTransition extends JsonRecord {
	track?: string;
	trackId?: string;
	from?: string;
	to?: string;
	fromElementId?: string;
	toElementId?: string;
	type?: string;
	presetId?: string;
	duration?: number;
}

interface ManifestTrack extends JsonRecord {
	alias?: string;
	id?: string;
	trackId?: string;
	name?: string;
	type?: string;
	elements?: ManifestElement[];
	transitions?: ManifestTransition[];
}

interface TimelineManifest extends JsonRecord {
	projectId?: string;
	replace?: boolean;
	project?: JsonRecord;
	settings?: JsonRecord;
	media?: ManifestMedia[];
	tracks?: ManifestTrack[];
	elements?: ManifestElement[];
	transitions?: ManifestTransition[];
	export?: JsonRecord;
}

interface TimelineSnapshot {
	tracks: Array<{
		id?: string;
		index: number;
		name: string;
		type: string;
		isMain?: boolean;
		elements: Array<Record<string, unknown> & { id: string }>;
		transitions?: Array<Record<string, unknown> & { id?: string }>;
	}>;
}

interface MediaFileSummary {
	id: string;
	name?: string;
	size?: number;
}

interface ImportResult {
	index: number;
	success: boolean;
	mediaFile?: MediaFileSummary;
	error?: string;
}

const TEXT_VERIFY_KEYS = [
	"content",
	"fontSize",
	"fontFamily",
	"color",
	"backgroundColor",
	"textAlign",
	"fontWeight",
	"fontStyle",
	"textDecoration",
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
	"letterSpacing",
	"lineHeight",
	"verticalAlign",
	"strokeColor",
	"strokeWidth",
	"strokeOpacity",
	"backgroundOpacity",
	"backgroundRadius",
	"backgroundPadding",
	"shadowColor",
	"shadowOpacity",
	"shadowOffsetX",
	"shadowOffsetY",
	"shadowBlur",
	"glowColor",
	"glowOpacity",
	"glowBlur",
	"curve",
	"animationType",
	"animationDuration",
	"animationDelay",
	"keyframes",
	"blendMode",
	"trackingTargetId",
	"trackingOffsetX",
	"trackingOffsetY",
	"trackingRotation",
] as const;

const MEDIA_VERIFY_KEYS = [
	"playbackRate",
	"speedKeyframes",
	"reverse",
	"freezeFrameTime",
	"freezeFrameDuration",
] as const;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function aliasFor(
	entry: { alias?: string; id?: string },
	fallback: string
): string {
	return entry.alias?.trim() || entry.id?.trim() || fallback;
}

function mapReference(
	map: Map<string, string>,
	value: unknown
): string | undefined {
	if (typeof value !== "string" || !value.trim()) return undefined;
	return map.get(value) ?? value;
}

function valuesMatch(expected: unknown, actual: unknown): boolean {
	if (typeof expected === "number" && typeof actual === "number") {
		return Math.abs(expected - actual) < 0.001;
	}
	if (isRecord(expected) || Array.isArray(expected)) {
		return JSON.stringify(expected) === JSON.stringify(actual);
	}
	return expected === actual;
}

function expectedReadBackValue({
	expected,
	key,
}: {
	expected: ManifestElement;
	key: string;
}): unknown {
	const value = expected[key];
	if (
		key !== "duration" ||
		expected.type !== "media" ||
		typeof value !== "number"
	) {
		return value;
	}
	const trimStart =
		typeof expected.trimStart === "number" ? expected.trimStart : 0;
	const trimEnd = typeof expected.trimEnd === "number" ? expected.trimEnd : 0;
	return Math.max(0, value - trimStart - trimEnd);
}

async function resolveActiveProjectId(
	client: EditorApiClient
): Promise<string | undefined> {
	const navigator = await client.get<{ activeProjectId?: string | null }>(
		"/api/claude/navigator/projects"
	);
	return navigator.activeProjectId ?? undefined;
}

function collectElements(manifest: TimelineManifest): Array<{
	element: ManifestElement;
	trackRef?: string;
}> {
	const collected = (manifest.elements ?? []).map((element) => ({
		element,
		trackRef: element.track ?? element.trackId,
	}));
	for (const [trackIndex, track] of (manifest.tracks ?? []).entries()) {
		const trackRef = aliasFor(track, `track-${trackIndex}`);
		for (const element of track.elements ?? []) {
			collected.push({ element, trackRef });
		}
	}
	return collected;
}

function collectTransitions(manifest: TimelineManifest): ManifestTransition[] {
	const collected = [...(manifest.transitions ?? [])];
	for (const [trackIndex, track] of (manifest.tracks ?? []).entries()) {
		const trackRef = aliasFor(track, `track-${trackIndex}`);
		for (const transition of track.transitions ?? []) {
			collected.push({ ...transition, track: transition.track ?? trackRef });
		}
	}
	return collected;
}

async function importManifestMedia({
	client,
	projectId,
	media,
	mediaIds,
	newMediaIds,
}: {
	client: EditorApiClient;
	projectId: string;
	media: ManifestMedia[];
	mediaIds: Map<string, string>;
	newMediaIds: Set<string>;
}): Promise<void> {
	const existing = await client.get<MediaFileSummary[]>(
		`/api/claude/media/${encodeURIComponent(projectId)}`
	);
	const existingIds = new Set(existing.map((item) => item.id));
	const sourceSizes = await Promise.all(
		media.map(async (entry) => {
			if (!entry.path) return undefined;
			try {
				return (await fs.stat(entry.path)).size;
			} catch {
				return undefined;
			}
		})
	);
	const imports: Array<{ path?: string; url?: string; filename?: string }> = [];
	const importEntries: Array<{ entry: ManifestMedia; manifestIndex: number }> =
		[];

	for (const [index, entry] of media.entries()) {
		const alias = aliasFor(entry, `media-${index}`);
		const directId =
			entry.mediaId ?? (!entry.path && !entry.url ? entry.id : undefined);
		if (directId) {
			mediaIds.set(alias, directId);
			mediaIds.set(directId, directId);
			continue;
		}
		const expectedName =
			entry.filename ?? (entry.path ? basename(entry.path) : undefined);
		const sourceSize = sourceSizes[index];
		const reusable =
			expectedName && sourceSize !== undefined
				? existing.filter(
						(item) => item.name === expectedName && item.size === sourceSize
					)
				: [];
		if (reusable.length === 1) {
			const mediaId = reusable[0].id;
			mediaIds.set(alias, mediaId);
			mediaIds.set(mediaId, mediaId);
			if (entry.id) mediaIds.set(entry.id, mediaId);
			continue;
		}
		if (!entry.path && !entry.url) {
			throw new Error(`Media '${alias}' needs path, url, or mediaId`);
		}
		imports.push({
			path: entry.path,
			url: entry.url,
			filename: entry.filename,
		});
		importEntries.push({ entry, manifestIndex: index });
	}

	if (imports.length === 0) return;
	const results = await client.post<ImportResult[]>(
		`/api/claude/media/${encodeURIComponent(projectId)}/batch-import`,
		{ items: imports }
	);
	for (const [index, result] of results.entries()) {
		const { entry, manifestIndex } = importEntries[index];
		const alias = aliasFor(entry, `media-${manifestIndex}`);
		if (!result.success || !result.mediaFile) {
			throw new Error(
				`Media '${alias}' failed: ${result.error || "unknown error"}`
			);
		}
		const mediaId = result.mediaFile.id;
		mediaIds.set(alias, mediaId);
		mediaIds.set(mediaId, mediaId);
		if (entry.id) mediaIds.set(entry.id, mediaId);
		if (!existingIds.has(mediaId)) newMediaIds.add(mediaId);
	}
}

async function createManifestTracks({
	client,
	projectId,
	manifest,
	replace,
	trackIds,
}: {
	client: EditorApiClient;
	projectId: string;
	manifest: TimelineManifest;
	replace: boolean;
	trackIds: Map<string, string>;
}): Promise<void> {
	const basePath = `/api/claude/timeline/${encodeURIComponent(projectId)}`;
	const before = await client.get<TimelineSnapshot>(basePath);
	let preservedMainId: string | undefined;
	if (replace) {
		if (manifest.tracks?.[0]?.type !== "media") {
			throw new Error(
				"A replace manifest must start with a media track for QCut's required main track"
			);
		}
		const mainTrack = before.tracks.find((track) => track.isMain);
		if (!mainTrack?.id) {
			throw new Error("QCut did not expose its required main track");
		}
		preservedMainId = mainTrack?.id;
		if (mainTrack?.id && mainTrack.elements.length > 0) {
			for (let offset = 0; offset < mainTrack.elements.length; offset += 50) {
				const elements = mainTrack.elements
					.slice(offset, offset + 50)
					.map((element) => ({
						trackId: mainTrack.id!,
						elementId: element.id,
					}));
				const result = await client.delete<{ failedCount: number }>(
					`${basePath}/elements/batch`,
					{ elements, ripple: false }
				);
				if (result.failedCount > 0) {
					throw new Error("Failed to clear the existing main track");
				}
			}
		}
		for (const track of [...before.tracks].reverse()) {
			if (!track.id || track.id === preservedMainId) continue;
			await client.delete(
				`${basePath}/tracks/${encodeURIComponent(track.id)}`,
				{
					force: true,
				}
			);
		}
	}

	for (const [index, track] of (manifest.tracks ?? []).entries()) {
		if (!track.type) throw new Error(`Track ${index} is missing type`);
		const alias = aliasFor(track, `track-${index}`);
		const existingId = replace
			? index === 0
				? preservedMainId
				: undefined
			: (track.trackId ??
				before.tracks.find((candidate) => candidate.id === track.id)?.id);
		if (existingId) {
			await client.patch(
				`${basePath}/tracks/${encodeURIComponent(existingId)}`,
				{
					index,
					name: track.name,
				}
			);
			trackIds.set(alias, existingId);
			trackIds.set(existingId, existingId);
			continue;
		}

		const result = await client.post<{ trackId?: string }>(
			`${basePath}/tracks`,
			{
				type: track.type,
				name: track.name,
				index,
			}
		);
		if (!result.trackId)
			throw new Error(`Track '${alias}' did not return an ID`);
		trackIds.set(alias, result.trackId);
		if (track.id) trackIds.set(track.id, result.trackId);
	}
}

async function addManifestElements({
	client,
	projectId,
	manifest,
	trackIds,
	mediaIds,
	elementIds,
	expectedElements,
}: {
	client: EditorApiClient;
	projectId: string;
	manifest: TimelineManifest;
	trackIds: Map<string, string>;
	mediaIds: Map<string, string>;
	elementIds: Map<string, string>;
	expectedElements: Map<string, ManifestElement>;
}): Promise<void> {
	const collected = collectElements(manifest);
	for (let offset = 0; offset < collected.length; offset += 50) {
		const chunk = collected.slice(offset, offset + 50);
		const payload = chunk.map(({ element, trackRef }, localIndex) => {
			const alias = aliasFor(element, `element-${offset + localIndex}`);
			const resolvedTrackId = mapReference(
				trackIds,
				element.track ?? element.trackId ?? trackRef
			);
			if (!resolvedTrackId) throw new Error(`Element '${alias}' has no track`);
			if (!element.type) throw new Error(`Element '${alias}' is missing type`);
			if (typeof element.startTime !== "number") {
				throw new Error(`Element '${alias}' is missing startTime`);
			}
			const duration =
				typeof element.duration === "number"
					? element.duration
					: typeof element.endTime === "number"
						? element.endTime - element.startTime
						: undefined;
			if (typeof duration !== "number" || duration <= 0) {
				throw new Error(`Element '${alias}' needs duration > 0`);
			}

			const body: JsonRecord = {
				...element,
				trackId: resolvedTrackId,
				duration,
			};
			delete body.alias;
			delete body.id;
			delete body.track;
			delete body.media;
			delete body.source;
			const mediaRef = element.media ?? element.source;
			if (mediaRef) body.sourceId = mapReference(mediaIds, mediaRef);
			if (typeof element.mediaId === "string") {
				body.mediaId = mapReference(mediaIds, element.mediaId);
			}
			if (typeof element.sourceId === "string") {
				body.sourceId = mapReference(mediaIds, element.sourceId);
			}
			expectedElements.set(alias, { ...element, duration });
			return body;
		});

		const result = await client.post<{
			added: Array<{
				index: number;
				success: boolean;
				elementId?: string;
				error?: string;
			}>;
			failedCount: number;
		}>(`/api/claude/timeline/${encodeURIComponent(projectId)}/elements/batch`, {
			elements: payload,
		});
		if (result.failedCount > 0) {
			const failures = result.added
				.filter((item) => !item.success)
				.map((item) => item.error)
				.join("; ");
			throw new Error(`Element batch failed: ${failures}`);
		}
		for (const added of result.added) {
			const source = chunk[added.index]?.element;
			if (!source || !added.elementId) continue;
			const alias = aliasFor(source, `element-${offset + added.index}`);
			elementIds.set(alias, added.elementId);
			if (source.id) elementIds.set(source.id, added.elementId);
		}
	}
}

async function addManifestTransitions({
	client,
	projectId,
	manifest,
	trackIds,
	elementIds,
}: {
	client: EditorApiClient;
	projectId: string;
	manifest: TimelineManifest;
	trackIds: Map<string, string>;
	elementIds: Map<string, string>;
}): Promise<string[]> {
	const transitionIds: string[] = [];
	for (const [index, transition] of collectTransitions(manifest).entries()) {
		const trackId = mapReference(
			trackIds,
			transition.track ?? transition.trackId
		);
		const fromElementId = mapReference(
			elementIds,
			transition.from ?? transition.fromElementId
		);
		const toElementId = mapReference(
			elementIds,
			transition.to ?? transition.toElementId
		);
		if (!trackId || !fromElementId || !toElementId) {
			throw new Error(`Transition ${index} has unresolved track/from/to refs`);
		}
		if (!transition.type || typeof transition.duration !== "number") {
			throw new Error(`Transition ${index} needs type and duration`);
		}
		const body: JsonRecord = {
			...transition,
			fromElementId,
			toElementId,
			presetId: transition.presetId ?? transition.type,
		};
		delete body.track;
		delete body.trackId;
		delete body.from;
		delete body.to;
		const result = await client.post<{ transitionId?: string }>(
			`/api/claude/timeline/${encodeURIComponent(projectId)}/tracks/${encodeURIComponent(trackId)}/transitions`,
			body
		);
		if (!result.transitionId) throw new Error(`Transition ${index} failed`);
		transitionIds.push(result.transitionId);
	}
	return transitionIds;
}

function verifyManifest({
	timeline,
	manifest,
	trackIds,
	elementIds,
	expectedElements,
	transitionIds,
}: {
	timeline: TimelineSnapshot;
	manifest: TimelineManifest;
	trackIds: Map<string, string>;
	elementIds: Map<string, string>;
	expectedElements: Map<string, ManifestElement>;
	transitionIds: string[];
}): string[] {
	const issues: string[] = [];
	for (const [index, track] of (manifest.tracks ?? []).entries()) {
		const alias = aliasFor(track, `track-${index}`);
		const id = trackIds.get(alias);
		const actualIndex = timeline.tracks.findIndex(
			(candidate) => candidate.id === id
		);
		if (actualIndex !== index) {
			issues.push(
				`track '${alias}' expected index ${index}, got ${actualIndex}`
			);
		}
		if (actualIndex >= 0 && timeline.tracks[actualIndex].type !== track.type) {
			issues.push(`track '${alias}' type mismatch`);
		}
		if (
			actualIndex >= 0 &&
			track.name !== undefined &&
			timeline.tracks[actualIndex].name !== track.name
		) {
			issues.push(`track '${alias}' name mismatch`);
		}
	}

	const actualElements = new Map(
		timeline.tracks.flatMap((track) =>
			track.elements.map((element) => [element.id, element])
		)
	);
	for (const [alias, expected] of expectedElements) {
		const id = elementIds.get(alias);
		const actual = id ? actualElements.get(id) : undefined;
		if (!actual) {
			issues.push(`element '${alias}' is missing`);
			continue;
		}
		for (const key of [
			"startTime",
			"duration",
			"trimStart",
			"trimEnd",
			...TEXT_VERIFY_KEYS,
			...MEDIA_VERIFY_KEYS,
		]) {
			const expectedValue = expectedReadBackValue({ expected, key });
			if (expectedValue === undefined) continue;
			const actualValue =
				actual[key] ?? (actual.style as JsonRecord | undefined)?.[key];
			if (!valuesMatch(expectedValue, actualValue)) {
				issues.push(`element '${alias}' field '${key}' did not match`);
			}
		}
	}

	const actualTransitionIds = new Set(
		timeline.tracks.flatMap((track) =>
			(track.transitions ?? []).flatMap((transition) =>
				transition.id ? [transition.id] : []
			)
		)
	);
	for (const transitionId of transitionIds) {
		if (!actualTransitionIds.has(transitionId)) {
			issues.push(`transition '${transitionId}' is missing`);
		}
	}
	return issues;
}

/** Apply one declarative timeline manifest with rollback and read-back verification. */
export async function timelineApplyManifest(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.manifest) return { success: false, error: "Missing --manifest" };
	const parsed = await resolveJsonInput(opts.manifest);
	if (!isRecord(parsed))
		return { success: false, error: "Manifest must be a JSON object" };
	const manifest = parsed as TimelineManifest;
	if (!Array.isArray(manifest.tracks)) {
		return { success: false, error: "Manifest must contain a tracks array" };
	}
	const projectId =
		opts.projectId ??
		manifest.projectId ??
		(await resolveActiveProjectId(client));
	if (!projectId)
		return { success: false, error: "No active project; pass --project-id" };

	const atomic = opts.atomic !== false;
	const shouldVerify = opts.verify !== false;
	const replace = opts.replace || manifest.replace === true;
	const mediaIds = new Map<string, string>();
	const trackIds = new Map<string, string>();
	const elementIds = new Map<string, string>();
	const expectedElements = new Map<string, ManifestElement>();
	const newMediaIds = new Set<string>();
	let transactionId: string | undefined;
	let previousSettings: JsonRecord | undefined;
	let settingsChanged = false;
	let timelineMutationStarted = false;

	try {
		const readiness = await ensureEditorProjectReady({
			client,
			projectId,
			open: true,
			timeoutMs: opts.timeoutMs,
		});
		await importManifestMedia({
			client,
			projectId,
			media: Array.isArray(manifest.media) ? manifest.media : [],
			mediaIds,
			newMediaIds,
		});

		if (atomic) {
			const started = await client.post<{ transactionId: string }>(
				"/api/claude/transaction/begin",
				{ label: "Apply timeline manifest" }
			);
			transactionId = started.transactionId;
		}

		const settings = manifest.project ?? manifest.settings;
		if (settings && Object.keys(settings).length > 0) {
			timelineMutationStarted = true;
			previousSettings = await client.get<JsonRecord>(
				`/api/claude/project/${encodeURIComponent(projectId)}/settings`
			);
			await client.patch(
				`/api/claude/project/${encodeURIComponent(projectId)}/settings`,
				settings
			);
			settingsChanged = true;
		}

		timelineMutationStarted = true;
		await createManifestTracks({
			client,
			projectId,
			manifest,
			replace,
			trackIds,
		});
		await addManifestElements({
			client,
			projectId,
			manifest,
			trackIds,
			mediaIds,
			elementIds,
			expectedElements,
		});
		const transitionIds = await addManifestTransitions({
			client,
			projectId,
			manifest,
			trackIds,
			elementIds,
		});

		const timeline = await client.get<TimelineSnapshot>(
			`/api/claude/timeline/${encodeURIComponent(projectId)}`
		);
		const verificationIssues = shouldVerify
			? verifyManifest({
					timeline,
					manifest,
					trackIds,
					elementIds,
					expectedElements,
					transitionIds,
				})
			: [];
		if (verificationIssues.length > 0) {
			throw new Error(
				`Manifest verification failed: ${verificationIssues.join("; ")}`
			);
		}

		if (transactionId) {
			await client.post(
				`/api/claude/transaction/${encodeURIComponent(transactionId)}/commit`,
				{}
			);
			transactionId = undefined;
		}

		let exportJob: unknown;
		if (manifest.export?.start === true) {
			const exportRequest = { ...manifest.export };
			delete exportRequest.start;
			exportJob = await client.post(
				`/api/claude/export/${encodeURIComponent(projectId)}/start`,
				exportRequest
			);
		}

		return {
			success: true,
			data: {
				projectId,
				readiness,
				atomic,
				replaced: replace,
				verified: shouldVerify,
				media: Object.fromEntries(mediaIds),
				tracks: Object.fromEntries(trackIds),
				elements: Object.fromEntries(elementIds),
				transitionIds,
				exportConfig: manifest.export,
				exportJob,
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		let rolledBack = false;
		if (transactionId) {
			try {
				await client.post(
					`/api/claude/transaction/${encodeURIComponent(transactionId)}/rollback`,
					{ reason: message }
				);
				rolledBack = true;
			} catch {
				rolledBack = false;
			}
		}
		if (settingsChanged && previousSettings) {
			try {
				await client.patch(
					`/api/claude/project/${encodeURIComponent(projectId)}/settings`,
					previousSettings
				);
			} catch {
				// Best effort; timeline rollback remains authoritative.
			}
		}
		const cleanedMedia: string[] = [];
		if (!timelineMutationStarted || rolledBack) {
			for (const mediaId of newMediaIds) {
				try {
					await client.delete(
						`/api/claude/media/${encodeURIComponent(projectId)}/${encodeURIComponent(mediaId)}`
					);
					cleanedMedia.push(mediaId);
				} catch {
					// Keep the original failure as the command error.
				}
			}
		}
		return {
			success: false,
			error: message,
			data: { projectId, rolledBack, cleanedMedia },
		};
	}
}

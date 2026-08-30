import {
	assertStickerRuntimeDescriptor,
	evaluateStickerRuntime,
	type StickerRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import { expect } from "@playwright/test";
import type { Locator, Page } from "playwright";
import { resolveStickerGeometry } from "../../../lib/stickers/sticker-geometry";
import { ensureStickersTabActive } from "./electron-helpers";
import { runQCutPipelineCli } from "./qcut-pipeline-cli";
import type { StickerExportRuntimeDraw } from "./sticker-lab-export-runtime-trace";
import {
	readRestrictedState,
	readRuntimeCanvasEvidence,
	type RestrictedState,
	seekTimeline,
} from "./sticker-lab-lifecycle-harness";
import {
	normalizePrivateRealRuntimeDescriptor,
	normalizedPrivateRuntimeResourceName,
	PRIVATE_REAL_RUNTIME_VIDEO_PROFILE,
	type PrivateRealRuntimeCase,
} from "./sticker-lab-private-real-runtime-cases";
import { waitForEditorApiHealth } from "./sticker-lab-real-cache-lifecycle";

export const PRIVATE_REAL_RUNTIME_SPLIT_TIME_SECONDS = 1.5;
export const PRIVATE_REAL_RUNTIME_SPLIT_LEFT_SAMPLE_SECONDS = 1.45;
export const PRIVATE_REAL_RUNTIME_SPLIT_RIGHT_SAMPLE_SECONDS = 1.55;
const PROJECT_CANVAS_SIZE = { height: 1080, width: 1920 } as const;

export interface PrivateRealRuntimeSplitState {
	descriptor: StickerRuntimeDescriptor;
	state: RestrictedState;
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} is missing`);
	}
	return value as Record<string, unknown>;
}

export function persistedPrivateRealRuntimeDescriptor({
	state,
}: {
	state: RestrictedState;
}): StickerRuntimeDescriptor {
	const descriptor = state.media[0]?.metadata.stickerRuntime;
	assertStickerRuntimeDescriptor({ descriptor });
	return descriptor as StickerRuntimeDescriptor;
}

function expectedProjectResourceNames({
	runtimeCase,
	trigger,
}: {
	runtimeCase: PrivateRealRuntimeCase;
	trigger: "cli" | "ui";
}): Record<string, string> {
	return Object.fromEntries(
		runtimeCase.resources.map((resource, index) => {
			const persistedName = normalizedPrivateRuntimeResourceName({ index });
			return [
				persistedName,
				trigger === "cli"
					? `${persistedName}-${resource.fileName}`
					: resource.fileName,
			];
		})
	);
}

export function assertPrivateRealRuntimeState({
	runtimeCase,
	state,
	stickerCount,
	trigger,
}: {
	runtimeCase: PrivateRealRuntimeCase;
	state: RestrictedState;
	stickerCount: number;
	trigger: "cli" | "ui";
}): void {
	expect(state.media).toHaveLength(1);
	expect(state.stickers).toHaveLength(stickerCount);
	expect(state.runtimeResources).toHaveLength(runtimeCase.resources.length);
	const primary = state.media[0];
	expect(primary).toMatchObject({
		byteSize: runtimeCase.asset.byteSize,
		name: runtimeCase.fileName,
		type: "image",
	});
	expect(primary?.metadata).toMatchObject({
		animatedSticker: true,
		batchId: runtimeCase.batchId,
		checksumSha256: runtimeCase.asset.checksumSha256,
		itemId: runtimeCase.stickerId,
		redistribution: "prohibited",
		referenceOnly: true,
		source: "sticker-lab",
		usage: "internal-reference-only",
	});
	const descriptor = normalizePrivateRealRuntimeDescriptor({ runtimeCase });
	expect(primary?.metadata.stickerRuntime).toEqual(descriptor);
	const resourceMediaIds = requireRecord({
		label: "Sticker runtime resource map",
		value: primary?.metadata.stickerRuntimeResources,
	});
	expect(Object.keys(resourceMediaIds).sort()).toEqual(
		runtimeCase.resources.map((_, index) =>
			normalizedPrivateRuntimeResourceName({ index })
		)
	);
	const projectResourceNames = Object.fromEntries(
		state.runtimeResources.map((resource) => [
			String(resource.metadata.stickerRuntimeResourceName),
			resource.name,
		])
	);
	expect(projectResourceNames).toEqual(
		expectedProjectResourceNames({ runtimeCase, trigger })
	);

	for (const [index, expectedResource] of runtimeCase.resources.entries()) {
		const persistedName = normalizedPrivateRuntimeResourceName({ index });
		const resource = state.runtimeResources[index];
		expect(resource).toMatchObject({
			byteSize: expectedResource.asset.byteSize,
		});
		expect(resource?.metadata).toMatchObject({
			batchId: runtimeCase.batchId,
			checksumSha256: expectedResource.asset.checksumSha256,
			itemId: runtimeCase.stickerId,
			redistribution: "prohibited",
			referenceOnly: true,
			source: "sticker-runtime-resource",
			stickerRuntimeResourceName: persistedName,
			stickerRuntimeSourceUrl: expectedResource.resourceName,
			usage: "internal-reference-only",
		});
		expect(resource?.id).toBe(resourceMediaIds[persistedName]);
	}

	for (const sticker of state.stickers) {
		expect(sticker).toMatchObject({
			mediaId: primary?.id,
			stickerRuntime: descriptor,
		});
	}
}

function expectedRuntimeLabel({
	descriptor,
	sticker,
	timelineTimeSeconds,
}: {
	descriptor: StickerRuntimeDescriptor;
	sticker: RestrictedState["stickers"][number];
	timelineTimeSeconds: number;
}): string {
	const runtimeState = evaluateStickerRuntime({
		descriptor,
		timeline: {
			sourceOffsetSeconds: sticker.trimStart,
			timelineDurationSeconds:
				sticker.duration - sticker.trimStart - sticker.trimEnd,
			timelineStartSeconds: sticker.startTime,
		},
		timelineTimeSeconds,
	});
	if (!runtimeState.active) {
		throw new Error(`Runtime is inactive: ${runtimeState.reason}`);
	}
	return "frameIndex" in runtimeState
		? String(runtimeState.frameIndex)
		: runtimeState.sourceTimeInVideoSeconds.toFixed(6);
}

function runtimeCanvas({
	descriptor,
	page,
}: {
	descriptor: StickerRuntimeDescriptor;
	page: Page;
}): Locator {
	return page
		.locator(`canvas[data-sticker-runtime-kind="${descriptor.kind}"]:visible`)
		.first();
}

export async function readPrivateRealRuntimeAt({
	descriptor,
	page,
	sticker,
	timelineTimeSeconds,
}: {
	descriptor: StickerRuntimeDescriptor;
	page: Page;
	sticker: RestrictedState["stickers"][number];
	timelineTimeSeconds: number;
}): Promise<Awaited<ReturnType<typeof readRuntimeCanvasEvidence>>> {
	await seekTimeline({ page, time: timelineTimeSeconds });
	const canvas = runtimeCanvas({ descriptor, page });
	await expect(canvas).toBeVisible({ timeout: 60_000 });
	await expect(canvas).toHaveAttribute(
		"data-sticker-runtime-frame",
		expectedRuntimeLabel({ descriptor, sticker, timelineTimeSeconds })
	);
	expect(await canvas.getAttribute("data-sticker-runtime-error")).toBeNull();
	const evidence = await readRuntimeCanvasEvidence({ canvas });
	expect(evidence.width).toBeGreaterThan(1);
	expect(evidence.height).toBeGreaterThan(1);
	return evidence;
}

export async function addPrivateRealRuntimeWithUi({
	page,
	runtimeCase,
}: {
	page: Page;
	runtimeCase: PrivateRealRuntimeCase;
}): Promise<void> {
	await ensureStickersTabActive(page);
	const labEntry = page.getByTestId("sticker-reference-lab-entry");
	await expect(labEntry).toBeVisible({ timeout: 60_000 });
	await labEntry.getByRole("button", { name: "贴纸实验室" }).click();
	const category = page.getByTestId(
		`sticker-lab-category-private-${runtimeCase.categoryId}`
	);
	await expect(category).toBeVisible();
	await category.click();
	await expect(page.getByTestId("sticker-lab-reference-policy")).toContainText(
		"禁止二次分发"
	);
	const card = page.locator(
		`[data-sticker-reference-id="${runtimeCase.stickerId}"]`
	);
	await expect(card).toBeEnabled({ timeout: 60_000 });
	await expect(card).toHaveAccessibleName(
		`添加${runtimeCase.displayName}到时间线`
	);
	const preview = card.getByRole("img", {
		exact: true,
		name: runtimeCase.displayName,
	});
	await expect
		.poll(() =>
			preview.evaluate((image) => {
				const element = image as HTMLImageElement;
				return {
					complete: element.complete,
					height: element.naturalHeight,
					source: element.currentSrc,
					width: element.naturalWidth,
				};
			})
		)
		.toMatchObject({
			complete: true,
			height: expect.any(Number),
			source: expect.stringMatching(/^blob:/),
			width: expect.any(Number),
		});
	expect(
		await preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)
	).toBeGreaterThan(1);
	expect(
		await preview.evaluate((image) => (image as HTMLImageElement).naturalHeight)
	).toBeGreaterThan(1);
	await card.click();
}

export async function addPrivateRealRuntimeWithCli({
	apiPort,
	projectId,
	rootPath,
	runtimeCase,
}: {
	apiPort: number;
	projectId: string;
	rootPath: string;
	runtimeCase: PrivateRealRuntimeCase;
}): Promise<void> {
	await waitForEditorApiHealth({ apiPort });
	const evidence = await runQCutPipelineCli({
		apiPort,
		args: [
			"editor:sticker:add",
			"--project-id",
			projectId,
			"--provider",
			"sticker-lab",
			"--root",
			rootPath,
			"--batch-id",
			runtimeCase.batchId,
			"--sticker-id",
			runtimeCase.stickerId,
			"--x",
			"710",
			"--y",
			"290",
			"--width",
			"500",
			"--height",
			"500",
			"--start-time",
			"0",
			"--end-time",
			String(PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.durationSeconds),
			"--opacity",
			"1",
		],
	});
	expect(evidence.envelopes.at(-1)).toMatchObject({
		data: {
			command: "editor:sticker:add",
			data: {
				provenance: {
					batchId: runtimeCase.batchId,
					byteSize: runtimeCase.asset.byteSize,
					checksumSha256: runtimeCase.asset.checksumSha256,
					kind: "local-reference",
					rootPath,
					stickerId: runtimeCase.stickerId,
				},
				redistribution: "prohibited",
				referenceOnly: true,
				usage: "internal-reference-only",
				warning: expect.stringContaining("Do not redistribute"),
			},
		},
		status: "ok",
	});
}

export async function exercisePrivateRealRuntimeSeekAndSplit({
	page,
	runtimeCase,
	trigger,
}: {
	page: Page;
	runtimeCase: PrivateRealRuntimeCase;
	trigger: "cli" | "ui";
}): Promise<PrivateRealRuntimeSplitState> {
	const initialState = await readRestrictedState({ page });
	assertPrivateRealRuntimeState({
		runtimeCase,
		state: initialState,
		stickerCount: 1,
		trigger,
	});
	const descriptor = persistedPrivateRealRuntimeDescriptor({
		state: initialState,
	});
	const sticker = initialState.stickers[0];
	if (!sticker || sticker.duration <= PRIVATE_REAL_RUNTIME_SPLIT_TIME_SECONDS) {
		throw new Error("Runtime sticker is too short for split verification");
	}
	const initial = await readPrivateRealRuntimeAt({
		descriptor,
		page,
		sticker,
		timelineTimeSeconds: runtimeCase.seekTimes.initial,
	});
	const changed = await readPrivateRealRuntimeAt({
		descriptor,
		page,
		sticker,
		timelineTimeSeconds: runtimeCase.seekTimes.changed,
	});
	expect(changed.frame).not.toBe(initial.frame);
	expect(changed.pixelHash).not.toBe(initial.pixelHash);

	const timelineSticker = page.locator(
		'[data-testid="timeline-track"][data-track-type="sticker"] [data-testid="timeline-element"]'
	);
	await expect(timelineSticker).toHaveCount(1);
	await seekTimeline({ page, time: PRIVATE_REAL_RUNTIME_SPLIT_TIME_SECONDS });
	await timelineSticker.first().click({ position: { x: 24, y: 12 } });
	await expect(page.getByTestId("split-clip-button")).toBeEnabled();
	await page.getByTestId("split-clip-button").click();
	await expect(timelineSticker).toHaveCount(2);
	const splitState = await readRestrictedState({ page });
	assertPrivateRealRuntimeState({
		runtimeCase,
		state: splitState,
		stickerCount: 2,
		trigger,
	});
	expect(
		splitState.stickers.map(({ startTime, trimEnd, trimStart }) => ({
			startTime,
			trimEnd,
			trimStart,
		}))
	).toEqual([
		{
			startTime: 0,
			trimEnd: sticker.duration - PRIVATE_REAL_RUNTIME_SPLIT_TIME_SECONDS,
			trimStart: 0,
		},
		{
			startTime: PRIVATE_REAL_RUNTIME_SPLIT_TIME_SECONDS,
			trimEnd: 0,
			trimStart: PRIVATE_REAL_RUNTIME_SPLIT_TIME_SECONDS,
		},
	]);
	const leftSticker = splitState.stickers[0];
	const rightSticker = splitState.stickers[1];
	if (!leftSticker || !rightSticker) {
		throw new Error("Split runtime stickers are missing");
	}
	const left = await readPrivateRealRuntimeAt({
		descriptor,
		page,
		sticker: leftSticker,
		timelineTimeSeconds: PRIVATE_REAL_RUNTIME_SPLIT_LEFT_SAMPLE_SECONDS,
	});
	const right = await readPrivateRealRuntimeAt({
		descriptor,
		page,
		sticker: rightSticker,
		timelineTimeSeconds: PRIVATE_REAL_RUNTIME_SPLIT_RIGHT_SAMPLE_SECONDS,
	});
	expect(right.frame).not.toBe(left.frame);
	expect(right.pixelHash).not.toBe(left.pixelHash);
	return { descriptor, state: splitState };
}

export function normalizedPrivateRuntimeStickerRegion({
	state,
}: {
	state: RestrictedState;
}): { height: number; width: number; x: number; y: number } {
	const sticker = state.stickers[0];
	if (!sticker) throw new Error("Sticker evidence element is missing");
	const { height, width, x, y } = sticker;
	if (
		typeof height !== "number" ||
		typeof width !== "number" ||
		typeof x !== "number" ||
		typeof y !== "number"
	) {
		throw new Error("Sticker evidence geometry is incomplete");
	}
	const resolved = resolveStickerGeometry({
		canvasHeight: PROJECT_CANVAS_SIZE.height,
		canvasWidth: PROJECT_CANVAS_SIZE.width,
		position: { x, y },
		size: { height, width },
	});
	return {
		height: resolved.pixelHeight / PROJECT_CANVAS_SIZE.height,
		width: resolved.pixelWidth / PROJECT_CANVAS_SIZE.width,
		x: resolved.left / PROJECT_CANVAS_SIZE.width,
		y: resolved.top / PROJECT_CANVAS_SIZE.height,
	};
}

export function assertPrivateRuntimeExportDraws({
	draws,
	runtimeCase,
	state,
}: {
	draws: StickerExportRuntimeDraw[];
	runtimeCase: PrivateRealRuntimeCase;
	state: RestrictedState;
}): void {
	const activeStickerSeconds = state.stickers.reduce(
		(total, sticker) =>
			total + sticker.duration - sticker.trimStart - sticker.trimEnd,
		0
	);
	const expectedFrames =
		activeStickerSeconds * PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.frameRate;
	expect(draws.length).toBeGreaterThanOrEqual(expectedFrames - 5);
	expect(draws.length).toBeLessThanOrEqual(expectedFrames + 5);
	for (const draw of draws) {
		expect(["HTMLCanvasElement", "HTMLImageElement", "VideoFrame"]).toContain(
			draw.sourceKind
		);
		expect(draw.sourceWidth).toBe(runtimeCase.runtimeCanvasSize.width);
		expect(draw.sourceHeight).toBe(runtimeCase.runtimeCanvasSize.height);
	}
	expect(draws.some(({ alphaPixelRatio }) => alphaPixelRatio > 0)).toBe(true);
	const dynamicWindowHashes = new Set(
		draws
			.filter((draw, index) => {
				const frameIndex = draw.outputFrameIndex ?? index;
				return frameIndex / PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.frameRate <= 2.8;
			})
			.map(({ pixelHash }) => pixelHash)
	);
	expect(dynamicWindowHashes.size).toBeGreaterThan(1);
	if (runtimeCase.kind === "alpha-video") {
		const nearEndFrame = Math.round(
			PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.times.nearEnd *
				PRIVATE_REAL_RUNTIME_VIDEO_PROFILE.frameRate
		);
		const nearEndDraw = draws.find(
			({ outputFrameIndex }) => outputFrameIndex === nearEndFrame
		);
		expect(nearEndDraw?.alphaPixelRatio).toBeGreaterThan(0);
	}
}

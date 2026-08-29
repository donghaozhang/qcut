import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocaleStore } from "@/stores/locale-store";
import type {
	JianyingMusicLabBatchResult,
	JianyingMusicLabBatchSummary,
	JianyingMusicLabListResult,
	JianyingMusicLabTrackSummary,
} from "@/types/electron";
import { MusicLabPanel } from "../music-lab";

const tracks: JianyingMusicLabTrackSummary[] = [
	{
		trackId: "7376283782371969061",
		title: "Groovy hammond",
		author: "Royaltyfreemusicforvideos",
		album: "",
		durationSeconds: 101,
		genres: ["布鲁斯"],
		paidType: "subscribe",
		copyrighted: true,
		isCommerce: false,
		byteSize: 1_650_469,
		checksumSha256: "a".repeat(64),
		observedAt: "2026-08-29 05:54:31",
	},
	{
		trackId: "7553544962089175067",
		title: "所念皆星河 钢琴演奏",
		author: "兮沐",
		album: "",
		durationSeconds: 220,
		genres: ["轻音乐"],
		paidType: "subscribe",
		copyrighted: true,
		isCommerce: false,
		byteSize: 3_575_354,
		checksumSha256: "b".repeat(64),
		observedAt: "2026-08-29 05:54:31",
	},
];

const result: JianyingMusicLabListResult = {
	refreshedAt: "2026-08-29T06:00:00.000Z",
	cacheDirectory: "/tmp/qcut-music-lab",
	tracks,
	stats: {
		sourceAvailable: true,
		databaseCount: 1,
		metadataSongCount: 50,
		downloadRecordCount: 532,
		matchedTrackCount: 2,
		cachedTrackCount: 2,
		unmatchedDownloadCount: 530,
		invalidDownloadRecordCount: 0,
		copiedTrackCount: 2,
		reusedTrackCount: 0,
	},
	batchCount: 0,
	latestBatch: null,
};

const batchSummary: JianyingMusicLabBatchSummary = {
	batchId: "20260829T060000Z-recommended",
	startedAt: "2026-08-29T06:00:00.000Z",
	completedAt: "2026-08-29T06:00:10.000Z",
	sourceEndpointKey: "a".repeat(32),
	sourceObservedAt: "2026-08-29 05:54:31",
	requestedCount: 20,
	eligibleCount: 47,
	attemptedCount: 20,
	newTrackCount: 20,
	downloadedPayloadCount: 19,
	sharedPayloadCount: 1,
	failedCount: 0,
	remainingEligibleCount: 27,
	totalCachedTrackCount: 22,
};

const batchResult: JianyingMusicLabBatchResult = {
	catalog: {
		...result,
		batchCount: 1,
		latestBatch: batchSummary,
	},
	batch: batchSummary,
};

function renderPanel({
	loadTrack = vi.fn(async () => ({
		mimeType: "audio/mpeg" as const,
		bytes: new Uint8Array([73, 68, 51]),
	})),
	onCacheNextBatch = vi.fn(async () => batchResult),
	onRefresh = vi.fn(async () => undefined),
	onRevealCache = vi.fn(async () => true),
	panelResult = result,
}: {
	loadTrack?: ({ trackId }: { trackId: string }) => Promise<{
		mimeType: "audio/mpeg";
		bytes: Uint8Array;
	}>;
	onCacheNextBatch?: () => Promise<JianyingMusicLabBatchResult>;
	onRefresh?: () => Promise<void>;
	onRevealCache?: () => Promise<boolean>;
	panelResult?: JianyingMusicLabListResult;
} = {}) {
	render(
		<MusicLabPanel
			error={null}
			isBatchCaching={false}
			isLoading={false}
			loadTrack={loadTrack}
			onBeforePlay={vi.fn()}
			onCacheNextBatch={onCacheNextBatch}
			onRefresh={onRefresh}
			onRevealCache={onRevealCache}
			result={panelResult}
		/>
	);
	return { loadTrack, onCacheNextBatch, onRefresh, onRevealCache };
}

describe("MusicLabPanel", () => {
	beforeEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("shows only verified local references with rights and cache diagnostics", () => {
		renderPanel();

		expect(screen.getByRole("heading", { name: "音乐实验室" })).toBeVisible();
		expect(screen.getByText("Groovy hammond")).toBeVisible();
		expect(screen.getByText("所念皆星河 钢琴演奏")).toBeVisible();
		expect(screen.getByText("本次精确匹配 2 首")).toBeVisible();
		expect(screen.getByText("另有 530 条音效或旧缓存")).toBeVisible();
		expect(screen.getByText("仅限本地参照 · 禁止分发")).toBeVisible();
		expect(screen.getAllByText("会员")).toHaveLength(2);
		expect(screen.getAllByText("有版权")).toHaveLength(2);
		expect(screen.queryByText("添加到时间线")).not.toBeInTheDocument();
	});

	it("filters cached tracks by genre and search", () => {
		renderPanel();

		fireEvent.click(screen.getByRole("button", { name: "布鲁斯" }));
		expect(screen.getByText("Groovy hammond")).toBeVisible();
		expect(screen.queryByText("所念皆星河 钢琴演奏")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "全部风格" }));
		fireEvent.change(screen.getByLabelText("搜索音乐实验室"), {
			target: { value: "兮沐" },
		});
		expect(screen.getByText("所念皆星河 钢琴演奏")).toBeVisible();
		expect(screen.queryByText("Groovy hammond")).not.toBeInTheDocument();
	});

	it("refreshes and reveals the QCut-owned cache", async () => {
		const { onRefresh, onRevealCache } = renderPanel();

		fireEvent.click(screen.getByRole("button", { name: "刷新缓存" }));
		await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
		fireEvent.click(screen.getByRole("button", { name: "打开缓存文件夹" }));
		await waitFor(() => expect(onRevealCache).toHaveBeenCalledOnce());
	});

	it("caches the next fixed-size batch and shows its checkpoint", async () => {
		const { onCacheNextBatch } = renderPanel({
			panelResult: batchResult.catalog,
		});

		fireEvent.click(screen.getByRole("button", { name: "缓存下一批" }));
		await waitFor(() => expect(onCacheNextBatch).toHaveBeenCalledOnce());
		expect(screen.getByText("上批新增 20 首，当前页还剩 27 首")).toBeVisible();
	});

	it("loads audio bytes only when preview starts", async () => {
		const play = vi.fn(async () => undefined);
		class MockAudio {
			onended: (() => void) | null = null;
			onerror: (() => void) | null = null;
			pause = vi.fn();
			play = play;
		}
		vi.stubGlobal("Audio", MockAudio);
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:music-lab"),
			revokeObjectURL: vi.fn(),
		});
		const loadTrack = vi.fn(async () => ({
			mimeType: "audio/mpeg" as const,
			bytes: new Uint8Array([73, 68, 51]),
		}));
		renderPanel({ loadTrack });

		fireEvent.click(
			screen.getAllByRole("button", { name: "试听本地缓存音乐" })[0]
		);
		await waitFor(() =>
			expect(loadTrack).toHaveBeenCalledWith({
				trackId: "7376283782371969061",
			})
		);
		expect(play).toHaveBeenCalledOnce();
	});
});

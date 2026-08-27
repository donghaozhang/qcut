import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

type PlaybackProbeWindow = Window & {
	__soundEffectsLabTestAudio?: HTMLMediaElement[];
};

export async function openSoundEffectsLab({
	page,
}: {
	page: Page;
}): Promise<void> {
	const entry = page
		.locator('button[title="剪映参照目录"], button[title="Jianying reference"]')
		.first();
	if ((await entry.count()) === 0) {
		const group = page
			.locator('button[title="音效实验室"], button[title="Sound Effects Lab"]')
			.first();
		await group.scrollIntoViewIfNeeded();
		await expect(group).toBeVisible();
		if ((await group.getAttribute("aria-expanded")) === "false") {
			await group.click();
		}
	}
	await entry.scrollIntoViewIfNeeded();
	await expect(entry).toBeVisible();
	await entry.click();
}

export async function installSoundEffectsPlaybackProbe({
	page,
}: {
	page: Page;
}) {
	await page.evaluate(() => {
		const target = window as PlaybackProbeWindow;
		if (target.__soundEffectsLabTestAudio) return;
		target.__soundEffectsLabTestAudio = [];
		const originalPlay = HTMLMediaElement.prototype.play;
		HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
			target.__soundEffectsLabTestAudio?.push(this);
			return originalPlay.call(this);
		};
	});
}

export async function readSoundEffectsPlaybackProbe({ page }: { page: Page }) {
	return page.evaluate(() => {
		const media = (window as PlaybackProbeWindow).__soundEffectsLabTestAudio
			?.filter((item) => item instanceof HTMLAudioElement)
			.at(-1);
		return {
			currentTime: media?.currentTime ?? 0,
			duration: media?.duration ?? 0,
			error: media?.error?.code ?? null,
			blobSource: media?.currentSrc.startsWith("blob:") ?? false,
			readyState: media?.readyState ?? 0,
		};
	});
}

export async function readSoundEffectsOfflineProof({ page }: { page: Page }) {
	return page.evaluate(async () => {
		const readStore = <T>({
			databaseName,
			storeName,
			keysOnly = false,
		}: {
			databaseName: string;
			storeName: string;
			keysOnly?: boolean;
		}) =>
			new Promise<T[]>((resolve, reject) => {
				const request = indexedDB.open(databaseName);
				request.onerror = () => reject(new Error("Unable to open cache"));
				request.onsuccess = () => {
					const database = request.result;
					const store = database.transaction(storeName).objectStore(storeName);
					const read = keysOnly ? store.getAllKeys() : store.getAll();
					read.onerror = () => {
						database.close();
						reject(new Error("Unable to inspect cache"));
					};
					read.onsuccess = () => {
						database.close();
						resolve(read.result as T[]);
					};
				};
			});
		const [packs, keys] = await Promise.all([
			readStore<{ catalogId: string; itemCount: number; totalBytes: number }>({
				databaseName: "qcut-sound-effects-lab-offline",
				storeName: "packs",
			}),
			readStore<string>({
				databaseName: "qcut-asset-resources",
				storeName: "files",
				keysOnly: true,
			}),
		]);
		const pack = packs[0];
		return {
			catalogId: pack?.catalogId,
			itemCount: pack?.itemCount,
			totalBytes: pack?.totalBytes,
			uniquePayloads: keys.filter((key) => key.includes("sound-effects-lab:"))
				.length,
		};
	});
}

export async function verifySoundEffectsOfflinePlayback({
	page,
	lab,
	evidenceDirectory,
}: {
	page: Page;
	lab: Locator;
	evidenceDirectory: string;
}) {
	let offlinePhase = false;
	let offlineAssetRequests = 0;
	page.on("request", (request) => {
		if (
			offlinePhase &&
			request.url().includes("/api/sound-effects-lab/assets")
		) {
			offlineAssetRequests += 1;
		}
	});
	const search = lab.getByRole("textbox", {
		name: /搜索音效实验室|Search Sound Effects Lab/,
	});
	await installSoundEffectsPlaybackProbe({ page });
	await search.fill("俏皮明亮配乐2");
	const originalCard = lab.getByTestId(
		"audio-library-item-sound-effect--900001542"
	);
	await expect(originalCard).toBeVisible({ timeout: 30_000 });
	await originalCard
		.getByRole("button", {
			name: /试听俏皮明亮配乐2|Preview 俏皮明亮配乐2/,
		})
		.click();
	await expect
		.poll(
			async () => (await readSoundEffectsPlaybackProbe({ page })).currentTime
		)
		.toBeGreaterThan(0.5);
	const onlinePlayback = await readSoundEffectsPlaybackProbe({ page });
	expect(onlinePlayback).toMatchObject({ error: null, blobSource: true });
	await page.screenshot({
		path: path.join(evidenceDirectory, "02-new-original-playing.png"),
		animations: "disabled",
	});
	await page.mouse.move(1450, 850);
	const offlineDownloadStartedAt = Date.now();
	await lab
		.getByRole("button", { name: /离线下载|Download offline/, exact: true })
		.click();
	await expect(lab.getByText(/\d+\/1731/)).toBeVisible();
	await page.screenshot({
		path: path.join(evidenceDirectory, "03-offline-download-progress.png"),
		animations: "disabled",
	});
	await expect(lab.getByText(/已离线|Available offline/)).toBeVisible({
		timeout: 600_000,
	});
	const offlineProof = await readSoundEffectsOfflineProof({ page });
	const offlineDownloadSeconds = (Date.now() - offlineDownloadStartedAt) / 1000;
	expect(offlineProof).toEqual({
		catalogId: "qcut-sfx-library-2026-08-27",
		itemCount: 1736,
		totalBytes: 316060647,
		uniquePayloads: 1731,
	});
	await page.screenshot({
		path: path.join(evidenceDirectory, "04-offline-pack-complete.png"),
		animations: "disabled",
	});
	offlinePhase = true;
	await page.context().setOffline(true);
	await page.reload();
	await page.getByTestId("audio-panel-tab").click();
	await openSoundEffectsLab({ page });
	await expect(lab.getByText(/离线目录|Offline catalog/)).toBeVisible({
		timeout: 60_000,
	});
	await installSoundEffectsPlaybackProbe({ page });
	await search.fill("俏皮明亮配乐2");
	await originalCard
		.getByRole("button", {
			name: /试听俏皮明亮配乐2|Preview 俏皮明亮配乐2/,
		})
		.click();
	await expect
		.poll(
			async () => (await readSoundEffectsPlaybackProbe({ page })).currentTime
		)
		.toBeGreaterThan(0.5);
	const offlinePlayback = await readSoundEffectsPlaybackProbe({ page });
	expect(offlinePlayback).toMatchObject({ error: null, blobSource: true });
	await page.screenshot({
		path: path.join(evidenceDirectory, "05-original-playing-offline.png"),
		animations: "disabled",
	});
	await search.fill("键盘打字长音效2");
	const aliasCard = lab.getByTestId(
		"audio-library-item-sound-effect--900001423"
	);
	await expect(aliasCard).toBeVisible();
	await aliasCard
		.getByRole("button", {
			name: /试听键盘打字长音效2|Preview 键盘打字长音效2/,
		})
		.click();
	await expect
		.poll(
			async () => (await readSoundEffectsPlaybackProbe({ page })).currentTime
		)
		.toBeGreaterThan(0.5);
	expect(offlineAssetRequests).toBe(0);
	await page.screenshot({
		path: path.join(evidenceDirectory, "06-alias-playing-offline.png"),
		animations: "disabled",
	});
	offlinePhase = false;
	await page.context().setOffline(false);
	return {
		onlinePlayback,
		offlinePlayback,
		offlineDownloadSeconds,
		offlineProof,
		offlineAssetRequests,
	};
}

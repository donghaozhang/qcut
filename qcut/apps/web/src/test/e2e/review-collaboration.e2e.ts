import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { ReviewPackage } from "@qcut/editor-core/collaboration";
import {
	createTestProject,
	expect,
	test,
	waitForProjectLoad,
} from "./helpers/electron-helpers";
import { installHttpsMediaFixture } from "./helpers/https-media-fixture";
import {
	installReviewApiMock,
	readReviewApiMockState,
	seedReviewApiMock,
} from "./helpers/review-api-mock";

const artifactDirectory = path.resolve(
	process.cwd(),
	"output/playwright/review-collaboration"
);
const videoFixture = path.resolve(
	process.cwd(),
	"apps/web/src/test/e2e/fixtures/media/sample-video-browser.mp4"
);
const reviewToken = "e2e-review-token-123456789";
const reviewShareUrl = `https://qcut.app/#/review/${reviewToken}`;

async function waitForStablePaint({ page }: { page: Page }) {
	await page.mouse.move(1, 1);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			})
	);
	await page.waitForTimeout(750);
}

interface ReviewHarnessWindow extends Window {
	__copiedReviewLink?: string;
	__projectStore: {
		getState: () => {
			activeProject?: { id: string; name: string };
		};
	};
}

test("syncs a review link and collaborates on the public video page", async ({
	electronApp,
	page,
}) => {
	test.setTimeout(120_000);
	await mkdir(artifactDirectory, { recursive: true });
	await page.setViewportSize({ width: 1600, height: 1000 });

	await installReviewApiMock({
		page,
		reviewToken,
		shareUrl: reviewShareUrl,
	});

	await createTestProject(page, "Review Collaboration E2E");
	const project = await page.evaluate(() => {
		const harness = window as ReviewHarnessWindow;
		const activeProject = harness.__projectStore.getState().activeProject;
		if (!activeProject) throw new Error("Expected an active project");
		return activeProject;
	});
	const initialReviewPackage: ReviewPackage = {
		comments: [],
		createdAt: Date.now(),
		project: {
			duration: 5,
			id: project.id,
			mediaUrl: "https://cdn.qcut.test/review-video.mp4",
			name: project.name,
		},
		version: 1,
	};
	await seedReviewApiMock({
		page,
		state: { package: initialReviewPackage, revision: 1 },
	});
	await page.evaluate(
		({ projectId, token }) => {
			localStorage.setItem(
				`qcut-cloud-review:v1:${encodeURIComponent(projectId)}`,
				JSON.stringify({
					projectId,
					revision: 1,
					token,
					url: `https://qcut.app/#/review/${token}`,
				})
			);
		},
		{ projectId: project.id, token: reviewToken }
	);
	await page.reload();
	await waitForProjectLoad(page);
	await page.evaluate(() => {
		const harness = window as ReviewHarnessWindow;
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: async (value: string) => {
					harness.__copiedReviewLink = value;
				},
			},
		});
	});

	await page.getByTestId("review-panel-trigger").click();
	await expect(page.getByTestId("review-cloud-link")).toContainText(
		"同步并复制链接"
	);
	await page
		.getByRole("textbox", { name: "Review comment", exact: true })
		.fill("开头节奏再快一点");
	await page.getByRole("button", { name: "添加评论" }).click();
	await expect(page.getByText("开头节奏再快一点")).toBeVisible();
	await page.getByTestId("review-cloud-link").click();
	await expect
		.poll(async () => (await readReviewApiMockState({ page })).revision)
		.toBe(2);
	await page.waitForTimeout(500);
	const syncError = page.getByTestId("review-cloud-sync-error");
	if (await syncError.isVisible()) {
		throw new Error(
			`Review sync failed: ${await syncError.getAttribute("title")}`
		);
	}
	const storedRevision = await page.evaluate((projectId) => {
		const raw = localStorage.getItem(
			`qcut-cloud-review:v1:${encodeURIComponent(projectId)}`
		);
		return raw ? (JSON.parse(raw) as { revision?: number }).revision : null;
	}, project.id);
	expect(storedRevision).toBe(2);
	await expect(page.getByTestId("review-cloud-version")).toContainText("v2");
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as ReviewHarnessWindow).__copiedReviewLink ?? ""
			)
		)
		.toContain(reviewToken);
	await page.screenshot({
		path: path.join(artifactDirectory, "01-editor-review-link.png"),
		animations: "disabled",
	});

	await installHttpsMediaFixture({
		electronApp,
		fixturePath: videoFixture,
		mediaUrl: "https://cdn.qcut.test/review-video.mp4",
	});
	await page.evaluate((token) => {
		window.location.hash = `#/review/${token}`;
	}, reviewToken);
	await expect(page.getByTestId("public-review-page")).toBeVisible();
	const video = page.getByTestId("public-review-video");
	await expect(video).toBeVisible();
	await expect
		.poll(() => video.evaluate((element) => element.readyState))
		.toBeGreaterThan(0);
	await expect(page.getByTestId("public-review-duration")).toHaveText(
		"00:00:05:00"
	);
	await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
		timeout: 8_000,
	});
	await waitForStablePaint({ page });
	await page.screenshot({
		path: path.join(artifactDirectory, "02-public-video-review.png"),
		animations: "disabled",
	});

	const reviewTime = page.getByLabel("Review time");
	await reviewTime.evaluate((element) => {
		const input = element as HTMLInputElement;
		const valueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value"
		)?.set;
		if (!valueSetter)
			throw new Error("Range input value setter is unavailable");
		valueSetter.call(input, "2.5");
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
	await expect(reviewTime).toHaveValue("2.5");
	await expect(page.getByTestId("public-review-current-time")).toHaveText(
		"00:00:02:15"
	);
	await expect
		.poll(() => video.evaluate((element) => element.currentTime))
		.toBeCloseTo(2.5, 1);
	await expect
		.poll(() => video.evaluate((element) => element.readyState))
		.toBeGreaterThanOrEqual(2);
	await page.getByLabel("Reviewer name").fill("导演");
	await page
		.getByRole("textbox", { name: "Review comment", exact: true })
		.fill("这里换成近景并保留环境声");
	await page.getByRole("button", { name: "添加评论" }).click();
	await expect(page.getByText("这里换成近景并保留环境声")).toBeVisible();
	await expect(page.getByTestId("public-review-version")).toContainText("v3");
	await expect(page.getByRole("button", { name: "添加评论" })).toBeDisabled();
	await expect
		.poll(() => video.evaluate((element) => element.readyState))
		.toBeGreaterThanOrEqual(2);
	await waitForStablePaint({ page });
	await page.screenshot({
		path: path.join(artifactDirectory, "03-public-comment-added.png"),
	});

	const publicComment = page
		.getByTestId("public-review-comments")
		.locator("div")
		.filter({ hasText: "这里换成近景并保留环境声" })
		.first();
	await publicComment.getByRole("button", { name: "Resolve comment" }).click();
	await expect(
		publicComment.locator("p.line-through", {
			hasText: "这里换成近景并保留环境声",
		})
	).toBeVisible();
	await expect(page.getByTestId("public-review-version")).toContainText("v4");
	await expect(page.getByRole("button", { name: "添加评论" })).toBeDisabled();
	await waitForStablePaint({ page });
	await page.waitForTimeout(1_500);
	await page.screenshot({
		path: path.join(artifactDirectory, "04-public-comment-resolved.png"),
	});

	const finalServer = await readReviewApiMockState({ page });
	expect(finalServer.revision).toBe(4);
	expect(
		finalServer.package?.comments.find(
			(comment) => comment.text === "这里换成近景并保留环境声"
		)?.resolved
	).toBe(true);
	expect(
		finalServer.package?.comments.find(
			(comment) => comment.text === "这里换成近景并保留环境声"
		)?.time
	).toBeCloseTo(2.5, 1);
});

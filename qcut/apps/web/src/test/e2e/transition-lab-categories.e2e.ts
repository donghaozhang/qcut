import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "@playwright/test";
import { createTestProject, expect, test } from "./helpers/electron-helpers";

const categories = [
	{ label: "AI 一镜到底", count: 5 },
	{ label: "叠化", count: 5 },
	{ label: "分割", count: 5 },
	{ label: "故障", count: 5 },
	{ label: "光效", count: 5 },
	{ label: "互动 emoji", count: 5 },
	{ label: "幻灯片", count: 7 },
	{ label: "模糊", count: 5 },
	{ label: "扭曲", count: 5 },
	{ label: "拍摄", count: 5 },
	{ label: "运镜", count: 5 },
	{ label: "自然", count: 5 },
	{ label: "综艺", count: 5 },
	{ label: "MG 动画", count: 5 },
] as const;

async function assertCategory({
	view,
	index,
}: {
	view: Locator;
	index: number;
}): Promise<void> {
	const category = categories[index];
	if (!category) return;
	const tab = view.getByRole("tab", {
		name: new RegExp(`${category.label}\\s+${category.count}`),
	});
	await expect(tab).toBeVisible();
	await tab.click();
	await expect(view.getByText(`${category.count} 个转场`)).toBeVisible();
	await expect(view.locator('[data-testid^="transition-card-"]')).toHaveCount(
		category.count
	);
	await assertCategory({ view, index: index + 1 });
}

test("matches Jianying categories and exposes at least five cards per category", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await createTestProject(page, "Transition Lab Categories E2E");
	await page.getByTestId("transitions-panel-tab").click();
	const view = page.getByTestId("transitions-view");
	await expect(view).toBeVisible();
	await view.getByRole("button", { name: "转场实验室", exact: true }).click();

	await expect(view.getByText("72 个转场")).toBeVisible();
	await expect(view.getByRole("tab")).toHaveCount(15);
	await expect(view.getByRole("tab", { name: /全部\s+72/ })).toBeVisible();
	await assertCategory({ view, index: 0 });

	const screenshotDirectory = path.resolve(
		process.cwd(),
		"output/playwright/transition-lab"
	);
	await mkdir(screenshotDirectory, { recursive: true });
	await page.screenshot({
		path: path.join(screenshotDirectory, "jianying-categories.png"),
		animations: "disabled",
	});
});

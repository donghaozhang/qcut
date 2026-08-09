import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Locator } from "@playwright/test";
import { createTestProject, expect, test } from "./helpers/electron-helpers";

const categories = [
	{ label: "叠化", count: 40 },
	{ label: "分割", count: 40 },
	{ label: "故障", count: 40 },
	{ label: "光效", count: 40 },
	{ label: "互动 emoji", count: 40 },
	{ label: "幻灯片", count: 40 },
	{ label: "模糊", count: 40 },
	{ label: "扭曲", count: 40 },
	{ label: "拍摄", count: 40 },
	{ label: "运镜", count: 40 },
	{ label: "自然", count: 40 },
	{ label: "综艺", count: 40 },
	{ label: "MG 动画", count: 40 },
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
	await assertCategory({ view, index: index + 1 });
}

test("indexes 520 local Jianying transitions with real lazy previews", async ({
	page,
}) => {
	test.setTimeout(240_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	await createTestProject(page, "Transition Lab Categories E2E");
	await page.getByTestId("transitions-panel-tab").click();
	const view = page.getByTestId("transitions-view");
	await expect(view).toBeVisible();
	await view.getByRole("button", { name: "转场实验室", exact: true }).click();

	await expect(view.getByText("526 个转场", { exact: true })).toBeVisible();
	await expect(view.getByRole("tab", { name: /全部\s+526/ })).toBeVisible();
	await expect(
		view.getByRole("tab", { name: /QCut Shader\s+6/ })
	).toBeVisible();
	const localSourceTab = view.getByRole("tab", {
		name: /本机剪映\s+520/,
	});
	await expect(localSourceTab).toBeVisible();
	await localSourceTab.click();
	await expect(view.getByText("520 个转场", { exact: true })).toBeVisible();
	await expect(view.getByRole("tab", { name: /全部\s+520/ })).toBeVisible();
	await assertCategory({ view, index: 0 });

	await view.getByRole("tab", { name: /运镜\s+40/ }).click();
	const search = view.getByRole("textbox", { name: "搜索转场" });
	await search.fill("7049979667406656014");
	await expect(
		view.getByTestId("transition-card-jianying-local-3d-space")
	).toBeVisible();
	await search.clear();
	await expect(
		view.locator('video[aria-label$="本机动画预览"]').first()
	).toBeVisible({ timeout: 120_000 });

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

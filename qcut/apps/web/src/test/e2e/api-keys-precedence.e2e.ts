import {
	test,
	expect,
	_electron as electron,
	type ElectronApplication,
	type Page,
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(__dirname, "../../../../..");
const electronMainPath = path.join(appRoot, "electron/dist/main.js");
const environmentOneLiner = "Set in your shell or `.env` - highest priority.";

let electronApp: ElectronApplication | undefined;
let page: Page | undefined;

async function openEditor({ targetPage }: { targetPage: Page }) {
	if (/\/editor\//.test(targetPage.url())) {
		return;
	}

	const existingProject = targetPage.locator(
		'[data-testid="project-list-item"]'
	);
	if ((await existingProject.count()) > 0) {
		await existingProject.first().click();
		await targetPage.waitForURL(/.*editor.*/);
		return;
	}

	const createProject = targetPage
		.locator(
			'[data-testid="new-project-button"], [data-testid="new-project-button-empty-state"], [data-testid="create-project-tile"]'
		)
		.first();

	if (!(await createProject.isVisible())) {
		test.skip(true, "No existing project or project creation control found.");
		return;
	}

	await createProject.click();
	await targetPage.waitForURL(/.*editor.*/);
}

test.describe("API keys precedence UX", () => {
	test.skip(
		!fs.existsSync(electronMainPath),
		"Electron build output is missing; run the Electron build before this smoke."
	);

	test.beforeAll(async () => {
		electronApp = await electron.launch({
			args: [electronMainPath],
			cwd: appRoot,
			env: {
				...process.env,
				FAL_KEY: "test-env-value",
			},
		});

		page = await electronApp.firstWindow();
		await page.waitForLoadState("domcontentloaded");
	});

	test.afterAll(async () => {
		await electronApp?.close();
	});

	test("surfaces precedence, shadow warning, and save feedback", async () => {
		if (!page) {
			test.skip(true, "Electron page did not initialize.");
			return;
		}

		await openEditor({ targetPage: page });
		await page.getByTestId("panel-tab-settings").click();
		await expect(page.getByTestId("api-keys-content")).toBeVisible();

		const envBadge = page.getByLabel(environmentOneLiner).first();
		await expect(envBadge).toBeVisible();
		await envBadge.hover();
		await expect(page.getByText(environmentOneLiner)).toBeVisible();

		await page.getByTestId("fal-api-key-input").fill("user-typed-value");
		await expect(page.getByText(/Saved locally/)).toBeVisible();
		await expect(page.getByText("environment")).toBeVisible();

		await page.getByTestId("save-api-keys-button").click();
		await expect(page.getByText(/overridden/)).toBeVisible();

		await page
			.getByRole("button", { name: /How API key resolution works/ })
			.click();
		await expect(page.getByText("env")).toBeVisible();
		await expect(page.getByText("app").first()).toBeVisible();
		await expect(page.getByText("cli")).toBeVisible();
		await expect(page.getByText("qcut-env")).toBeVisible();
	});
});

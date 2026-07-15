import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createTestProject, expect, test } from "./helpers/electron-helpers";
import { stubExportSaveDialog } from "./helpers/e2e-export-helpers";
import {
	installUserLibraryApiMock,
	readUserLibraryApiMockDocument,
} from "./helpers/user-library-api-mock";

const artifactDirectory = path.resolve(
	process.cwd(),
	"output/playwright/user-library-template-sync"
);
const customTemplateId = "e2e-cloud-recovery-story";
const customTemplateName = "Cloud Recovery Story";
const timelineTemplatesNamespace = "timeline-templates";

interface TemplateEnvelope {
	templates?: Array<Record<string, unknown>>;
}

interface SyncedLibraryEnvelope {
	items?: Array<Record<string, unknown>>;
	tombstones?: Record<string, number>;
}

async function timelineTemplateDocument({
	page,
}: {
	page: Parameters<typeof readUserLibraryApiMockDocument>[0]["page"];
}) {
	return readUserLibraryApiMockDocument({
		page,
		namespace: timelineTemplatesNamespace,
	});
}

test("exports, restores, and deletes a custom template through cloud sync", async ({
	electronApp,
	page,
}) => {
	test.setTimeout(120_000);
	await mkdir(artifactDirectory, { recursive: true });
	await installUserLibraryApiMock({ page });
	await electronApp.evaluate(({ ipcMain }) => {
		ipcMain.removeHandler("license:get-auth-token");
		ipcMain.handle("license:get-auth-token", async () => "e2e-session-token");
	});
	await createTestProject(page, "Cloud Template Recovery E2E");
	await page.getByTestId("templates-panel-tab").click();

	const workbench = page.getByTestId("timeline-template-workbench");
	await expect(workbench).toBeVisible();
	const exportedPath = path.join(
		artifactDirectory,
		"exported-built-in.qcut-template.json"
	);
	await rm(exportedPath, { force: true });
	await stubExportSaveDialog({ electronApp, outputPath: exportedPath });
	await workbench.getByTestId("export-timeline-template").click();
	await expect(page.getByText("Template exported")).toBeVisible();

	const exported = JSON.parse(
		await readFile(exportedPath, "utf8")
	) as TemplateEnvelope;
	const builtInTemplate = exported.templates?.[0];
	if (!builtInTemplate) throw new Error("Exported template is empty");
	const customTemplate = {
		...builtInTemplate,
		id: customTemplateId,
		name: customTemplateName,
		version: "1.0.0",
	};
	await page.getByLabel("Import timeline template").setInputFiles({
		name: "cloud-recovery.qcut-template.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify({ templates: [customTemplate] })),
	});
	await expect(page.getByText("1 custom template imported")).toBeVisible();
	await expect(workbench.locator("h3")).toHaveText(customTemplateName);
	await expect(workbench.getByTestId("delete-timeline-template")).toBeVisible();

	const syncButton = page.getByTestId("user-library-sync");
	await expect(syncButton).toBeEnabled();
	await syncButton.click();
	await expect(syncButton).toHaveAttribute("aria-label", "模板和预设已同步");
	await expect
		.poll(async () => {
			const document = await timelineTemplateDocument({ page });
			const payload = document?.payload as SyncedLibraryEnvelope | undefined;
			return (
				payload?.items?.some((item) => item.id === customTemplateId) ?? false
			);
		})
		.toBe(true);

	await page.evaluate(() => {
		localStorage.removeItem("qcut-timeline-templates-v1");
		localStorage.removeItem(
			"qcut-user-library-sync-v1:timeline-templates:default"
		);
		window.dispatchEvent(new Event("qcut:timeline-templates-changed"));
	});
	await expect(workbench.getByTestId("delete-timeline-template")).toBeHidden();
	await syncButton.click();
	await workbench
		.getByRole("button", { name: new RegExp(customTemplateName) })
		.click();
	await expect(workbench.locator("h3")).toHaveText(customTemplateName);
	await expect(workbench.getByTestId("delete-timeline-template")).toBeVisible();
	await page.screenshot({
		path: path.join(artifactDirectory, "01-custom-template-restored.png"),
		animations: "disabled",
	});

	await workbench.getByTestId("delete-timeline-template").click();
	await expect(page.getByText("Custom template deleted")).toBeVisible();
	await expect
		.poll(async () => {
			const document = await timelineTemplateDocument({ page });
			const payload = document?.payload as SyncedLibraryEnvelope | undefined;
			return {
				hasItem:
					payload?.items?.some((item) => item.id === customTemplateId) ?? false,
				hasTombstone: Boolean(payload?.tombstones?.[customTemplateId]),
			};
		})
		.toEqual({ hasItem: false, hasTombstone: true });
});

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import { ensureTextTabActive, expect, test } from "./helpers/electron-helpers";
import {
	TEXT_VISUAL_AUDIT_CASES,
	TEXT_VISUAL_AUDIT_ROOT,
	type TextVisualAuditCase,
} from "./text-visual-audit-cases";

const editorOutputDir = path.join(TEXT_VISUAL_AUDIT_ROOT, "editor");

async function loadAuditCase(page: Page, auditCase: TextVisualAuditCase) {
	await page.evaluate(
		({ element, captureTime }) => {
			const timelineStore = (window as any).__timelineStore;
			const playbackStore = (window as any).__playbackStore;
			if (!timelineStore || !playbackStore) {
				throw new Error("QCut debug stores are unavailable");
			}
			timelineStore.getState().clearTimeline();
			timelineStore.getState().addTextAtTime(element, 0);
			playbackStore.getState().seek(captureTime);
		},
		{ element: auditCase.element, captureTime: auditCase.captureTime }
	);
	await expect
		.poll(async () => page.getByTestId("timeline-element").count())
		.toBe(1);
	await page.waitForTimeout(120);
}

test.describe("Text visual audit", () => {
	test("captures every text effect in the editor preview", async ({ page }) => {
		await rm(editorOutputDir, { recursive: true, force: true });
		await mkdir(editorOutputDir, { recursive: true });

		await page.getByTestId("new-project-button").click();
		await page.waitForSelector('[data-testid="timeline-track"]');
		await ensureTextTabActive(page);
		await page.evaluate(() => {
			const projectStore = (window as any).__projectStore;
			const activeProject = projectStore?.getState().activeProject;
			if (projectStore && activeProject) {
				projectStore.setState({
					activeProject: {
						...activeProject,
						backgroundColor: "#355070",
					},
				});
			}
		});

		for (const auditCase of TEXT_VISUAL_AUDIT_CASES) {
			await loadAuditCase(page, auditCase);
			const groupDir = path.join(editorOutputDir, auditCase.group);
			await mkdir(groupDir, { recursive: true });
			await page.getByTestId("preview-panel").screenshot({
				path: path.join(groupDir, `${auditCase.id}.png`),
				animations: "disabled",
			});
		}
	});

	test("captures Yellow Pop animation and keyframe editor state", async ({
		page,
	}) => {
		await page.getByTestId("new-project-button").click();
		await page.waitForSelector('[data-testid="timeline-track"]');
		await ensureTextTabActive(page);
		await page.evaluate(() => {
			const projectStore = (window as any).__projectStore;
			const activeProject = projectStore?.getState().activeProject;
			if (projectStore && activeProject) {
				projectStore.setState({
					activeProject: { ...activeProject, backgroundColor: "#355070" },
				});
			}
		});
		const yellowPopKeyframe = TEXT_VISUAL_AUDIT_CASES.find(
			(auditCase) => auditCase.id === "yellow-pop-keyframe-start"
		);
		if (!yellowPopKeyframe) throw new Error("Yellow Pop audit case is missing");
		await loadAuditCase(page, {
			...yellowPopKeyframe,
			element: {
				...yellowPopKeyframe.element,
				keyframes: undefined,
				animationType: "none",
			},
		});
		await page.evaluate(() => {
			(window as any).__playbackStore.getState().seek(0.3);
		});

		await page.getByTestId("timeline-element").click();
		await page.getByTestId("panel-tab-properties").click();
		const properties = page.getByTestId("text-properties");
		await expect(properties).toBeVisible();
		await properties.getByLabel("Apply Yellow pop text preset").click();
		await properties.getByRole("button", { name: "Animation" }).click();
		await properties.getByRole("button", { name: "slide up" }).click();
		await properties.getByRole("button", { name: "Keyframes" }).click();
		await properties
			.getByRole("button", {
				name: "Add keyframe at current frame",
				exact: true,
			})
			.click();
		await expect(properties.getByText("(1 keyframe)")).toBeVisible();
		const stateDir = path.join(editorOutputDir, "state");
		await rm(stateDir, { recursive: true, force: true });
		await mkdir(stateDir, { recursive: true });
		await properties.screenshot({
			path: path.join(
				stateDir,
				"yellow-pop-animation-keyframes-properties.png"
			),
			animations: "disabled",
		});
		await page.getByTestId("preview-panel").screenshot({
			path: path.join(stateDir, "yellow-pop-animation-keyframes-preview.png"),
			animations: "disabled",
		});
	});
});

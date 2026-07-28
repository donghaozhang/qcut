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
			timelineStore.getState().setSelectedElements([]);
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
		test.setTimeout(180_000);
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
		test.setTimeout(120_000);
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
		await properties.getByTestId("text-animation-group-toggle").click();
		const stateDir = path.join(editorOutputDir, "state");
		await rm(stateDir, { recursive: true, force: true });
		await mkdir(stateDir, { recursive: true });
		const animationPanel = properties.getByTestId("text-animation-properties");
		await animationPanel.screenshot({
			path: path.join(stateDir, "text-animation-entrance-presets.png"),
			animations: "disabled",
		});
		const slideUpPreset = properties.getByTestId(
			"text-animation-card-entrance-slide-up"
		);
		await expect(slideUpPreset).toBeVisible();
		await slideUpPreset.click();
		await expect(slideUpPreset).toHaveAttribute("data-state", "on");
		await animationPanel.getByTestId("text-animation-phase-exit").click();
		await animationPanel.screenshot({
			path: path.join(stateDir, "text-animation-exit-presets.png"),
			animations: "disabled",
		});
		await animationPanel.getByTestId("text-animation-phase-loop").click();
		await animationPanel.screenshot({
			path: path.join(stateDir, "text-animation-loop-presets.png"),
			animations: "disabled",
		});
		await properties.getByTestId("text-keyframes-group-toggle").click();
		await properties.getByTestId("keyframe-add-current").click();
		await expect(properties.getByTestId("keyframe-count")).toContainText("1");
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

/**
 * Timeline right-click context menu — regression guard.
 *
 * Background: useTimelineZoom previously called setPointerCapture on every
 * pointerdown including mouse pointers, which redirected the post-mouseup
 * `contextmenu` event to the zoom container and suppressed Radix context
 * menus on timeline clips underneath. Fixed in commit 3930b8ce9 by scoping
 * the capture to touch pointers only.
 *
 * This test must use a real button:right click — synthetic dispatch on the
 * element bypasses the OS pointer pipeline that triggered the original bug,
 * so it would not catch a recurrence.
 */

import {
	test,
	expect,
	createTestProject,
	importTestVideo,
} from "./helpers/electron-helpers";

test.describe("Timeline Right-Click Context Menu", () => {
	test("right-clicking a clip opens the Radix context menu", async ({
		page,
	}) => {
		await createTestProject(page, "Context Menu Regression");
		await importTestVideo(page);

		// Drag the imported media into the timeline so we have a clip to
		// right-click. Mirrors the user flow.
		const mediaItem = page.locator('[data-testid="media-item"]').first();
		await expect(mediaItem).toBeVisible({ timeout: 10_000 });
		const timelineTrack = page.getByTestId("timeline-track").first();
		await mediaItem.dragTo(timelineTrack);

		const clip = page.locator('[data-testid="timeline-element"]').first();
		await expect(clip).toBeVisible({ timeout: 10_000 });

		await clip.click({ button: "right" });

		// Radix sets data-state="open" on the open content. Asserting on the
		// state attribute (not just visibility) tells us the menu actually
		// transitioned open rather than being a stale leftover.
		const menu = page.locator('[role="menu"][data-state="open"]');
		await expect(menu).toBeVisible({ timeout: 5_000 });

		// Concrete items must be present so we don't accept a hollow menu.
		// "Split at playhead" and "Duplicate …" are both unconditionally
		// rendered for media clips in timeline-element.tsx.
		await expect(menu.getByText(/Split at playhead/i)).toBeVisible();
		await expect(menu.getByText(/Duplicate/i)).toBeVisible();

		// Close the menu so it doesn't leak into other tests in the same worker.
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden({ timeout: 2_000 });
	});
});

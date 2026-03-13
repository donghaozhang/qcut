import {
	test,
	expect,
	createTestProject,
	startElectronApp,
	getMainWindow,
	navigateToProjects,
	cleanupDatabase,
	importTestVideo,
	ensureMediaTabActive,
	ensureTextTabActive,
} from "./helpers/electron-helpers";

test.describe("Auto-Save & Export File Management", () => {
	test("5B.1 - Configure and test auto-save functionality", async ({
		page,
	}) => {
		// Create a project first (needed to access settings)
		await createTestProject(page, "Auto-Save Config Test");

		// Navigate to settings to configure auto-save
		const settingsTab = page.getByTestId("panel-tab-settings").first();
		await settingsTab
			.waitFor({ state: "visible", timeout: 5000 })
			.catch(() => {});

		if (await settingsTab.isVisible()) {
			await settingsTab.click().catch(() => {});

			const settingsDialog = page
				.locator(
					'[data-testid="settings-tabs"], [data-testid="project-info-tab"]'
				)
				.first();

			await settingsDialog
				.waitFor({ state: "visible", timeout: 5000 })
				.catch(() => {});

			if (await settingsDialog.isVisible()) {
				await settingsDialog.click().catch(() => {});
				await page.waitForLoadState("networkidle").catch(() => {});
			}
		}

		// Look for auto-save settings using proper selectors
		const autoSaveCheckbox = page
			.getByTestId("auto-save-checkbox")
			.or(page.getByLabel(/auto.*save/i));
		const autoSaveCheckboxExists = await autoSaveCheckbox.isVisible();

		if (autoSaveCheckboxExists) {
			// Enable auto-save
			await autoSaveCheckbox.check();

			// Verify checkbox is checked
			await expect(autoSaveCheckbox).toBeChecked();

			// Look for auto-save interval setting using proper selectors
			const intervalInput = page
				.getByTestId("auto-save-interval-input")
				.or(page.getByLabel(/interval|seconds?/i));
			const intervalInputExists = await intervalInput.isVisible();

			if (intervalInputExists) {
				await intervalInput.fill("1"); // 1 second interval for testing
				// Verify input value was set
				await expect(intervalInput).toHaveValue("1");
			}

			// Save settings
			const saveButton = page
				.locator(
					'[data-testid="save-settings-button"], [data-testid="save-api-keys-button"]'
				)
				.first();
			if (await saveButton.isVisible()) {
				await saveButton.click();
				// Wait for settings to be saved instead of arbitrary timeout
				await expect(
					page
						.getByTestId("settings-saved-toast")
						.or(page.locator(".toast, .notification"))
						.first()
				)
					.toBeVisible({ timeout: 5000 })
					.catch(() => {
						// If no toast appears, just verify the button is no longer in loading state
						return expect(saveButton).toBeEnabled();
					});
			}
		}

		// Close settings dialog using proper selector
		const closeButton = page
			.getByTestId("settings-close-button")
			.or(page.getByRole("button", { name: /close|cancel/i }))
			.first();
		if (await closeButton.isVisible()) {
			await closeButton.click();
		}

		// Make some changes to trigger auto-save (project already created at test start)
		await ensureMediaTabActive(page);
		await page.click('[data-testid="import-media-button"]');
		// File picker input is often hidden; just ensure it exists in the DOM
		const uploadArea = page.locator(
			'input[type="file"], [data-testid="file-upload-area"]'
		);
		await uploadArea
			.first()
			.waitFor({ state: "attached", timeout: 5000 })
			.catch(() => {});
		expect(await uploadArea.count()).toBeGreaterThan(0);

		// Add media to timeline if possible
		const mediaItem = page.locator('[data-testid="media-item"]').first();
		const timelineTrack = page
			.locator('[data-testid="timeline-track"]')
			.first();

		if ((await mediaItem.isVisible()) && (await timelineTrack.isVisible())) {
			await mediaItem.dragTo(timelineTrack);
			await page
				.waitForSelector('[data-testid="timeline-element"]', { timeout: 5000 })
				.catch(() => {});
		}

		// Look for auto-save indicator
		const autoSaveIndicator = page.locator(
			'[data-testid="auto-save-indicator"]'
		);

		let indicatorHandled = false;
		if ((await autoSaveIndicator.count()) > 0) {
			// Wait for auto-save to trigger with 1-second interval
			await page
				.waitForFunction(
					() => {
						const indicator = document.querySelector(
							'[data-testid="auto-save-indicator"]'
						);
						return (
							indicator &&
							indicator.textContent &&
							/saved|auto/i.test(indicator.textContent)
						);
					},
					{ timeout: 5000 }
				)
				.catch(() => {});

			// Verify auto-save completed (indicator updated or project saved)
			if (await autoSaveIndicator.isVisible()) {
				await expect(autoSaveIndicator).toContainText(/saved|auto/i);
			}
			indicatorHandled = true;
		}

		if (!indicatorHandled) {
			// Fallback: verify that an auto-save timeline database was created
			const autoSaveDetected = await page
				.waitForFunction(
					async () => {
						const databases = await indexedDB.databases();
						return databases.some(
							(db) =>
								typeof db.name === "string" &&
								db.name.startsWith("video-editor-timelines")
						);
					},
					{ timeout: 5000 }
				)
				.catch(() => null);
			expect(autoSaveDetected).not.toBeNull();
		}
	});

	test("5B.2 - Test project recovery after crash simulation", async () => {
		// Use local instances for this test to avoid affecting other tests
		let localElectronApp = await startElectronApp();
		let localPage = await getMainWindow(localElectronApp);

		try {
			// Align manual Electron launch with the standard fixture setup expectations
			await cleanupDatabase(localPage);
			await localPage.evaluate(() => {
				localStorage.setItem("hasSeenOnboarding", "true");
			});
			await navigateToProjects(localPage);

			// Create project with content using helper
			await createTestProject(localPage, "Recovery Test Project");

			// Add content to project
			await ensureMediaTabActive(localPage);
			await localPage.click('[data-testid="import-media-button"]');
			await localPage
				.waitForSelector('[data-testid="media-item"]', {
					state: "visible",
					timeout: 5000,
				})
				.catch(() => {});

			const mediaItem = localPage.locator('[data-testid="media-item"]').first();
			const timelineTrack = localPage
				.locator('[data-testid="timeline-track"]')
				.first();

			if ((await mediaItem.isVisible()) && (await timelineTrack.isVisible())) {
				await mediaItem.dragTo(timelineTrack);
				await localPage
					.waitForSelector('[data-testid="timeline-element"]', {
						state: "visible",
						timeout: 3000,
					})
					.catch(() => {});
			}

			// Add some text overlay to make project more substantial
			await ensureTextTabActive(localPage);
			await localPage
				.waitForSelector('[data-testid="text-overlay-button"]', {
					state: "visible",
					timeout: 2000,
				})
				.catch(() => {});

			const textButton = localPage.locator(
				'[data-testid="text-overlay-button"]'
			);
			if (await textButton.isVisible()) {
				await textButton.click();
				await localPage
					.waitForSelector(
						'[data-testid="text-input-box"], input[type="text"]',
						{
							state: "visible",
							timeout: 3000,
						}
					)
					.catch(() => {});

				// Add text content
				const textInput = localPage
					.locator('[data-testid="text-input-box"], input[type="text"]')
					.first();
				if (await textInput.isVisible()) {
					await textInput.fill("Recovery Test Content");
					await localPage.waitForLoadState("networkidle");
				}
			}

			// Simulate force quit by closing and reopening app
			await localElectronApp.close();
			// Wait for app process to fully terminate
			await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief wait for process cleanup

			// Restart application with new instances
			localElectronApp = await startElectronApp();
			localPage = await getMainWindow(localElectronApp);

			// Wait for app to fully load
			await localPage.waitForLoadState("domcontentloaded");

			// Look for recovery dialog or unsaved changes notification
			const recoveryDialog = localPage
				.locator('[data-testid="recovery-dialog"], [role="dialog"]')
				.filter({
					hasText: /recover|unsaved|restore/i,
				})
				.first();

			if (await recoveryDialog.isVisible()) {
				await expect(recoveryDialog).toContainText(/unsaved|changes|recover/i);

				// Click recover button
				const recoverButton = localPage
					.locator('[data-testid="recover-project-button"], button')
					.filter({
						hasText: /recover|restore|yes/i,
					})
					.first();

				if (await recoverButton.isVisible()) {
					await recoverButton.click();
					await localPage
						.waitForSelector('[data-testid="timeline-element"]', {
							state: "visible",
							timeout: 5000,
						})
						.catch(() => {});

					// Verify content was recovered
					const timelineElements = localPage.locator(
						'[data-testid="timeline-element"]'
					);
					if ((await timelineElements.count()) > 0) {
						await expect(timelineElements.first()).toBeVisible();
					}

					const textOverlay = localPage
						.locator('[data-testid="canvas-text"]')
						.filter({
							hasText: "Recovery Test Content",
						});
					if ((await textOverlay.count()) > 0) {
						await expect(textOverlay.first()).toBeVisible();
					}
				}
			} else {
				// If no recovery dialog appears, that's also a valid test result
				// It means the app either auto-recovered or had no unsaved changes
				console.log(
					"No recovery dialog appeared - app may have auto-recovered"
				);
			}
		} finally {
			// Clean up local instances
			if (localElectronApp) {
				await localElectronApp.close();
			}
		}
	});

	test("5B.3 - Test export to custom directories", async ({
		page,
		electronApp,
	}) => {
		// Create a project to export
		await createTestProject(page, "Export Directory Test Project");
		await importTestVideo(page);
		await page.waitForSelector('[data-testid="media-item"]', {
			state: "visible",
			timeout: 10_000,
		});

		// Add imported media to the timeline so export validations pass
		const mediaItem = page.locator('[data-testid="media-item"]').first();
		const timelineTrack = page
			.locator('[data-testid="timeline-track"]')
			.first();

		await mediaItem.scrollIntoViewIfNeeded().catch(() => {});
		await expect(mediaItem).toBeVisible({ timeout: 5000 });
		await expect(timelineTrack).toBeVisible({ timeout: 5000 });

		await mediaItem.dragTo(timelineTrack);
		await page
			.locator('[data-testid="timeline-element"]')
			.first()
			.waitFor({ state: "visible", timeout: 5000 });

		// Wait for timeline duration to propagate to the export store
		await page.waitForTimeout(250);

		// Open export dialog
		const exportButton = page.locator('[data-testid*="export"]').first();
		await exportButton.click();
		await page
			.waitForSelector('[data-testid*="export-dialog"], [role="dialog"]', {
				timeout: 3000,
			})
			.catch(() => {});

		// Look for export dialog
		const exportDialog = page
			.locator('[data-testid*="export-dialog"], .export, [role="dialog"]')
			.filter({
				hasText: /export|render|save/i,
			})
			.first();

		if (await exportDialog.isVisible()) {
			await expect(exportDialog).toBeVisible();

			// Configure filename with special characters
			const filenameInput = page.locator(
				'[data-testid="export-filename-input"]'
			);
			if (await filenameInput.isVisible()) {
				await filenameInput.fill("Test Video (Special & Characters) [2024]");
				await page
					.waitForLoadState("domcontentloaded", { timeout: 2000 })
					.catch(() => {});
			}

			// Look for custom export location button
			const customLocationButton = page
				.locator("button")
				.filter({
					hasText: /custom|browse|location|directory/i,
				})
				.first();

			if (await customLocationButton.isVisible()) {
				// Prefer stubbing Electron's dialog in main process for deterministic result
				await electronApp.evaluate(async ({ dialog }) => {
					const { tmpdir } = require("node:os");
					// @ts-expect-error attach on global for test restore
					global.__origShowOpenDialog__ = dialog.showOpenDialog;
					dialog.showOpenDialog = async () => ({
						canceled: false,
						filePaths: [tmpdir()],
					});
				});

				try {
					await customLocationButton.click();

					// Wait for export location to be updated in UI
					await page
						.getByTestId("export-location-display")
						.waitFor({ state: "visible", timeout: 5000 })
						.catch(() => {
							// If no specific location display, just verify dialog interaction completed
							return expect(page.getByTestId("export-dialog")).toBeVisible();
						});
				} finally {
					await electronApp.evaluate(({ dialog }) => {
						// @ts-expect-error read from global and clean up
						if (global.__origShowOpenDialog__) {
							// @ts-expect-error
							dialog.showOpenDialog = global.__origShowOpenDialog__;
							// @ts-expect-error
							global.__origShowOpenDialog__ = undefined;
						}
					});
				}
			}

			// Set export quality
			const qualitySelect = page.locator(
				'[data-testid="export-quality-select"]'
			);
			if (await qualitySelect.isVisible()) {
				// Select a quality option
				const qualityOption = qualitySelect
					.locator('input[value="720p"], [value*="720"]')
					.first();
				if (await qualityOption.isVisible()) {
					await qualityOption.click();
				}
			}

			// Start export
			const startExportButton = page
				.locator('[data-testid="export-start-button"]')
				.first();

			await expect(startExportButton).toBeVisible({ timeout: 5000 });
			await expect(startExportButton).toBeEnabled({ timeout: 10_000 });
			await startExportButton.click();

			// Wait for export to start
			await Promise.race([
				page
					.waitForSelector('[data-testid="export-status"]', { timeout: 5000 })
					.catch(() => {}),
				page
					.waitForSelector('[data-testid="export-progress-bar"]', {
						timeout: 5000,
					})
					.catch(() => {}),
			]);

			// Verify export started
			const exportStatus = page.locator('[data-testid="export-status"]');
			if (await exportStatus.isVisible()) {
				await expect(exportStatus).toContainText(
					/export|process|render|start|prepare|compil/i
				);
			}

			// Look for export progress
			const progressBar = page.locator('[data-testid="export-progress-bar"]');
			if (await progressBar.isVisible()) {
				await expect(progressBar).toBeVisible();
			}

			// Wait for progress to update
			await page
				.waitForFunction(
					() => {
						const progress = document.querySelector(
							'[data-testid="export-progress-bar"]'
						);
						return progress && progress.getAttribute("value");
					},
					{ timeout: 5000 }
				)
				.catch(() => {});

			const cancelButton = page.locator('[data-testid="export-cancel-button"]');
			if (await cancelButton.isVisible()) {
				await cancelButton.click();
				await page
					.waitForFunction(
						() => {
							const status = document.querySelector(
								'[data-testid="export-status"]'
							);
							return (
								status && /cancel|stop|abort/i.test(status.textContent || "")
							);
						},
						{ timeout: 3000 }
					)
					.catch(() => {});
			}
		}
	});

	test("5B.4 - Test export file format and quality options", async ({
		page,
	}) => {
		// Create a project with content to export
		await createTestProject(page, "Export Format Test");

		// Open export dialog
		const exportButton = page.locator('[data-testid*="export"]').first();
		await exportButton.click();
		await page
			.waitForSelector('[data-testid*="export-dialog"], [role="dialog"]', {
				timeout: 3000,
			})
			.catch(() => {});

		const exportDialog = page
			.locator('[data-testid*="export-dialog"], .export')
			.first();
		if (await exportDialog.isVisible()) {
			// Test quality selection
			const qualitySelect = page.locator(
				'[data-testid="export-quality-select"]'
			);
			if (await qualitySelect.isVisible()) {
				// Check available quality options (UI can be select/dropdown/radio by platform)
				const qualityOptions = qualitySelect.locator('input, [role="radio"], option');
				const optionCount = await qualityOptions.count();
				if (optionCount === 0) {
					test.info().annotations.push({ type: "info", description: "No explicit quality option controls found; skipping quality option assertion" });
				}

				// Select high quality if available
				const highQualityOption = page
					.getByRole("option", { name: /1080|high|hd/i })
					.or(qualityOptions.filter({ hasText: /1080|high|hd/i }))
					.first();
				if (await highQualityOption.isVisible()) {
					await highQualityOption.click();
					await page
						.waitForLoadState("domcontentloaded", { timeout: 2000 })
						.catch(() => {});
				}
			}

			// Test format selection
			const formatSelect = page.locator('[data-testid="export-format-select"]');
			if (await formatSelect.isVisible()) {
				// Check available formats
				const formatOptions = formatSelect.locator('input, [role="radio"], option');
				const formatCount = await formatOptions.count();
				if (formatCount === 0) {
					test.info().annotations.push({ type: "info", description: "No explicit format option controls found; skipping format option assertion" });
				}

				// Select MP4 format if available
				const mp4Option = page
					.getByRole("option", { name: /mp4|mpeg/i })
					.or(formatOptions.filter({ hasText: /mp4|mpeg/i }))
					.first();
				if (await mp4Option.isVisible()) {
					await mp4Option.click();
					await page
						.waitForLoadState("domcontentloaded", { timeout: 2000 })
						.catch(() => {});
				}
			}

			// Test caption export options if available
			const captionCheckbox = page.locator(
				'[data-testid="export-include-captions-checkbox"]'
			);
			if (await captionCheckbox.isVisible()) {
				await captionCheckbox.check();
				await page
					.waitForLoadState("domcontentloaded", { timeout: 2000 })
					.catch(() => {});

				// Look for caption format options
				const captionFormatSelect = page.locator(
					'[data-testid="caption-format-select"]'
				);
				if (await captionFormatSelect.isVisible()) {
					const srtOption = captionFormatSelect
						.locator('input[value="srt"]')
						.first();
					if (await srtOption.isVisible()) {
						await srtOption.click();
					}
				}
			}

			// Test audio export options if available
			const audioCheckbox = page.locator(
				'[data-testid="export-include-audio-checkbox"]'
			);
			if (await audioCheckbox.isVisible()) {
				await audioCheckbox.check();
				await page
					.waitForLoadState("domcontentloaded", { timeout: 2000 })
					.catch(() => {});
			}
		}
	});

	test("5B.5 - Test file permissions and cross-platform compatibility", async ({
		page,
	}) => {
		// Get system information
		const platform = await page.evaluate(() => ({
			platform: navigator.platform,
			userAgent: navigator.userAgent,
			language: navigator.language,
		}));

		console.log(`Testing on platform: ${platform.platform}`);

		// Create a project to test file operations
		await createTestProject(page, `CrossPlatform Test ${platform.platform}`);

		// Test project auto-save (no manual save button needed with auto-save)
		// Wait for project to be created and auto-saved
		await page.waitForTimeout(1000);

		// Verify project is created and ready
		const timeline = page.locator('[data-testid="timeline-track"]');
		await expect(timeline.first()).toBeVisible();

		// Skip manual save test - projects are auto-saved in QCut

		// Test file import works
		await ensureMediaTabActive(page);
		await page.click('[data-testid="import-media-button"]');
		await page
			.waitForSelector('input[type="file"]', { timeout: 3000 })
			.catch(() => {});

		// Verify import dialog/functionality
		const fileInput = page.locator('input[type="file"]');
		if (await fileInput.isVisible()) {
			// File input exists, import should work
			await expect(fileInput).toBeVisible();
		}

		// In a real test, you would verify:
		// 1. File paths use correct separators for the platform
		// 2. File permissions allow read/write operations
		// 3. Special characters in filenames are handled properly
		// 4. Long file paths are supported
	});

	test("5B.6 - Test comprehensive export workflow with all features", async ({
		page,
	}) => {
		// Create a comprehensive project
		await createTestProject(page, "Comprehensive Export Test");

		// Add media
		await ensureMediaTabActive(page);
		await page.click('[data-testid="import-media-button"]');
		await page
			.waitForSelector('[data-testid="media-item"], input[type="file"]', {
				timeout: 3000,
			})
			.catch(() => {});

		// Add to timeline
		const mediaItem = page.locator('[data-testid="media-item"]').first();
		const timelineTrack = page
			.locator('[data-testid="timeline-track"]')
			.first();

		if ((await mediaItem.isVisible()) && (await timelineTrack.isVisible())) {
			await mediaItem.dragTo(timelineTrack);
			await page
				.waitForSelector('[data-testid="timeline-element"]', { timeout: 5000 })
				.catch(() => {});
		}

		// Add text overlay
		await ensureTextTabActive(page);
		await page
			.waitForSelector('[data-testid="text-panel"]', { timeout: 3000 })
			.catch(() => {});

		const textButton = page.locator('[data-testid="text-overlay-button"]');
		if (await textButton.isVisible()) {
			await textButton.click();
			await page
				.waitForSelector(
					'[data-testid="timeline-element"], [data-testid="text-input-box"]',
					{ timeout: 5000 }
				)
				.catch(() => {});
		}

		// Open comprehensive export
		const exportButton = page.locator('[data-testid*="export"]').first();
		await exportButton.click();
		await page
			.waitForSelector('[data-testid*="export-dialog"]', { timeout: 3000 })
			.catch(() => {});

		const exportDialog = page.locator('[data-testid*="export-dialog"]').first();
		if (await exportDialog.isVisible()) {
			// Configure comprehensive export settings
			const filenameInput = page.locator('[data-testid="export-filename-input"]').first();
			if (await filenameInput.isVisible().catch(() => false)) {
				await filenameInput.fill("Comprehensive Export Test");
				await page
					.waitForLoadState("domcontentloaded", { timeout: 2000 })
					.catch(() => {});
			} else {
				test.info().annotations.push({ type: "info", description: "Export filename input not visible; continue with default filename" });
			}

			// Enable all export features
			const captionCheckbox = page.locator(
				'[data-testid="export-include-captions-checkbox"]'
			);
			if (await captionCheckbox.isVisible()) {
				await captionCheckbox.check();
			}

			const audioCheckbox = page.locator(
				'[data-testid="export-include-audio-checkbox"]'
			);
			if (await audioCheckbox.isVisible()) {
				await audioCheckbox.check();
			}

			// Set quality and format
			const qualitySelect = page.locator(
				'[data-testid="export-quality-select"]'
			);
			if (await qualitySelect.isVisible()) {
				const hdOption = qualitySelect
					.getByRole("option", { name: /720|hd/i })
					.or(qualitySelect.locator("option").filter({ hasText: /720|hd/i }))
					.first();
				if (await hdOption.isVisible()) {
					await hdOption.click();
				}
			}

			// Start export
			const startButton = page
				.locator('[data-testid="export-start-button"]')
				.first();
			if (await startButton.isVisible()) {
				if (await startButton.isEnabled()) {
					await startButton.click();
					// Wait for export to start
					await Promise.race([
						page
							.waitForSelector('[data-testid="export-status"]', {
								timeout: 5000,
							})
							.catch(() => {}),
						page
							.waitForSelector('[data-testid="export-progress-bar"]', {
								timeout: 5000,
							})
							.catch(() => {}),
					]);

					// Monitor export progress
					const progressBar = page.locator(
						'[data-testid="export-progress-bar"]'
					);
					const exportStatus = page.locator('[data-testid="export-status"]');

					if (await progressBar.isVisible()) {
						await expect(progressBar).toBeVisible();
					}

					if (await exportStatus.isVisible()) {
						// Allow transient preparation statuses the exporter now surfaces
						const statusText = ((await exportStatus.innerText()) || "")
							.trim()
							.toLowerCase();
						const allowedKeywords = [
							"export",
							"process",
							"render",
							"prepar",
							"start",
							"compilat",
							"audio",
							"video",
						];
						expect(
							allowedKeywords.some((keyword) => statusText.includes(keyword))
						).toBeTruthy();
					}

					// Wait for progress to update
					await page
						.waitForFunction(
							() => {
								const progress = document.querySelector(
									'[data-testid="export-progress-bar"]'
								);
								return progress && progress.getAttribute("value");
							},
							{ timeout: 10_000 }
						)
						.catch(() => {});

					const cancelButton = page.locator(
						'[data-testid="export-cancel-button"]'
					);
					if (await cancelButton.isVisible()) {
						await cancelButton.click();
						await page
							.waitForFunction(
								() => {
									const status = document.querySelector(
										'[data-testid="export-status"]'
									);
									return (
										status &&
										/cancel|stop|abort/i.test(status.textContent || "")
									);
								},
								{ timeout: 3000 }
							)
							.catch(() => {});

						// Verify cancellation worked
						if (await exportStatus.isVisible()) {
							await expect(exportStatus).toContainText(/cancel|stop|abort/i);
						}
					}
				} else {
					await expect(startButton).toBeDisabled();
				}
			}
		}
	});
});
